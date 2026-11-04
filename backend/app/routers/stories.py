"""User Stories module: epics, stories with acceptance criteria, requirement coverage, Jira CSV export."""

from __future__ import annotations

import csv
import io
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activity, BacklogMeta, Epic, Project, Requirement, UserStory
from ..schemas.story import (
    STORY_POINTS,
    BacklogOverview,
    BacklogSuggestion,
    BulkStoriesInput,
    EpicCreate,
    EpicRead,
    EpicUpdate,
    StoryCreate,
    StoryRead,
    StoryUpdate,
)
from .analysis import build_suggest_context
from .projects import CURRENT_USER_ID, get_project_or_404, utc_now_iso
from .requirements import check_input_size, run_llm_json

router = APIRouter(prefix="/api/projects/{project_id}/stories", tags=["stories"])

PRIORITIES = ("must", "should", "could")
TYPE_EPIC_TITLE = {
    "functional": "Core functionality",
    "non-functional": "Quality & performance",
    "integration": "Integrations",
    "compliance": "Compliance & security",
}


# ─────────────────────────────── helpers ───────────────────────────────────


def log(db: Session, project: Project, message: str) -> None:
    now = utc_now_iso()
    project.updated_at = now
    db.add(Activity(
        id=f"a-{uuid.uuid4().hex[:8]}",
        project_id=project.id,
        actor_id=CURRENT_USER_ID,
        kind="story",
        message=message[:255],
        timestamp=now,
    ))


def meta(db: Session, project_id: str) -> BacklogMeta:
    row = db.get(BacklogMeta, project_id)
    if row is None:
        row = BacklogMeta(project_id=project_id, last_epic_number=0, last_story_number=0)
        db.add(row)
        db.flush()  # autoflush is off; without this a second lookup would add a duplicate
    return row


def next_epic_code(db: Session, project_id: str) -> str:
    row = meta(db, project_id)
    row.last_epic_number += 1
    return f"EPIC-{row.last_epic_number:03d}"


def next_story_code(db: Session, project_id: str) -> str:
    row = meta(db, project_id)
    row.last_story_number += 1
    return f"US-{row.last_story_number:03d}"


def sync_count(db: Session, project: Project) -> None:
    """Keep the project card's user-story count equal to the real number of stories."""
    db.flush()
    project.counts["userStories"] = db.query(UserStory).filter(UserStory.project_id == project.id).count()


def get_owned(db: Session, model, item_id: str, project_id: str, label: str):
    item = db.get(model, item_id)
    if item is None or item.project_id != project_id:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return item


def check_epic(db: Session, project_id: str, epic_id: str | None) -> str | None:
    if epic_id:
        get_owned(db, Epic, epic_id, project_id, "Epic")
    return epic_id or None


def check_requirement_ids(db: Session, project_id: str, ids: list[str]) -> list[str]:
    ids = list(dict.fromkeys(ids))
    if not ids:
        return ids
    found = {rid for (rid,) in db.query(Requirement.id).filter(Requirement.project_id == project_id, Requirement.id.in_(ids))}
    missing = [rid for rid in ids if rid not in found]
    if missing:
        raise HTTPException(status_code=422, detail=f"Unknown requirement id(s) for this project: {', '.join(missing)}")
    return ids


def new_story(db: Session, project_id: str, data: StoryCreate, epic_id: str | None) -> UserStory:
    now = utc_now_iso()
    return UserStory(
        id=f"us-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        epic_id=epic_id,
        code=next_story_code(db, project_id),
        title=data.title.strip(),
        persona=data.persona.strip(),
        goal=data.goal.strip(),
        benefit=data.benefit.strip(),
        acceptance_criteria=list(data.acceptance_criteria),
        priority=data.priority,
        story_points=data.story_points,
        status=data.status,
        requirement_ids=check_requirement_ids(db, project_id, data.requirement_ids),
        created_at=now,
        updated_at=now,
    )


def new_epic(db: Session, project_id: str, title: str, description: str = "") -> Epic:
    epic = Epic(
        id=f"ep-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        code=next_epic_code(db, project_id),
        title=title.strip()[:255],
        description=description.strip(),
    )
    db.add(epic)
    return epic


# ─────────────────────────────── overview ──────────────────────────────────


@router.get("", response_model=BacklogOverview)
def get_backlog(project_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    return BacklogOverview(
        epics=db.query(Epic).filter(Epic.project_id == project_id).order_by(Epic.code).all(),
        stories=db.query(UserStory).filter(UserStory.project_id == project_id).order_by(UserStory.code).all(),
    )


# ─────────────────────────────── epics ─────────────────────────────────────


@router.post("/epics", response_model=EpicRead, status_code=status.HTTP_201_CREATED)
def create_epic(project_id: str, payload: EpicCreate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    epic = new_epic(db, project_id, payload.title, payload.description)
    log(db, project, f"added epic {epic.code}: {epic.title}")
    db.commit()
    db.refresh(epic)
    return epic


@router.patch("/epics/{epic_id}", response_model=EpicRead)
def update_epic(project_id: str, epic_id: str, payload: EpicUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    epic = get_owned(db, Epic, epic_id, project_id, "Epic")
    updates = payload.model_dump(exclude_unset=True, by_alias=False)
    for key, value in updates.items():
        if value is not None:
            setattr(epic, key, value.strip())
    if updates:
        log(db, project, f"updated epic {epic.code}")
    db.commit()
    db.refresh(epic)
    return epic


@router.delete("/epics/{epic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_epic(project_id: str, epic_id: str, db: Session = Depends(get_db)):
    """Deletes the epic only; its stories stay in the backlog without an epic."""
    project = get_project_or_404(db, project_id)
    epic = get_owned(db, Epic, epic_id, project_id, "Epic")
    for story in db.query(UserStory).filter(UserStory.project_id == project_id, UserStory.epic_id == epic_id):
        story.epic_id = None
    db.delete(epic)
    log(db, project, f"deleted epic {epic.code}")
    db.commit()


# ─────────────────────────────── stories ───────────────────────────────────


@router.post("", response_model=StoryRead, status_code=status.HTTP_201_CREATED)
def create_story(project_id: str, payload: StoryCreate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    story = new_story(db, project_id, payload, check_epic(db, project_id, payload.epic_id))
    db.add(story)
    sync_count(db, project)
    log(db, project, f"added user story {story.code}: {story.title}")
    db.commit()
    db.refresh(story)
    return story


@router.patch("/{story_id}", response_model=StoryRead)
def update_story(project_id: str, story_id: str, payload: StoryUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    story = get_owned(db, UserStory, story_id, project_id, "User story")
    fields = payload.model_fields_set
    data = payload.model_dump(by_alias=False)
    changed = False
    for key in fields:
        value = data[key]
        if key == "epic_id":
            story.epic_id = check_epic(db, project_id, value)  # null / "" = remove from epic
        elif key == "story_points":
            story.story_points = value  # null = unestimated
        elif value is None:
            continue  # required columns: ignore explicit nulls
        elif key == "requirement_ids":
            story.requirement_ids = check_requirement_ids(db, project_id, value)
        elif isinstance(value, str):
            setattr(story, key, value.strip())
        else:
            setattr(story, key, value)
        changed = True
    if changed:
        story.updated_at = utc_now_iso()
        log(db, project, f"updated user story {story.code}")
    db.commit()
    db.refresh(story)
    return story


@router.delete("/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_story(project_id: str, story_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    story = get_owned(db, UserStory, story_id, project_id, "User story")
    db.delete(story)
    sync_count(db, project)
    log(db, project, f"deleted user story {story.code}")
    db.commit()


@router.post("/bulk", response_model=BacklogOverview, status_code=status.HTTP_201_CREATED)
def bulk_create(project_id: str, payload: BulkStoriesInput, db: Session = Depends(get_db)):
    """Save accepted suggestions: each group creates an epic (if titled) and its stories."""
    project = get_project_or_404(db, project_id)
    epics, stories = [], []
    for group in payload.groups:
        if not group.stories:
            continue
        epic = new_epic(db, project_id, group.title, group.description) if (group.title or "").strip() else None
        if epic:
            epics.append(epic)
        for item in group.stories:
            story = new_story(db, project_id, item, epic.id if epic else check_epic(db, project_id, item.epic_id))
            db.add(story)
            stories.append(story)
    if stories:
        sync_count(db, project)
        log(db, project, f"added {len(stories)} user stor{'y' if len(stories) == 1 else 'ies'} in {len(epics)} new epic(s)")
    db.commit()
    for row in epics + stories:
        db.refresh(row)
    return BacklogOverview(epics=epics, stories=stories)


@router.post("/from-requirements", response_model=BacklogOverview, status_code=status.HTTP_201_CREATED)
def from_requirements(project_id: str, db: Session = Depends(get_db)):
    """Create one draft story per requirement that no story covers yet, grouped into an epic per
    requirement type (reusing an epic with the same title). Deterministic: no AI involved."""
    project = get_project_or_404(db, project_id)
    covered = {rid for (ids,) in db.query(UserStory.requirement_ids).filter(UserStory.project_id == project_id) for rid in ids or []}
    pending = [
        r for r in db.query(Requirement).filter(Requirement.project_id == project_id).order_by(Requirement.code)
        if r.id not in covered
    ]
    if not pending:
        raise HTTPException(status_code=422, detail="Every requirement is already covered by at least one story.")

    existing = {e.title.lower(): e for e in db.query(Epic).filter(Epic.project_id == project_id)}
    new_epics, stories = [], []
    for req in pending:
        epic_title = TYPE_EPIC_TITLE.get(req.type, "Other")
        epic = existing.get(epic_title.lower())
        if epic is None:
            epic = new_epic(db, project_id, epic_title, f"Stories for {req.type} requirements.")
            existing[epic_title.lower()] = epic
            new_epics.append(epic)
        data = StoryCreate(
            title=req.title[:255],
            persona="user",
            goal=(req.description or req.title).strip(),
            benefit=(req.rationale or "").strip(),
            acceptance_criteria=[],
            priority=req.priority if req.priority in PRIORITIES else "should",
            requirement_ids=[req.id],
        )
        story = new_story(db, project_id, data, epic.id)
        db.add(story)
        stories.append(story)
    sync_count(db, project)
    log(db, project, f"created {len(stories)} draft user stor{'y' if len(stories) == 1 else 'ies'} from requirements")
    db.commit()
    for row in new_epics + stories:
        db.refresh(row)
    return BacklogOverview(epics=new_epics, stories=stories)


# ─────────────────────────────── export ────────────────────────────────────


@router.get("/export")
def export_csv(project_id: str, db: Session = Depends(get_db)):
    """CSV in a shape Jira / Azure DevOps CSV import accepts (epics first, then stories)."""
    project = get_project_or_404(db, project_id)
    epics = db.query(Epic).filter(Epic.project_id == project_id).order_by(Epic.code).all()
    stories = db.query(UserStory).filter(UserStory.project_id == project_id).order_by(UserStory.code).all()
    req_codes = {r.id: r.code for r in db.query(Requirement).filter(Requirement.project_id == project_id)}
    epic_by_id = {e.id: e for e in epics}

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Issue Id", "Issue Type", "Summary", "Description", "Priority", "Story Points", "Status", "Epic Link", "Acceptance Criteria", "Labels"])
    jira_priority = {"must": "High", "should": "Medium", "could": "Low"}
    for e in epics:
        writer.writerow([e.code, "Epic", e.title, e.description, "", "", "", "", "", ""])
    for s in stories:
        description = f"As a {s.persona or 'user'}, I want {s.goal or s.title}"
        if s.benefit:
            description += f", so that {s.benefit}"
        epic = epic_by_id.get(s.epic_id or "")
        writer.writerow([
            s.code,
            "Story",
            s.title,
            description,
            jira_priority.get(s.priority, "Medium"),
            s.story_points or "",
            s.status,
            epic.code if epic else "",
            "\n".join(f"- {c}" for c in s.acceptance_criteria or []),
            " ".join(req_codes[r] for r in s.requirement_ids or [] if r in req_codes),
        ])
    slug = re.sub(r"[^a-z0-9]+", "-", project.name.lower()).strip("-")[:60] or "project"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{slug}-user-stories.csv"'},
    )


# ─────────────────────────────── AI draft ──────────────────────────────────


SUGGEST_SYSTEM_PROMPT = (
    "You are a senior business analyst turning requirements into an agile backlog. "
    "Use only the material provided; do not invent features. Group stories into a few epics. "
    "Every story must be small enough for one sprint and trace back to the requirement IDs (e.g. REQ-003) it implements. "
    "Respond ONLY with a valid JSON object (no markdown, no extra text): "
    '{"epics": [{"title": str, "description": str, "stories": [{'
    '"title": str (short), "persona": str (who, e.g. "loan officer"), "goal": str (what they want), '
    '"benefit": str (why), "acceptanceCriteria": [str] (2-5 testable Given/When/Then statements), '
    '"priority": "must"|"should"|"could", "storyPoints": 1|2|3|5|8|13, "requirements": [str] (requirement codes)'
    "}]}]}. At most 8 epics and 40 stories in total."
)


@router.post("/suggest", response_model=BacklogSuggestion)
def suggest_backlog(project_id: str, db: Session = Depends(get_db)):
    """AI draft of epics and stories. Nothing is saved: the user reviews it, then saves via POST /bulk."""
    project = get_project_or_404(db, project_id)
    requirements = db.query(Requirement).filter(Requirement.project_id == project_id).all()
    if not requirements:
        raise HTTPException(status_code=422, detail="Add requirements to this project first; the AI writes stories from them.")
    context, _ = build_suggest_context(db, project)
    existing = db.query(UserStory).filter(UserStory.project_id == project_id).order_by(UserStory.code).all()
    if existing:
        context += "\n\nSTORIES ALREADY IN THE BACKLOG (do not repeat them):\n" + "\n".join(f"- {s.code} {s.title}" for s in existing)

    data = run_llm_json(SUGGEST_SYSTEM_PROMPT, f"Write the backlog from this material:\n\n{check_input_size(context)}")
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="AI reply was not a JSON object")

    id_by_code = {r.code.upper(): r.id for r in requirements}
    epics, total = [], 0
    for e in (data.get("epics") or [])[:8]:
        if not isinstance(e, dict) or not str(e.get("title", "")).strip():
            continue
        stories = []
        for s in e.get("stories") or []:
            if total >= 40 or not isinstance(s, dict) or not str(s.get("title", "")).strip():
                continue
            points = s.get("storyPoints")
            criteria = s.get("acceptanceCriteria") or []
            stories.append({
                "title": str(s["title"]).strip()[:255],
                "persona": str(s.get("persona", "")).strip()[:255],
                "goal": str(s.get("goal", "")).strip(),
                "benefit": str(s.get("benefit", "")).strip(),
                "acceptance_criteria": [str(c).strip() for c in criteria if str(c).strip()][:30] if isinstance(criteria, list) else [],
                "priority": s.get("priority") if s.get("priority") in PRIORITIES else "should",
                "story_points": points if points in STORY_POINTS else None,
                "requirement_ids": list(dict.fromkeys(
                    id_by_code[str(c).strip().upper()] for c in (s.get("requirements") or []) if str(c).strip().upper() in id_by_code
                )),
            })
            total += 1
        if stories:
            epics.append({"title": str(e["title"]).strip()[:255], "description": str(e.get("description", "")).strip(), "stories": stories})
    return BacklogSuggestion(epics=epics)
