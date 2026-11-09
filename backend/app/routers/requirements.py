from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Activity, AnalysisGap, EstimateItem, Meeting, Requirement, Integration, SolutionComponent, SourceDocument, UserStory
from ..schemas.project import RequirementCreate, RequirementRead, RequirementUpdate
from ..services.llm import LLMError, call_llm, llm_enabled, llm_status
from .projects import get_project_or_404

router = APIRouter(prefix="/api", tags=["requirements"])

CURRENT_USER_ID = "u1"

VALID_TYPES = {"functional", "non-functional", "integration", "compliance"}
VALID_PRIORITIES = {"must", "should", "could"}
VALID_STATUSES = {"draft", "validated", "approved"}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


MAX_AI_INPUT_CHARS = 150_000  # ~40k tokens; well inside current model context windows


def next_req_code(db: Session, project_id: str) -> str:
    # Use the highest existing number, not the row count, so codes never repeat after a delete.
    highest = 0
    for (code,) in db.query(Requirement.code).filter(Requirement.project_id == project_id):
        digits = "".join(ch for ch in (code or "") if ch.isdigit())
        if digits:
            highest = max(highest, int(digits))
    return f"REQ-{highest + 1:03d}"


def touch(project) -> str:
    now = utc_now_iso()
    project.updated_at = now
    return now


def run_llm_json(system_prompt: str, user_prompt: str):
    """Call the LLM and parse a JSON reply; maps every failure to a clear HTTP error."""
    if not llm_enabled():
        raise HTTPException(status_code=422, detail="AI is not configured. Set LLM_PROVIDER and LLM_API_KEY in backend/.env.")
    try:
        raw = call_llm(system_prompt, user_prompt)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=f"AI call failed: {exc}") from exc
    text = (raw or "").strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"AI reply was not valid JSON: {exc}") from exc


def check_input_size(text: str) -> str:
    if len(text) > MAX_AI_INPUT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Text is too long for one AI request ({len(text):,} characters, limit {MAX_AI_INPUT_CHARS:,}). Split it into smaller files.",
        )
    return text


EXTRACT_SYSTEM_PROMPT = (
    "You are a business analyst extracting software requirements from client material. "
    "Respond ONLY with a valid JSON array (no markdown, no extra text). "
    "Each element must have exactly these keys: "
    "title (string, concise requirement statement), "
    "type (one of: functional, non-functional, integration, compliance), "
    "priority (one of: must, should, could), "
    "rationale (string, brief justification), "
    "quote (string, verbatim excerpt from the source that inspired this requirement). "
    "Extract a maximum of 20 requirements. "
    "Return an empty array [] if no requirements can be identified."
)


def extract_from_text(content: str, source_label: str) -> list[dict]:
    items = run_llm_json(EXTRACT_SYSTEM_PROMPT, f"Extract requirements from this {source_label}:\n\n{check_input_size(content)}")
    if not isinstance(items, list):
        raise HTTPException(status_code=502, detail="AI reply was not a JSON array")
    result = []
    for item in items[:20]:
        if not isinstance(item, dict):
            continue
        result.append({
            "title": str(item.get("title", "")).strip()[:255] or "Untitled requirement",
            "type": item.get("type") if item.get("type") in VALID_TYPES else "functional",
            "priority": item.get("priority") if item.get("priority") in VALID_PRIORITIES else "should",
            "rationale": str(item.get("rationale", "")),
            "quote": str(item.get("quote", "")),
        })
    return result


@router.get("/ai/status")
def ai_status() -> dict:
    """Lets the frontend enable or disable AI buttons."""
    return llm_status()


# ─────────────────────────────── CRUD ──────────────────────────────────────


@router.get("/projects/{project_id}/requirements", response_model=list[RequirementRead])
def list_requirements(
    project_id: str,
    type: str | None = Query(None),
    priority: str | None = Query(None),
    req_status: str | None = Query(None, alias="status"),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
):
    get_project_or_404(db, project_id)
    query = db.query(Requirement).filter(Requirement.project_id == project_id)

    if type:
        query = query.filter(Requirement.type == type)
    if priority:
        query = query.filter(Requirement.priority == priority)
    if req_status:
        query = query.filter(Requirement.status == req_status)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            Requirement.title.ilike(like) | Requirement.description.ilike(like)
        )

    return query.order_by(Requirement.code).all()


@router.post(
    "/projects/{project_id}/requirements",
    response_model=RequirementRead,
    status_code=status.HTTP_201_CREATED,
)
def create_requirement(
    project_id: str,
    payload: RequirementCreate,
    db: Session = Depends(get_db),
):
    project = get_project_or_404(db, project_id)

    if payload.type not in VALID_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid type: {payload.type}")
    if payload.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=422, detail=f"Invalid priority: {payload.priority}")
    if payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status: {payload.status}")

    code = next_req_code(db, project_id)
    now = utc_now_iso()
    req = Requirement(
        id=f"r-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        code=code,
        title=payload.title.strip(),
        type=payload.type,
        priority=payload.priority,
        status=payload.status,
        description=payload.description,
        rationale=payload.rationale,
        source_ids=payload.source_ids or [],
        notes=payload.notes,
    )
    db.add(req)
    project.counts["requirements"] = project.counts.get("requirements", 0) + 1
    project.updated_at = now
    db.add(Activity(
        id=f"a-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        actor_id=CURRENT_USER_ID,
        kind="requirement",
        message=f"created requirement {code}: {payload.title.strip()}",
        timestamp=now,
    ))
    db.commit()
    db.refresh(req)
    return req


@router.get("/projects/{project_id}/requirements/{req_id}", response_model=RequirementRead)
def get_requirement(project_id: str, req_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    req = db.get(Requirement, req_id)
    if req is None or req.project_id != project_id:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return req


@router.patch("/projects/{project_id}/requirements/{req_id}", response_model=RequirementRead)
def patch_requirement(
    project_id: str,
    req_id: str,
    payload: RequirementUpdate,
    db: Session = Depends(get_db),
):
    get_project_or_404(db, project_id)
    req = db.get(Requirement, req_id)
    if req is None or req.project_id != project_id:
        raise HTTPException(status_code=404, detail="Requirement not found")

    updates = payload.model_dump(exclude_unset=True, by_alias=False)

    if "type" in updates and updates["type"] not in VALID_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid type: {updates['type']}")
    if "priority" in updates and updates["priority"] not in VALID_PRIORITIES:
        raise HTTPException(status_code=422, detail=f"Invalid priority: {updates['priority']}")
    if "status" in updates and updates["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status: {updates['status']}")

    for key, value in updates.items():
        setattr(req, key, value)
    if updates:
        db.add(Activity(
            id=f"a-{uuid.uuid4().hex[:8]}",
            project_id=project_id,
            actor_id=CURRENT_USER_ID,
            kind="requirement",
            message=f"updated requirement {req.code}",
            timestamp=touch(req.project),
        ))

    db.commit()
    db.refresh(req)
    return req


@router.delete("/projects/{project_id}/requirements/{req_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_requirement(project_id: str, req_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    req = db.get(Requirement, req_id)
    if req is None or req.project_id != project_id:
        raise HTTPException(status_code=404, detail="Requirement not found")

    now = utc_now_iso()
    db.delete(req)
    # Drop the link from any analysis gap that pointed at this requirement.
    for gap in db.query(AnalysisGap).filter(AnalysisGap.project_id == project_id):
        if req_id in (gap.requirement_ids or []):
            gap.requirement_ids = [rid for rid in gap.requirement_ids if rid != req_id]
    for model in (UserStory, SolutionComponent, Integration, EstimateItem):
        for row in db.query(model).filter(model.project_id == project_id):
            if req_id in (row.requirement_ids or []):
                row.requirement_ids = [rid for rid in row.requirement_ids if rid != req_id]
    project.counts["requirements"] = max(0, project.counts.get("requirements", 1) - 1)
    project.updated_at = now
    db.add(Activity(
        id=f"a-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        actor_id=CURRENT_USER_ID,
        kind="requirement",
        message=f"deleted requirement {req.code}",
        timestamp=now,
    ))
    db.commit()


@router.post("/projects/{project_id}/requirements/{req_id}/approve", response_model=RequirementRead)
def approve_requirement(project_id: str, req_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    req = db.get(Requirement, req_id)
    if req is None or req.project_id != project_id:
        raise HTTPException(status_code=404, detail="Requirement not found")

    req.status = "approved"
    now = touch(req.project)
    db.add(Activity(
        id=f"a-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        actor_id=CURRENT_USER_ID,
        kind="requirement",
        message=f"approved requirement {req.code}: {req.title}",
        timestamp=now,
    ))
    db.commit()
    db.refresh(req)
    return req


@router.post("/projects/{project_id}/requirements/{req_id}/validate", response_model=RequirementRead)
def validate_requirement(project_id: str, req_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    req = db.get(Requirement, req_id)
    if req is None or req.project_id != project_id:
        raise HTTPException(status_code=404, detail="Requirement not found")

    req.status = "validated"
    now = touch(req.project)
    db.add(Activity(
        id=f"a-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        actor_id=CURRENT_USER_ID,
        kind="requirement",
        message=f"validated requirement {req.code}: {req.title}",
        timestamp=now,
    ))
    db.commit()
    db.refresh(req)
    return req


# ─────────────────────────────── Bulk create ──────────────────────────────


@router.post(
    "/projects/{project_id}/requirements/bulk",
    response_model=list[RequirementRead],
    status_code=status.HTTP_201_CREATED,
)
def bulk_create_requirements(
    project_id: str,
    payload: list[RequirementCreate],
    db: Session = Depends(get_db),
):
    project = get_project_or_404(db, project_id)
    now = utc_now_iso()
    created = []

    for item in payload:
        if item.type not in VALID_TYPES:
            raise HTTPException(status_code=422, detail=f"Invalid type: {item.type}")
        if item.priority not in VALID_PRIORITIES:
            raise HTTPException(status_code=422, detail=f"Invalid priority: {item.priority}")
        if item.status not in VALID_STATUSES:
            raise HTTPException(status_code=422, detail=f"Invalid status: {item.status}")

        code = next_req_code(db, project_id)
        req = Requirement(
            id=f"r-{uuid.uuid4().hex[:8]}",
            project_id=project_id,
            code=code,
            title=item.title.strip(),
            type=item.type,
            priority=item.priority,
            status=item.status,
            description=item.description,
            rationale=item.rationale,
            source_ids=item.source_ids or [],
            notes=item.notes,
        )
        db.add(req)
        project.counts["requirements"] = project.counts.get("requirements", 0) + 1
        created.append(req)
        # Flush so next_req_code sees the new row
        db.flush()

    project.updated_at = now
    db.add(Activity(
        id=f"a-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        actor_id=CURRENT_USER_ID,
        kind="requirement",
        message=f"bulk-created {len(created)} requirement(s)",
        timestamp=now,
    ))
    db.commit()
    for req in created:
        db.refresh(req)
    return created


# ─────────────────────────────── AI: Extract ──────────────────────────────


@router.post("/projects/{project_id}/sources/{source_id}/extract-requirements")
def extract_requirements_from_source(
    project_id: str,
    source_id: str,
    db: Session = Depends(get_db),
):
    get_project_or_404(db, project_id)
    source = db.get(SourceDocument, source_id)
    if source is None or source.project_id != project_id:
        raise HTTPException(status_code=404, detail="Source document not found")

    if not llm_enabled():
        raise HTTPException(status_code=422, detail="LLM not configured")

    # Find file on disk
    from ..config import settings as cfg

    project_dir = cfg.uploads_dir / project_id
    candidates = [
        project_dir / f"{source.id}_{source.name}",
        project_dir / source.name,
    ]
    file_path: Path | None = None
    for c in candidates:
        if c.exists():
            file_path = c
            break
    if file_path is None:
        matches = list(project_dir.glob(f"{source.id}_*"))
        if matches:
            file_path = matches[0]

    if file_path is None or not file_path.exists():
        raise HTTPException(status_code=404, detail="Source file not found on disk")

    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read file: {exc}") from exc

    return extract_from_text(content, f"document ({source.name})")


@router.post("/meetings/{meeting_id}/extract-requirements")
def extract_requirements_from_meeting(meeting_id: str, db: Session = Depends(get_db)):
    """Suggest requirements from a meeting transcript. Nothing is saved: the user reviews
    the suggestions and saves the accepted ones via POST .../requirements/bulk."""
    meeting = db.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not (meeting.transcript or "").strip():
        raise HTTPException(status_code=422, detail="Meeting has no transcript")
    return extract_from_text(meeting.transcript, f"meeting transcript ({meeting.title})")


# ─────────────────────────────── AI: Summarize meeting ────────────────────


@router.post("/meetings/{meeting_id}/summarize")
def summarize_meeting(meeting_id: str, db: Session = Depends(get_db)):
    meeting = db.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if not llm_enabled():
        raise HTTPException(status_code=422, detail="LLM not configured")

    if not meeting.transcript or not meeting.transcript.strip():
        raise HTTPException(status_code=422, detail="Meeting has no transcript to summarize")

    summary = run_llm_json(
        (
            "You are an expert meeting facilitator summarizing a client meeting transcript. "
            "Respond ONLY with a valid JSON object (no markdown, no extra text) with exactly these keys: "
            "decisions (array of strings - key decisions made), "
            "action_items (array of strings - specific tasks with owners if mentioned), "
            "open_questions (array of strings - unresolved questions or items needing follow-up). "
            "Each array may be empty if nothing relevant was found."
        ),
        f"Summarize the following meeting transcript:\n\n{check_input_size(meeting.transcript)}",
    )
    if not isinstance(summary, dict):
        raise HTTPException(status_code=502, detail="AI reply was not a JSON object")
    result = {
        "decisions": [str(d) for d in summary.get("decisions", [])],
        "action_items": [str(a) for a in summary.get("action_items", [])],
        "open_questions": [str(q) for q in summary.get("open_questions", [])],
    }

    # Persist summary
    meeting.summary = result
    db.commit()

    return result
