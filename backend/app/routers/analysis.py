"""Business Analysis module: current/future state, gap analysis, stakeholders, process maps."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activity, AnalysisGap, BusinessAnalysis, Meeting, ProcessMap, Project, Requirement, Stakeholder
from ..schemas.analysis import (
    AnalysisOverview,
    AnalysisStateRead,
    AnalysisStateUpdate,
    AnalysisSuggestion,
    GapCreate,
    GapRead,
    GapUpdate,
    ProcessMapCreate,
    ProcessMapRead,
    ProcessMapUpdate,
    StakeholderCreate,
    StakeholderRead,
    StakeholderUpdate,
)
from .projects import CURRENT_USER_ID, get_project_or_404, utc_now_iso
from .requirements import check_input_size, run_llm_json

router = APIRouter(prefix="/api/projects/{project_id}/analysis", tags=["analysis"])

LEVELS = ("high", "medium", "low")


# ─────────────────────────────── helpers ───────────────────────────────────


def log(db: Session, project: Project, message: str) -> None:
    now = utc_now_iso()
    project.updated_at = now
    db.add(Activity(
        id=f"a-{uuid.uuid4().hex[:8]}",
        project_id=project.id,
        actor_id=CURRENT_USER_ID,
        kind="analysis",
        message=message[:255],
        timestamp=now,
    ))


def state_read(project_id: str, row: BusinessAnalysis | None) -> AnalysisStateRead:
    if row is None:
        return AnalysisStateRead(project_id=project_id)
    return AnalysisStateRead.model_validate(row)


def get_or_create_state(db: Session, project_id: str) -> BusinessAnalysis:
    row = db.get(BusinessAnalysis, project_id)
    if row is None:
        row = BusinessAnalysis(project_id=project_id, current_state="", future_state="", objectives="", last_gap_number=0)
        db.add(row)
        db.flush()  # session has autoflush off; without this a second lookup would create a duplicate row
    return row


def next_gap_code(db: Session, project_id: str) -> str:
    # A stored counter, so a deleted gap's code is never handed out again.
    row = get_or_create_state(db, project_id)
    row.last_gap_number = (row.last_gap_number or 0) + 1
    return f"GAP-{row.last_gap_number:03d}"


def check_requirement_ids(db: Session, project_id: str, ids: list[str]) -> list[str]:
    ids = list(dict.fromkeys(ids))  # de-duplicate, keep order
    if not ids:
        return ids
    found = {
        rid for (rid,) in db.query(Requirement.id).filter(Requirement.project_id == project_id, Requirement.id.in_(ids))
    }
    missing = [rid for rid in ids if rid not in found]
    if missing:
        raise HTTPException(status_code=422, detail=f"Unknown requirement id(s) for this project: {', '.join(missing)}")
    return ids


def get_owned(db: Session, model, item_id: str, project_id: str, label: str):
    item = db.get(model, item_id)
    if item is None or item.project_id != project_id:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return item


# ─────────────────────────────── overview + state ──────────────────────────


@router.get("", response_model=AnalysisOverview)
def get_analysis(project_id: str, db: Session = Depends(get_db)):
    """Everything the Business Analysis screen needs in one request."""
    get_project_or_404(db, project_id)
    return AnalysisOverview(
        state=state_read(project_id, db.get(BusinessAnalysis, project_id)),
        gaps=db.query(AnalysisGap).filter(AnalysisGap.project_id == project_id).order_by(AnalysisGap.code).all(),
        stakeholders=db.query(Stakeholder).filter(Stakeholder.project_id == project_id).order_by(Stakeholder.name).all(),
        process_maps=(
            db.query(ProcessMap)
            .filter(ProcessMap.project_id == project_id)
            .order_by(ProcessMap.kind, ProcessMap.name)
            .all()
        ),
    )


@router.put("/state", response_model=AnalysisStateRead)
def save_state(project_id: str, payload: AnalysisStateUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_or_create_state(db, project_id)
    updates = payload.model_dump(exclude_unset=True, by_alias=False)
    for key, value in updates.items():
        setattr(row, key, value or "")
    if updates:
        row.updated_at = utc_now_iso()
        log(db, project, "updated current / future state analysis")
    db.commit()
    db.refresh(row)
    return state_read(project_id, row)


# ─────────────────────────────── gaps ──────────────────────────────────────


@router.post("/gaps", response_model=GapRead, status_code=status.HTTP_201_CREATED)
def create_gap(project_id: str, payload: GapCreate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    gap = AnalysisGap(
        id=f"g-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        code=next_gap_code(db, project_id),
        area=payload.area.strip(),
        current=payload.current,
        target=payload.target,
        description=payload.description,
        impact=payload.impact,
        status=payload.status,
        requirement_ids=check_requirement_ids(db, project_id, payload.requirement_ids),
    )
    db.add(gap)
    log(db, project, f"added gap {gap.code}: {gap.area}")
    db.commit()
    db.refresh(gap)
    return gap


@router.post("/gaps/bulk", response_model=list[GapRead], status_code=status.HTTP_201_CREATED)
def bulk_create_gaps(project_id: str, payload: list[GapCreate], db: Session = Depends(get_db)):
    """Save the AI-suggested gaps the user accepted."""
    project = get_project_or_404(db, project_id)
    created = []
    for item in payload:
        gap = AnalysisGap(
            id=f"g-{uuid.uuid4().hex[:8]}",
            project_id=project_id,
            code=next_gap_code(db, project_id),
            area=item.area.strip(),
            current=item.current,
            target=item.target,
            description=item.description,
            impact=item.impact,
            status=item.status,
            requirement_ids=check_requirement_ids(db, project_id, item.requirement_ids),
        )
        db.add(gap)
        created.append(gap)
    if created:
        log(db, project, f"added {len(created)} gap(s) from AI suggestions")
    db.commit()
    for gap in created:
        db.refresh(gap)
    return created


@router.patch("/gaps/{gap_id}", response_model=GapRead)
def update_gap(project_id: str, gap_id: str, payload: GapUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    gap = get_owned(db, AnalysisGap, gap_id, project_id, "Gap")
    updates = payload.model_dump(exclude_unset=True, by_alias=False)
    if updates.get("requirement_ids") is not None:
        updates["requirement_ids"] = check_requirement_ids(db, project_id, updates["requirement_ids"])
    for key, value in updates.items():
        if value is None:
            continue  # required columns: ignore explicit nulls
        setattr(gap, key, value.strip() if key == "area" else value)
    if updates:
        log(db, project, f"updated gap {gap.code}")
    db.commit()
    db.refresh(gap)
    return gap


@router.delete("/gaps/{gap_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gap(project_id: str, gap_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    gap = get_owned(db, AnalysisGap, gap_id, project_id, "Gap")
    db.delete(gap)
    log(db, project, f"deleted gap {gap.code}")
    db.commit()


# ─────────────────────────────── stakeholders ──────────────────────────────


@router.post("/stakeholders", response_model=StakeholderRead, status_code=status.HTTP_201_CREATED)
def create_stakeholder(project_id: str, payload: StakeholderCreate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    data = payload.model_dump(by_alias=False)
    data["name"] = data["name"].strip()
    person = Stakeholder(id=f"sh-{uuid.uuid4().hex[:8]}", project_id=project_id, **data)
    db.add(person)
    log(db, project, f"added stakeholder {person.name}")
    db.commit()
    db.refresh(person)
    return person


@router.patch("/stakeholders/{stakeholder_id}", response_model=StakeholderRead)
def update_stakeholder(project_id: str, stakeholder_id: str, payload: StakeholderUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    person = get_owned(db, Stakeholder, stakeholder_id, project_id, "Stakeholder")
    updates = payload.model_dump(exclude_unset=True, by_alias=False)
    for key, value in updates.items():
        if value is None:
            continue
        setattr(person, key, value.strip() if key == "name" else value)
    if updates:
        log(db, project, f"updated stakeholder {person.name}")
    db.commit()
    db.refresh(person)
    return person


@router.delete("/stakeholders/{stakeholder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stakeholder(project_id: str, stakeholder_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    person = get_owned(db, Stakeholder, stakeholder_id, project_id, "Stakeholder")
    db.delete(person)
    log(db, project, f"removed stakeholder {person.name}")
    db.commit()


# ─────────────────────────────── process maps ──────────────────────────────


def steps_to_json(steps) -> list[dict]:
    return [s.model_dump(by_alias=True) for s in steps]


@router.post("/processes", response_model=ProcessMapRead, status_code=status.HTTP_201_CREATED)
def create_process(project_id: str, payload: ProcessMapCreate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    process = ProcessMap(
        id=f"pm-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        name=payload.name.strip(),
        kind=payload.kind,
        steps=steps_to_json(payload.steps),
        notes=payload.notes,
        updated_at=utc_now_iso(),
    )
    db.add(process)
    log(db, project, f"added {process.kind} process map: {process.name}")
    db.commit()
    db.refresh(process)
    return process


@router.patch("/processes/{process_id}", response_model=ProcessMapRead)
def update_process(project_id: str, process_id: str, payload: ProcessMapUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    process = get_owned(db, ProcessMap, process_id, project_id, "Process map")
    fields = payload.model_fields_set
    if "name" in fields and payload.name is not None:
        process.name = payload.name.strip()
    if "kind" in fields and payload.kind is not None:
        process.kind = payload.kind
    if "steps" in fields and payload.steps is not None:
        process.steps = steps_to_json(payload.steps)
    if "notes" in fields and payload.notes is not None:
        process.notes = payload.notes
    if fields:
        process.updated_at = utc_now_iso()
        log(db, project, f"updated process map: {process.name}")
    db.commit()
    db.refresh(process)
    return process


@router.delete("/processes/{process_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_process(project_id: str, process_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    process = get_owned(db, ProcessMap, process_id, project_id, "Process map")
    db.delete(process)
    log(db, project, f"deleted process map: {process.name}")
    db.commit()


# ─────────────────────────────── AI draft ──────────────────────────────────


SUGGEST_SYSTEM_PROMPT = (
    "You are a senior business analyst preparing a current-state / future-state and gap analysis "
    "for a client engagement. Use only the material provided; do not invent facts. "
    "Respond ONLY with a valid JSON object (no markdown, no extra text) with exactly these keys: "
    "currentState (string, 1-3 short paragraphs describing how the client works today and its problems), "
    "futureState (string, 1-3 short paragraphs describing the target situation once the solution is live), "
    "objectives (string, a few measurable business objectives, one per line), "
    "gaps (array of at most 12 objects, each with keys: "
    "area (string, short business area or capability name), "
    "current (string, how it works today), "
    "target (string, how it should work), "
    "description (string, what must change to close the gap), "
    "impact (one of: high, medium, low))."
)


def build_suggest_context(db: Session, project: Project) -> tuple[str, bool]:
    parts = [
        f"Project: {project.name}",
        f"Client: {project.client.get('name', '')} ({project.client.get('industry', '')})",
        f"Description: {project.description}",
    ]

    requirements = db.query(Requirement).filter(Requirement.project_id == project.id).order_by(Requirement.code).all()
    if requirements:
        parts.append("\nREQUIREMENTS:")
        for r in requirements:
            line = f"- {r.code} [{r.type}, {r.priority}] {r.title}"
            if r.description:
                line += f" — {r.description}"
            parts.append(line)

    meetings = db.query(Meeting).filter(Meeting.project_id == project.id).order_by(Meeting.started_at).all()
    for m in meetings:
        if m.summary:
            parts.append(f"\nMEETING SUMMARY ({m.title}):")
            for key, label in (("decisions", "Decision"), ("action_items", "Action"), ("open_questions", "Open question")):
                for item in m.summary.get(key, []) or []:
                    parts.append(f"- {label}: {item}")
        elif (m.transcript or "").strip():
            parts.append(f"\nMEETING TRANSCRIPT ({m.title}):\n{m.transcript.strip()}")

    existing = db.get(BusinessAnalysis, project.id)
    if existing and (existing.current_state or existing.future_state):
        parts.append(f"\nANALYST'S EXISTING NOTES:\nCurrent: {existing.current_state}\nFuture: {existing.future_state}")

    return "\n".join(parts), bool(requirements or meetings)


def clean_level(value) -> str:
    return value if value in LEVELS else "medium"


@router.post("/suggest", response_model=AnalysisSuggestion)
def suggest_analysis(project_id: str, db: Session = Depends(get_db)):
    """AI draft of current/future state, objectives and gaps. Nothing is saved: the user reviews it,
    then saves the state via PUT /state and the accepted gaps via POST /gaps/bulk."""
    project = get_project_or_404(db, project_id)
    context, has_material = build_suggest_context(db, project)
    if not has_material:
        raise HTTPException(
            status_code=422,
            detail="Add requirements or meetings to this project first; the AI drafts the analysis from them.",
        )

    data = run_llm_json(SUGGEST_SYSTEM_PROMPT, f"Prepare the analysis from this material:\n\n{check_input_size(context)}")
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="AI reply was not a JSON object")

    gaps = []
    for g in (data.get("gaps") or [])[:12]:
        if not isinstance(g, dict) or not str(g.get("area", "")).strip():
            continue
        gaps.append({
            "area": str(g.get("area", "")).strip()[:255],
            "current": str(g.get("current", "")),
            "target": str(g.get("target", "")),
            "description": str(g.get("description", "")),
            "impact": clean_level(g.get("impact")),
        })
    objectives = data.get("objectives", "")
    if isinstance(objectives, list):
        objectives = "\n".join(str(o) for o in objectives)
    return AnalysisSuggestion(
        current_state=str(data.get("currentState", "")),
        future_state=str(data.get("futureState", "")),
        objectives=str(objectives),
        gaps=gaps,
    )
