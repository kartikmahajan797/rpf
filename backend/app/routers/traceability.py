"""Traceability & change impact: every requirement linked to what depends on it. Read-only."""

from __future__ import annotations

import csv
import io
import re

from fastapi import APIRouter, Depends, Response
from pydantic import Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AnalysisGap, EstimateRole, EstimationSettings, EstimateItem, Integration, ProjectDocument, Requirement, SolutionComponent, UserStory
from ..schemas.common import CamelModel
from .estimation import expected_days
from .projects import get_project_or_404

router = APIRouter(prefix="/api/projects/{project_id}/traceability", tags=["traceability"])


class TraceLink(CamelModel):
    id: str
    label: str
    status: str = ""


class TraceRow(CamelModel):
    id: str
    code: str
    title: str
    type: str
    priority: str
    status: str
    gaps: list[TraceLink]
    stories: list[TraceLink]
    components: list[TraceLink]
    integrations: list[TraceLink]
    estimate_items: list[TraceLink] = Field(alias="estimateItems")
    documents: list[TraceLink]
    estimate_days: float = Field(alias="estimateDays")
    estimate_cost: float = Field(alias="estimateCost")
    has_story: bool = Field(alias="hasStory")
    has_design: bool = Field(alias="hasDesign")
    has_estimate: bool = Field(alias="hasEstimate")


class TraceOrphan(CamelModel):
    kind: str
    label: str


class TraceSummary(CamelModel):
    total: int
    fully_traced: int = Field(alias="fullyTraced")
    without_story: int = Field(alias="withoutStory")
    without_design: int = Field(alias="withoutDesign")
    without_estimate: int = Field(alias="withoutEstimate")


class TraceabilityOverview(CamelModel):
    currency: str
    rows: list[TraceRow]
    orphans: list[TraceOrphan]
    summary: TraceSummary


def build_overview(db: Session, project_id: str) -> TraceabilityOverview:
    def rows_of(model):
        return db.query(model).filter(model.project_id == project_id).all()

    requirements = db.query(Requirement).filter(Requirement.project_id == project_id).order_by(Requirement.code).all()
    gaps, stories, components, integrations, items, documents = (
        rows_of(AnalysisGap), rows_of(UserStory), rows_of(SolutionComponent), rows_of(Integration), rows_of(EstimateItem), rows_of(ProjectDocument),
    )
    rates = {r.id: r.day_rate for r in rows_of(EstimateRole)}
    settings = db.get(EstimationSettings, project_id)
    story_reqs = {s.id: set(s.requirement_ids or []) for s in stories}

    def item_reqs(item: EstimateItem) -> set[str]:
        """An item covers what it links directly, plus whatever its user story links."""
        return set(item.requirement_ids or []) | story_reqs.get(item.story_id or "", set())

    def linked(rows, req_id: str) -> list:
        return sorted((r for r in rows if req_id in (r.requirement_ids or [])), key=lambda r: getattr(r, "code", None) or r.name)

    out = []
    for req in requirements:
        pattern = re.compile(rf"\b{re.escape(req.code)}\b")
        req_items = sorted((i for i in items if req.id in item_reqs(i)), key=lambda i: i.code)
        req_stories, req_components, req_integrations = linked(stories, req.id), linked(components, req.id), linked(integrations, req.id)
        out.append(TraceRow(
            id=req.id, code=req.code, title=req.title, type=req.type, priority=req.priority, status=req.status,
            gaps=[TraceLink(id=g.id, label=f"{g.code} {g.area}", status=g.status) for g in linked(gaps, req.id)],
            stories=[TraceLink(id=s.id, label=f"{s.code} {s.title}", status=s.status) for s in req_stories],
            components=[TraceLink(id=c.id, label=c.name) for c in req_components],
            integrations=[TraceLink(id=i.id, label=i.name, status=i.status) for i in req_integrations],
            estimate_items=[TraceLink(id=i.id, label=f"{i.code} {i.title}") for i in req_items],
            documents=[
                TraceLink(id=d.id, label=f"{d.kind.upper()}: {d.title} v{d.version}", status=d.status)
                for d in sorted(documents, key=lambda d: d.title)
                if any(pattern.search(s.get("body", "")) for s in d.sections or [])
            ],
            estimate_days=round(sum(expected_days(i) for i in req_items), 2),
            estimate_cost=round(sum(expected_days(i) * rates.get(i.role_id or "", 0) for i in req_items), 2),
            has_story=bool(req_stories),
            has_design=bool(req_components or req_integrations),
            has_estimate=bool(req_items),
        ))

    orphans = (
        [TraceOrphan(kind="User story", label=f"{s.code} {s.title}") for s in sorted(stories, key=lambda s: s.code) if not s.requirement_ids]
        + [TraceOrphan(kind="Component", label=c.name) for c in sorted(components, key=lambda c: c.name) if c.is_new and not c.requirement_ids]
        + [TraceOrphan(kind="Integration", label=i.name) for i in sorted(integrations, key=lambda i: i.name) if not i.requirement_ids]
        + [TraceOrphan(kind="Estimate item", label=f"{i.code} {i.title}") for i in sorted(items, key=lambda i: i.code) if not item_reqs(i)]
    )
    return TraceabilityOverview(
        currency=settings.currency if settings else "USD",
        rows=out,
        orphans=orphans,
        summary=TraceSummary(
            total=len(out),
            fully_traced=sum(1 for r in out if r.has_story and r.has_design and r.has_estimate),
            without_story=sum(1 for r in out if not r.has_story),
            without_design=sum(1 for r in out if not r.has_design),
            without_estimate=sum(1 for r in out if not r.has_estimate),
        ),
    )


@router.get("", response_model=TraceabilityOverview)
def get_traceability(project_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    return build_overview(db, project_id)


def _safe(value: str) -> str:
    """Stop spreadsheets from running a cell as a formula."""
    return f"'{value}" if value[:1] in ("=", "+", "-", "@") else value


@router.get("/export")
def export_csv(project_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    data = build_overview(db, project_id)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Requirement", "Title", "Type", "Priority", "Status", "Gaps", "Stories", "Components", "Integrations", "Estimate items", "Documents", "Estimate days", f"Estimate cost ({data.currency})"])
    join = lambda links: "; ".join(link.label for link in links)  # noqa: E731
    for r in data.rows:
        writer.writerow([
            r.code, _safe(r.title), r.type, r.priority, r.status, _safe(join(r.gaps)), _safe(join(r.stories)), _safe(join(r.components)),
            _safe(join(r.integrations)), _safe(join(r.estimate_items)), _safe(join(r.documents)), r.estimate_days, r.estimate_cost,
        ])
    slug = re.sub(r"[^a-z0-9]+", "-", project.name.lower()).strip("-")[:60] or "project"
    return Response(content=buffer.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{slug}-traceability.csv"'})
