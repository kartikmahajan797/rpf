"""Estimation & Pricing module: three-point effort items, team roles with day rates, and commercial terms."""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import EstimateItem, EstimateRole, EstimationSettings, Requirement, UserStory
from ..schemas.estimation import (
    EstimationOverview,
    EstimationSummary,
    ItemCreate,
    ItemRead,
    ItemUpdate,
    PhaseTotal,
    RoleCreate,
    RoleRead,
    RoleTotal,
    RoleUpdate,
    SettingsRead,
    SettingsUpdate,
)
from .projects import get_project_or_404, utc_now_iso
from .solution import _cell, check_requirement_ids, get_owned, log

router = APIRouter(prefix="/api/projects/{project_id}/estimation", tags=["estimation"])

PHASE_LABEL = {"discovery": "Discovery", "design": "Design", "build": "Build", "test": "Test", "deploy": "Deploy", "support": "Support"}
MODEL_LABEL = {"tbd": "To be decided", "fixed-price": "Fixed price", "time-and-materials": "Time & materials", "milestone": "Milestone based"}


# ─────────────────────────────── helpers ───────────────────────────────────


def get_or_create_settings(db: Session, project_id: str) -> EstimationSettings:
    row = db.get(EstimationSettings, project_id)
    if row is None:
        row = EstimationSettings(
            project_id=project_id, currency="USD", commercial_model="tbd", contingency_pct=10,
            discount_pct=0, days_per_point=1, assumptions="", last_item_number=0,
        )
        db.add(row)
        db.flush()  # autoflush is off; without this a second lookup would add a duplicate
    return row


def settings_read(project_id: str, row: EstimationSettings | None) -> SettingsRead:
    return SettingsRead(project_id=project_id) if row is None else SettingsRead.model_validate(row)


def next_item_code(db: Session, project_id: str) -> str:
    row = get_or_create_settings(db, project_id)
    row.last_item_number = (row.last_item_number or 0) + 1
    return f"EST-{row.last_item_number:03d}"


def expected_days(item: EstimateItem) -> float:
    """PERT three-point estimate."""
    return (item.optimistic_days + 4 * item.likely_days + item.pessimistic_days) / 6


def check_range(optimistic: float, likely: float, pessimistic: float) -> None:
    if not optimistic <= likely <= pessimistic:
        raise HTTPException(status_code=422, detail="Estimates must satisfy optimistic ≤ most likely ≤ pessimistic.")


def check_role_id(db: Session, project_id: str, role_id: str | None) -> str | None:
    if role_id is not None:
        role = db.get(EstimateRole, role_id)
        if role is None or role.project_id != project_id:
            raise HTTPException(status_code=422, detail=f"Unknown role id for this project: {role_id}")
    return role_id


def item_read(item: EstimateItem, rates: dict[str, float]) -> ItemRead:
    days = expected_days(item)
    return ItemRead(
        id=item.id, project_id=item.project_id, code=item.code, title=item.title, phase=item.phase,
        description=item.description, role_id=item.role_id, optimistic_days=item.optimistic_days,
        likely_days=item.likely_days, pessimistic_days=item.pessimistic_days, story_id=item.story_id,
        requirement_ids=list(item.requirement_ids or []), expected_days=round(days, 2),
        cost=round(days * rates.get(item.role_id or "", 0), 2),
    )


def role_rates(db: Session, project_id: str) -> dict[str, float]:
    return {rid: rate for rid, rate in db.query(EstimateRole.id, EstimateRole.day_rate).filter(EstimateRole.project_id == project_id)}


def load_all(db: Session, project_id: str) -> tuple[list[EstimateRole], list[EstimateItem]]:
    return (
        db.query(EstimateRole).filter(EstimateRole.project_id == project_id).order_by(EstimateRole.name).all(),
        db.query(EstimateItem).filter(EstimateItem.project_id == project_id).order_by(EstimateItem.code).all(),
    )


def summarize(settings: SettingsRead, roles: list[EstimateRole], items: list[EstimateItem]) -> EstimationSummary:
    by_id = {r.id: r for r in roles}
    role_days = {r.id: 0.0 for r in roles}
    phase_days: dict[str, float] = {}
    phase_cost: dict[str, float] = {}
    subtotal = total_days = unassigned = 0.0

    for item in items:
        days = expected_days(item)
        role = by_id.get(item.role_id or "")
        cost = days * role.day_rate if role else 0.0
        total_days += days
        subtotal += cost
        if role:
            role_days[role.id] += days
        else:
            unassigned += days
        phase_days[item.phase] = phase_days.get(item.phase, 0.0) + days
        phase_cost[item.phase] = phase_cost.get(item.phase, 0.0) + cost

    contingency = subtotal * settings.contingency_pct / 100
    discount = (subtotal + contingency) * settings.discount_pct / 100
    assigned = total_days - unassigned
    weeks = {r.id: role_days[r.id] / r.headcount / 5 for r in roles}

    return EstimationSummary(
        total_days=round(total_days, 2),
        unassigned_days=round(unassigned, 2),
        unestimated_items=sum(1 for i in items if i.pessimistic_days == 0),
        # Roles work in parallel, so the busiest role sets the shortest possible duration.
        duration_weeks=round(max(weeks.values(), default=0.0), 1),
        blended_day_rate=round(subtotal / assigned, 2) if assigned else 0,
        subtotal=round(subtotal, 2),
        contingency_amount=round(contingency, 2),
        discount_amount=round(discount, 2),
        total=round(subtotal + contingency - discount, 2),
        by_role=[
            RoleTotal(role_id=r.id, name=r.name, days=round(role_days[r.id], 2), cost=round(role_days[r.id] * r.day_rate, 2), weeks=round(weeks[r.id], 1))
            for r in roles
        ],
        by_phase=[PhaseTotal(phase=p, days=round(phase_days[p], 2), cost=round(phase_cost[p], 2)) for p in PHASE_LABEL if p in phase_days],
    )


def overview(db: Session, project_id: str) -> EstimationOverview:
    settings = settings_read(project_id, db.get(EstimationSettings, project_id))
    roles, items = load_all(db, project_id)
    rates = {r.id: r.day_rate for r in roles}
    return EstimationOverview(
        settings=settings,
        roles=[RoleRead.model_validate(r) for r in roles],
        items=[item_read(i, rates) for i in items],
        summary=summarize(settings, roles, items),
    )


# ─────────────────────────────── overview + settings ───────────────────────


@router.get("", response_model=EstimationOverview)
def get_estimation(project_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    return overview(db, project_id)


@router.put("/settings", response_model=SettingsRead)
def save_settings(project_id: str, payload: SettingsUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_or_create_settings(db, project_id)
    data = payload.model_dump(by_alias=False)
    changed = False
    for key in payload.model_fields_set:
        if data[key] is not None:
            setattr(row, key, data[key])
            changed = True
    if changed:
        row.updated_at = utc_now_iso()
        log(db, project, "updated the commercial terms")
    db.commit()
    db.refresh(row)
    return settings_read(project_id, row)


# ─────────────────────────────── roles ─────────────────────────────────────


@router.post("/roles", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
def create_role(project_id: str, payload: RoleCreate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = EstimateRole(id=f"er-{uuid.uuid4().hex[:8]}", project_id=project_id, name=payload.name.strip(), day_rate=payload.day_rate, headcount=payload.headcount)
    db.add(row)
    log(db, project, f"added estimate role {row.name}")
    db.commit()
    db.refresh(row)
    return row


@router.patch("/roles/{item_id}", response_model=RoleRead)
def update_role(project_id: str, item_id: str, payload: RoleUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_owned(db, EstimateRole, item_id, project_id, "Role")
    data = payload.model_dump(by_alias=False)
    for key in payload.model_fields_set:
        if data[key] is not None:
            setattr(row, key, data[key].strip() if key == "name" else data[key])
    log(db, project, f"updated estimate role {row.name}")
    db.commit()
    db.refresh(row)
    return row


@router.delete("/roles/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(project_id: str, item_id: str, db: Session = Depends(get_db)):
    """Items assigned to the role stay, but become unassigned (and therefore uncosted)."""
    project = get_project_or_404(db, project_id)
    row = get_owned(db, EstimateRole, item_id, project_id, "Role")
    for item in db.query(EstimateItem).filter(EstimateItem.project_id == project_id, EstimateItem.role_id == item_id):
        item.role_id = None
    db.delete(row)
    log(db, project, f"removed estimate role {row.name}")
    db.commit()


# ─────────────────────────────── items ─────────────────────────────────────


@router.post("/items", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
def create_item(project_id: str, payload: ItemCreate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    check_range(payload.optimistic_days, payload.likely_days, payload.pessimistic_days)
    row = EstimateItem(
        id=f"ei-{uuid.uuid4().hex[:8]}", project_id=project_id, code=next_item_code(db, project_id),
        title=payload.title.strip(), phase=payload.phase, description=payload.description,
        role_id=check_role_id(db, project_id, payload.role_id), optimistic_days=payload.optimistic_days,
        likely_days=payload.likely_days, pessimistic_days=payload.pessimistic_days,
        requirement_ids=check_requirement_ids(db, project_id, payload.requirement_ids),
    )
    db.add(row)
    log(db, project, f"added estimate item {row.code}: {row.title}")
    db.commit()
    db.refresh(row)
    return item_read(row, role_rates(db, project_id))


@router.patch("/items/{item_id}", response_model=ItemRead)
def update_item(project_id: str, item_id: str, payload: ItemUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_owned(db, EstimateItem, item_id, project_id, "Estimate item")
    data = payload.model_dump(by_alias=False)
    for key in payload.model_fields_set:
        value = data[key]
        if key == "role_id":
            row.role_id = check_role_id(db, project_id, value)
        elif value is None:
            continue  # all other columns are required
        elif key == "requirement_ids":
            row.requirement_ids = check_requirement_ids(db, project_id, value)
        else:
            setattr(row, key, value.strip() if key == "title" else value)
    check_range(row.optimistic_days, row.likely_days, row.pessimistic_days)
    log(db, project, f"updated estimate item {row.code}")
    db.commit()
    db.refresh(row)
    return item_read(row, role_rates(db, project_id))


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(project_id: str, item_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_owned(db, EstimateItem, item_id, project_id, "Estimate item")
    db.delete(row)
    log(db, project, f"deleted estimate item {row.code}")
    db.commit()


@router.post("/items/from-stories", response_model=list[ItemRead], status_code=status.HTTP_201_CREATED)
def items_from_stories(project_id: str, db: Session = Depends(get_db)):
    """One item per user story without an estimate, sized from its story points."""
    project = get_project_or_404(db, project_id)
    linked = {sid for (sid,) in db.query(EstimateItem.story_id).filter(EstimateItem.project_id == project_id, EstimateItem.story_id.isnot(None))}
    stories = [s for s in db.query(UserStory).filter(UserStory.project_id == project_id).order_by(UserStory.code) if s.id not in linked]
    if not stories:
        raise HTTPException(status_code=422, detail="No user stories without an estimate. Add stories in the User Stories module first.")
    days_per_point = get_or_create_settings(db, project_id).days_per_point
    created = []
    for story in stories:
        likely = round((story.story_points or 0) * days_per_point, 2)
        row = EstimateItem(
            id=f"ei-{uuid.uuid4().hex[:8]}", project_id=project_id, code=next_item_code(db, project_id),
            title=f"{story.code}: {story.title}"[:255], phase="build", description="", role_id=None,
            optimistic_days=round(likely * 0.75, 2), likely_days=likely, pessimistic_days=round(likely * 1.5, 2),
            story_id=story.id, requirement_ids=list(story.requirement_ids or []),
        )
        db.add(row)
        created.append(row)
    log(db, project, f"added {len(created)} estimate item(s) from user stories")
    db.commit()
    rates = role_rates(db, project_id)
    for row in created:
        db.refresh(row)
    return [item_read(row, rates) for row in created]


# ─────────────────────────────── export ────────────────────────────────────


@router.get("/export")
def export_markdown(project_id: str, db: Session = Depends(get_db)):
    """The estimate as one Markdown document."""
    project = get_project_or_404(db, project_id)
    data = overview(db, project_id)
    s, summary = data.settings, data.summary
    roles = {r.id: r for r in data.roles}
    req_codes = {r.id: r.code for r in db.query(Requirement).filter(Requirement.project_id == project_id)}
    money = lambda v: f"{s.currency} {v:,.2f}"  # noqa: E731

    out = [
        f"# {project.name}: Estimate & Pricing",
        "",
        f"Client: {(project.client or {}).get('name', '')} · Commercial model: {MODEL_LABEL[s.commercial_model]} · Currency: {s.currency}",
        "",
        "## 1. Price summary",
        "",
        "| | Amount |",
        "| --- | --- |",
        f"| Effort subtotal | {money(summary.subtotal)} |",
        f"| Contingency ({s.contingency_pct:g}%) | {money(summary.contingency_amount)} |",
        f"| Discount ({s.discount_pct:g}%) | -{money(summary.discount_amount)} |",
        f"| **Total** | **{money(summary.total)}** |",
        "",
        f"Total effort: {summary.total_days:g} days · Minimum duration: {summary.duration_weeks:g} weeks",
    ]
    if summary.unassigned_days:
        out += ["", f"_{summary.unassigned_days:g} days have no role and are not priced._"]
    out += ["", "## 2. Team"]
    if summary.by_role:
        out += ["", "| Role | Headcount | Day rate | Days | Weeks | Cost |", "| --- | --- | --- | --- | --- | --- |"]
        out += [f"| {_cell(t.name)} | {roles[t.role_id].headcount} | {money(roles[t.role_id].day_rate)} | {t.days:g} | {t.weeks:g} | {money(t.cost)} |" for t in summary.by_role]
    else:
        out.append("_No roles defined._")
    out += ["", "## 3. Effort breakdown"]
    if data.items:
        out += ["", "| Code | Item | Phase | Role | O / L / P (days) | Expected days | Cost | Requirements |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
        for i in data.items:
            role = roles[i.role_id].name if i.role_id in roles else "Unassigned"
            codes = ", ".join(req_codes[r] for r in i.requirement_ids if r in req_codes)
            out.append(
                f"| {i.code} | {_cell(i.title)} | {PHASE_LABEL[i.phase]} | {_cell(role)} | {i.optimistic_days:g} / {i.likely_days:g} / {i.pessimistic_days:g} "
                f"| {i.expected_days:g} | {money(i.cost)} | {_cell(codes)} |"
            )
    else:
        out.append("_No effort items defined._")
    out += ["", "## 4. Assumptions", s.assumptions.strip() or "_To be written._"]

    slug = re.sub(r"[^a-z0-9]+", "-", project.name.lower()).strip("-")[:60] or "project"
    return Response(
        content="\n".join(out) + "\n",
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{slug}-estimate.md"'},
    )
