"""Solution Design module: technical approach, architecture components, integrations and decision records."""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activity, DesignDecision, Integration, Project, Requirement, SolutionComponent, SolutionDesign
from ..schemas.solution import (
    ComponentCreate,
    ComponentRead,
    ComponentUpdate,
    DecisionCreate,
    DecisionRead,
    DecisionUpdate,
    DesignRead,
    DesignUpdate,
    IntegrationCreate,
    IntegrationRead,
    IntegrationUpdate,
    SolutionBulkInput,
    SolutionOverview,
    SolutionSuggestion,
)
from .analysis import build_suggest_context
from .projects import CURRENT_USER_ID, get_project_or_404, utc_now_iso
from .requirements import check_input_size, run_llm_json

router = APIRouter(prefix="/api/projects/{project_id}/solution", tags=["solution"])

HOSTING_LABEL = {"cloud": "Cloud", "on-premise": "On-premise", "hybrid": "Hybrid", "saas": "SaaS", "tbd": "To be decided"}
LAYER_LABEL = {"channel": "Channels & front-ends", "service": "Application services", "data": "Data", "platform": "Platform & infrastructure"}


# ─────────────────────────────── helpers ───────────────────────────────────


def log(db: Session, project: Project, message: str) -> None:
    now = utc_now_iso()
    project.updated_at = now
    db.add(Activity(
        id=f"a-{uuid.uuid4().hex[:8]}",
        project_id=project.id,
        actor_id=CURRENT_USER_ID,
        kind="document",
        message=message[:255],
        timestamp=now,
    ))


def get_or_create_design(db: Session, project_id: str) -> SolutionDesign:
    row = db.get(SolutionDesign, project_id)
    if row is None:
        row = SolutionDesign(
            project_id=project_id, overview="", hosting="tbd", architecture_style="",
            technical_approach="", nfr_approach="", last_decision_number=0,
        )
        db.add(row)
        db.flush()  # autoflush is off; without this a second lookup would add a duplicate
    return row


def design_read(project_id: str, row: SolutionDesign | None) -> DesignRead:
    return DesignRead(project_id=project_id) if row is None else DesignRead.model_validate(row)


def next_decision_code(db: Session, project_id: str) -> str:
    row = get_or_create_design(db, project_id)
    row.last_decision_number = (row.last_decision_number or 0) + 1
    return f"ADR-{row.last_decision_number:03d}"


def check_requirement_ids(db: Session, project_id: str, ids: list[str]) -> list[str]:
    ids = list(dict.fromkeys(ids))
    if not ids:
        return ids
    found = {rid for (rid,) in db.query(Requirement.id).filter(Requirement.project_id == project_id, Requirement.id.in_(ids))}
    missing = [rid for rid in ids if rid not in found]
    if missing:
        raise HTTPException(status_code=422, detail=f"Unknown requirement id(s) for this project: {', '.join(missing)}")
    return ids


def get_owned(db: Session, model, item_id: str, project_id: str, label: str):
    item = db.get(model, item_id)
    if item is None or item.project_id != project_id:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return item


def apply_updates(db: Session, project_id: str, row, payload, strip: tuple[str, ...]) -> bool:
    """Copy the fields the client sent; explicit nulls are ignored (all columns are required)."""
    data = payload.model_dump(by_alias=False)
    changed = False
    for key in payload.model_fields_set:
        value = data[key]
        if value is None:
            continue
        if key == "requirement_ids":
            value = check_requirement_ids(db, project_id, value)
        elif key in strip:
            value = value.strip()
        setattr(row, key, value)
        changed = True
    return changed


def new_component(db: Session, project_id: str, p: ComponentCreate) -> SolutionComponent:
    return SolutionComponent(
        id=f"sc-{uuid.uuid4().hex[:8]}", project_id=project_id, name=p.name.strip(), layer=p.layer,
        technology=p.technology.strip(), description=p.description, is_new=p.is_new,
        requirement_ids=check_requirement_ids(db, project_id, p.requirement_ids),
    )


def new_integration(db: Session, project_id: str, p: IntegrationCreate) -> Integration:
    return Integration(
        id=f"int-{uuid.uuid4().hex[:8]}", project_id=project_id, name=p.name.strip(),
        external_system=p.external_system.strip(), direction=p.direction, protocol=p.protocol,
        frequency=p.frequency, data=p.data, status=p.status,
        requirement_ids=check_requirement_ids(db, project_id, p.requirement_ids),
    )


def new_decision(db: Session, project_id: str, p: DecisionCreate) -> DesignDecision:
    return DesignDecision(
        id=f"adr-{uuid.uuid4().hex[:8]}", project_id=project_id, code=next_decision_code(db, project_id),
        title=p.title.strip(), context=p.context, decision=p.decision, alternatives=p.alternatives,
        consequences=p.consequences, status=p.status, updated_at=utc_now_iso(),
    )


def load_all(db: Session, project_id: str):
    return (
        db.query(SolutionComponent).filter(SolutionComponent.project_id == project_id).order_by(SolutionComponent.layer, SolutionComponent.name).all(),
        db.query(Integration).filter(Integration.project_id == project_id).order_by(Integration.name).all(),
        db.query(DesignDecision).filter(DesignDecision.project_id == project_id).order_by(DesignDecision.code).all(),
    )


# ─────────────────────────────── overview + design ─────────────────────────


@router.get("", response_model=SolutionOverview)
def get_solution(project_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    components, integrations, decisions = load_all(db, project_id)
    return SolutionOverview(
        design=design_read(project_id, db.get(SolutionDesign, project_id)),
        components=components,
        integrations=integrations,
        decisions=decisions,
    )


@router.put("/design", response_model=DesignRead)
def save_design(project_id: str, payload: DesignUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_or_create_design(db, project_id)
    if apply_updates(db, project_id, row, payload, strip=("architecture_style",)):
        row.updated_at = utc_now_iso()
        log(db, project, "updated the solution approach")
    db.commit()
    db.refresh(row)
    return design_read(project_id, row)


# ─────────────────────────────── components ────────────────────────────────


@router.post("/components", response_model=ComponentRead, status_code=status.HTTP_201_CREATED)
def create_component(project_id: str, payload: ComponentCreate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = new_component(db, project_id, payload)
    db.add(row)
    log(db, project, f"added solution component {row.name}")
    db.commit()
    db.refresh(row)
    return row


@router.patch("/components/{item_id}", response_model=ComponentRead)
def update_component(project_id: str, item_id: str, payload: ComponentUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_owned(db, SolutionComponent, item_id, project_id, "Component")
    if apply_updates(db, project_id, row, payload, strip=("name", "technology")):
        log(db, project, f"updated solution component {row.name}")
    db.commit()
    db.refresh(row)
    return row


@router.delete("/components/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_component(project_id: str, item_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_owned(db, SolutionComponent, item_id, project_id, "Component")
    db.delete(row)
    log(db, project, f"removed solution component {row.name}")
    db.commit()


# ─────────────────────────────── integrations ──────────────────────────────


@router.post("/integrations", response_model=IntegrationRead, status_code=status.HTTP_201_CREATED)
def create_integration(project_id: str, payload: IntegrationCreate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = new_integration(db, project_id, payload)
    db.add(row)
    log(db, project, f"added integration {row.name}")
    db.commit()
    db.refresh(row)
    return row


@router.patch("/integrations/{item_id}", response_model=IntegrationRead)
def update_integration(project_id: str, item_id: str, payload: IntegrationUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_owned(db, Integration, item_id, project_id, "Integration")
    if apply_updates(db, project_id, row, payload, strip=("name", "external_system")):
        log(db, project, f"updated integration {row.name}")
    db.commit()
    db.refresh(row)
    return row


@router.delete("/integrations/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_integration(project_id: str, item_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_owned(db, Integration, item_id, project_id, "Integration")
    db.delete(row)
    log(db, project, f"removed integration {row.name}")
    db.commit()


@router.post("/integrations/from-requirements", response_model=list[IntegrationRead], status_code=status.HTTP_201_CREATED)
def integrations_from_requirements(project_id: str, db: Session = Depends(get_db)):
    """One proposed integration per integration-type requirement not yet linked to any integration."""
    project = get_project_or_404(db, project_id)
    linked = {rid for (ids,) in db.query(Integration.requirement_ids).filter(Integration.project_id == project_id) for rid in ids or []}
    pending = [
        r for r in db.query(Requirement).filter(Requirement.project_id == project_id, Requirement.type == "integration").order_by(Requirement.code)
        if r.id not in linked
    ]
    if not pending:
        raise HTTPException(status_code=422, detail="No integration requirements without an integration. Add requirements of type “integration” first.")
    created = []
    for r in pending:
        row = new_integration(db, project_id, IntegrationCreate(name=r.title[:255], data=(r.description or "").strip(), requirement_ids=[r.id]))
        db.add(row)
        created.append(row)
    log(db, project, f"added {len(created)} integration(s) from requirements")
    db.commit()
    for row in created:
        db.refresh(row)
    return created


# ─────────────────────────────── decisions ─────────────────────────────────


@router.post("/decisions", response_model=DecisionRead, status_code=status.HTTP_201_CREATED)
def create_decision(project_id: str, payload: DecisionCreate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = new_decision(db, project_id, payload)
    db.add(row)
    log(db, project, f"recorded decision {row.code}: {row.title}")
    db.commit()
    db.refresh(row)
    return row


@router.patch("/decisions/{item_id}", response_model=DecisionRead)
def update_decision(project_id: str, item_id: str, payload: DecisionUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_owned(db, DesignDecision, item_id, project_id, "Decision")
    if apply_updates(db, project_id, row, payload, strip=("title",)):
        row.updated_at = utc_now_iso()
        log(db, project, f"updated decision {row.code} ({row.status})")
    db.commit()
    db.refresh(row)
    return row


@router.delete("/decisions/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_decision(project_id: str, item_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_owned(db, DesignDecision, item_id, project_id, "Decision")
    db.delete(row)
    log(db, project, f"deleted decision {row.code}")
    db.commit()


# ─────────────────────────────── bulk (accepted AI draft) ──────────────────


@router.post("/bulk", response_model=SolutionOverview, status_code=status.HTTP_201_CREATED)
def bulk_create(project_id: str, payload: SolutionBulkInput, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    rows = (
        [new_component(db, project_id, c) for c in payload.components]
        + [new_integration(db, project_id, i) for i in payload.integrations]
        + [new_decision(db, project_id, d) for d in payload.decisions]
    )
    for row in rows:
        db.add(row)
    if rows:
        log(db, project, f"added {len(payload.components)} component(s), {len(payload.integrations)} integration(s), {len(payload.decisions)} decision(s) from the AI draft")
    db.commit()
    for row in rows:
        db.refresh(row)
    return SolutionOverview(
        design=design_read(project_id, db.get(SolutionDesign, project_id)),
        components=[r for r in rows if isinstance(r, SolutionComponent)],
        integrations=[r for r in rows if isinstance(r, Integration)],
        decisions=[r for r in rows if isinstance(r, DesignDecision)],
    )


# ─────────────────────────────── export ────────────────────────────────────


def _cell(value) -> str:
    return " ".join(("" if value is None else str(value)).split()).replace("|", "\\|") or "—"


@router.get("/export")
def export_markdown(project_id: str, db: Session = Depends(get_db)):
    """The solution design as one Markdown document."""
    project = get_project_or_404(db, project_id)
    design = design_read(project_id, db.get(SolutionDesign, project_id))
    components, integrations, decisions = load_all(db, project_id)
    req_codes = {r.id: r.code for r in db.query(Requirement).filter(Requirement.project_id == project_id)}
    codes = lambda ids: ", ".join(req_codes[i] for i in ids or [] if i in req_codes)  # noqa: E731

    out = [
        f"# {project.name}: Solution Design",
        "",
        f"Client: {(project.client or {}).get('name', '')} · Hosting: {HOSTING_LABEL[design.hosting]}"
        + (f" · Architecture: {design.architecture_style}" if design.architecture_style else ""),
        "",
        "## 1. Overview",
        design.overview.strip() or "_To be written._",
        "",
        "## 2. Architecture components",
    ]
    if components:
        for layer, label in LAYER_LABEL.items():
            rows = [c for c in components if c.layer == layer]
            if rows:
                out += ["", f"### {label}", "", "| Component | Technology | New / existing | Description | Requirements |", "| --- | --- | --- | --- | --- |"]
                out += [f"| {_cell(c.name)} | {_cell(c.technology)} | {'New' if c.is_new else 'Existing'} | {_cell(c.description)} | {_cell(codes(c.requirement_ids))} |" for c in rows]
    else:
        out.append("_No components defined._")
    out += ["", "## 3. Integrations"]
    if integrations:
        out += ["", "| Integration | External system | Direction | Protocol | Frequency | Data | Status | Requirements |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
        out += [
            f"| {_cell(i.name)} | {_cell(i.external_system)} | {i.direction} | {i.protocol.upper()} | {i.frequency} | {_cell(i.data)} | {i.status} | {_cell(codes(i.requirement_ids))} |"
            for i in integrations
        ]
    else:
        out.append("_No integrations defined._")
    out += ["", "## 4. Technical approach", design.technical_approach.strip() or "_To be written._"]
    out += ["", "## 5. Non-functional approach", design.nfr_approach.strip() or "_Security, performance, availability and scalability approach to be written._"]
    out += ["", "## 6. Architecture decisions"]
    if decisions:
        for d in decisions:
            out += ["", f"### {d.code}: {d.title} ({d.status})"]
            for label, text in (("Context", d.context), ("Decision", d.decision), ("Alternatives considered", d.alternatives), ("Consequences", d.consequences)):
                if text.strip():
                    out += ["", f"**{label}:** {text.strip()}"]
    else:
        out.append("_No decisions recorded._")

    slug = re.sub(r"[^a-z0-9]+", "-", project.name.lower()).strip("-")[:60] or "project"
    return Response(
        content="\n".join(out) + "\n",
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{slug}-solution-design.md"'},
    )


# ─────────────────────────────── AI draft ──────────────────────────────────


SUGGEST_SYSTEM_PROMPT = (
    "You are a senior solution architect proposing a solution for a client engagement. Base it only on the "
    "material provided; where you assume something, say so explicitly. Prefer simple, proven technology. "
    "Respond ONLY with a valid JSON object (no markdown fences, no extra text) with exactly these keys: "
    "overview (string, 1-2 paragraphs), hosting (one of: cloud, on-premise, hybrid, saas, tbd), "
    "architectureStyle (short string, e.g. 'Modular monolith with event-driven integrations'), "
    "technicalApproach (markdown string: build approach, key technologies, delivery approach), "
    "nfrApproach (markdown string: security, performance, availability, scalability), "
    "components (array, at most 15, each {name, layer (channel|service|data|platform), technology, description, isNew (bool), requirements (array of requirement codes)}), "
    "integrations (array, at most 15, each {name, externalSystem, direction (inbound|outbound|both), protocol (rest|soap|event|file|database|other), "
    "frequency (real-time|batch|on-demand), data (what is exchanged), requirements (array of requirement codes)}), "
    "decisions (array, at most 6, each {title, context, decision, alternatives, consequences})."
)


def _pick(value, allowed: tuple[str, ...], default: str) -> str:
    return value if value in allowed else default


@router.post("/suggest", response_model=SolutionSuggestion)
def suggest_solution(project_id: str, db: Session = Depends(get_db)):
    """AI draft. Nothing is saved: the user reviews it, then saves via PUT /design and POST /bulk."""
    project = get_project_or_404(db, project_id)
    context, has_material = build_suggest_context(db, project)
    if not has_material:
        raise HTTPException(status_code=422, detail="Add requirements or meetings to this project first; the AI designs from them.")
    data = run_llm_json(SUGGEST_SYSTEM_PROMPT, f"Propose the solution for this material:\n\n{check_input_size(context)}")
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="AI reply was not a JSON object")

    id_by_code = {r.code.upper(): r.id for r in db.query(Requirement).filter(Requirement.project_id == project_id)}

    def req_ids(item: dict) -> list[str]:
        return list(dict.fromkeys(id_by_code[str(c).strip().upper()] for c in item.get("requirements") or [] if str(c).strip().upper() in id_by_code))

    def items(key: str, limit: int):
        return [i for i in (data.get(key) or []) if isinstance(i, dict) and str(i.get("name") or i.get("title") or "").strip()][:limit]

    def text(value) -> str:
        return "\n".join(str(v) for v in value) if isinstance(value, list) else str(value or "")

    return SolutionSuggestion(
        overview=text(data.get("overview")),
        hosting=_pick(data.get("hosting"), ("cloud", "on-premise", "hybrid", "saas", "tbd"), "tbd"),
        architecture_style=text(data.get("architectureStyle"))[:255],
        technical_approach=text(data.get("technicalApproach")),
        nfr_approach=text(data.get("nfrApproach")),
        components=[
            ComponentCreate(
                name=str(c["name"]).strip()[:255],
                layer=_pick(c.get("layer"), ("channel", "service", "data", "platform"), "service"),
                technology=str(c.get("technology") or "")[:255],
                description=str(c.get("description") or ""),
                is_new=c.get("isNew") is not False,
                requirement_ids=req_ids(c),
            )
            for c in items("components", 15)
        ],
        integrations=[
            IntegrationCreate(
                name=str(i["name"]).strip()[:255],
                external_system=str(i.get("externalSystem") or "")[:255],
                direction=_pick(i.get("direction"), ("inbound", "outbound", "both"), "outbound"),
                protocol=_pick(i.get("protocol"), ("rest", "soap", "event", "file", "database", "other"), "other"),
                frequency=_pick(i.get("frequency"), ("real-time", "batch", "on-demand"), "real-time"),
                data=str(i.get("data") or ""),
                requirement_ids=req_ids(i),
            )
            for i in items("integrations", 15)
        ],
        decisions=[
            DecisionCreate(
                title=str(d["title"]).strip()[:255],
                context=str(d.get("context") or ""),
                decision=str(d.get("decision") or ""),
                alternatives=str(d.get("alternatives") or ""),
                consequences=str(d.get("consequences") or ""),
            )
            for d in items("decisions", 6)
        ],
    )
