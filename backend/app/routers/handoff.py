"""Delivery handoff: readiness checklist, handover details and the downloadable package."""

from __future__ import annotations

import io
import re
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AnalysisGap, Approval, Project, ProjectDocument, ProjectHandoff, Requirement, SolutionDesign, UserStory
from ..schemas.common import CamelModel
from ..services.document_builder import to_markdown
from .estimation import export_markdown as estimate_markdown, overview as estimation_overview
from .projects import CURRENT_USER_ID, get_project_or_404, utc_now_iso
from .solution import export_markdown as solution_markdown, log
from .stories import export_csv as stories_csv
from .traceability import build_overview, export_csv as traceability_csv

router = APIRouter(prefix="/api/projects/{project_id}/handoff", tags=["handoff"])


class HandoffCheck(CamelModel):
    key: str
    label: str
    detail: str
    passed: bool
    required: bool


class HandoffRead(CamelModel):
    project_id: str = Field(alias="projectId")
    delivery_lead: str = Field(default="", alias="deliveryLead")
    start_date: str = Field(default="", alias="startDate")
    notes: str = ""
    updated_at: str | None = Field(default=None, alias="updatedAt")
    handed_off_at: str | None = Field(default=None, alias="handedOffAt")
    handed_off_by: str | None = Field(default=None, alias="handedOffBy")


class HandoffUpdate(CamelModel):
    delivery_lead: str | None = Field(default=None, max_length=255, alias="deliveryLead")
    start_date: str | None = Field(default=None, pattern=r"^(\d{4}-\d{2}-\d{2})?$", alias="startDate")
    notes: str | None = None


class HandoffOverview(CamelModel):
    handoff: HandoffRead
    checks: list[HandoffCheck]
    ready: bool


def get_checks(db: Session, project_id: str) -> list[HandoffCheck]:
    def rows_of(model):
        return db.query(model).filter(model.project_id == project_id).all()

    requirements, stories, documents, gaps, approvals = rows_of(Requirement), rows_of(UserStory), rows_of(ProjectDocument), rows_of(AnalysisGap), rows_of(Approval)
    design = db.get(SolutionDesign, project_id)
    estimate = estimation_overview(db, project_id)
    trace = build_overview(db, project_id).summary

    def approved(kind: str) -> tuple[bool, str]:
        ofkind = [d for d in documents if d.kind == kind]
        done = sum(1 for d in ofkind if d.status == "approved")
        return done > 0, f"{done} approved of {len(ofkind)}"

    approved_reqs = sum(1 for r in requirements if r.status == "approved")
    with_criteria = sum(1 for s in stories if s.acceptance_criteria)
    design_done = bool(design and design.overview.strip() and design.technical_approach.strip())
    open_gaps = sum(1 for g in gaps if g.status != "closed")
    issues = estimate.summary.unestimated_items + (1 if estimate.summary.unassigned_days else 0)
    brd, brd_detail = approved("brd")
    frd, frd_detail = approved("frd")
    proposal, proposal_detail = approved("proposal")

    check = HandoffCheck
    return [
        check(key="requirements", label="All requirements approved", detail=f"{approved_reqs} of {len(requirements)} approved", passed=bool(requirements) and approved_reqs == len(requirements), required=True),
        check(key="brd", label="BRD approved", detail=brd_detail, passed=brd, required=True),
        check(key="frd", label="FRD approved", detail=frd_detail, passed=frd, required=True),
        check(key="stories", label="Stories have acceptance criteria", detail=f"{with_criteria} of {len(stories)} stories", passed=bool(stories) and with_criteria == len(stories), required=True),
        check(key="solution", label="Solution approach written", detail="Overview and build approach" + (" written" if design_done else " incomplete"), passed=design_done, required=True),
        check(key="estimate", label="Estimate complete", detail=f"{len(estimate.items)} items; every item sized and assigned" if estimate.items and not issues else f"{len(estimate.items)} items; {estimate.summary.unestimated_items} not sized, {estimate.summary.unassigned_days:g} days without a role", passed=bool(estimate.items) and not issues, required=True),
        check(key="proposal", label="Proposal approved", detail=proposal_detail, passed=proposal, required=False),
        check(key="traceability", label="Requirements fully traced", detail=f"{trace.fully_traced} of {trace.total} have a story, design and estimate", passed=trace.total > 0 and trace.fully_traced == trace.total, required=False),
        check(key="gaps", label="No open gaps", detail=f"{open_gaps} open", passed=open_gaps == 0, required=False),
        check(key="approvals", label="No pending approvals", detail=f"{len(approvals)} pending", passed=not approvals, required=False),
    ]


def read(project_id: str, row: ProjectHandoff | None) -> HandoffRead:
    return HandoffRead(project_id=project_id) if row is None else HandoffRead.model_validate(row)


def get_or_create(db: Session, project_id: str) -> ProjectHandoff:
    row = db.get(ProjectHandoff, project_id)
    if row is None:
        row = ProjectHandoff(project_id=project_id, delivery_lead="", start_date="", notes="")
        db.add(row)
        db.flush()
    return row


def build(db: Session, project_id: str) -> HandoffOverview:
    checks = get_checks(db, project_id)
    return HandoffOverview(handoff=read(project_id, db.get(ProjectHandoff, project_id)), checks=checks, ready=all(c.passed for c in checks if c.required))


@router.get("", response_model=HandoffOverview)
def get_handoff(project_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    return build(db, project_id)


@router.put("", response_model=HandoffOverview)
def save_handoff(project_id: str, payload: HandoffUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_or_create(db, project_id)
    data = payload.model_dump(by_alias=False)
    changed = False
    for key in payload.model_fields_set:
        if data[key] is not None:
            setattr(row, key, data[key].strip() if key == "delivery_lead" else data[key])
            changed = True
    if changed:
        row.updated_at = utc_now_iso()
        log(db, project, "updated the delivery handoff details")
    db.commit()
    return build(db, project_id)


@router.post("/complete", response_model=HandoffOverview)
def complete_handoff(project_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = get_or_create(db, project_id)
    if row.handed_off_at:
        raise HTTPException(status_code=409, detail="This project has already been handed off.")
    missing = [c.label for c in get_checks(db, project_id) if c.required and not c.passed]
    if missing:
        raise HTTPException(status_code=409, detail="Not ready for handoff: " + "; ".join(missing))
    row.handed_off_at, row.handed_off_by = utc_now_iso(), CURRENT_USER_ID
    log(db, project, "handed the project off to delivery")
    db.commit()
    return build(db, project_id)


@router.post("/reopen", response_model=HandoffOverview)
def reopen_handoff(project_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    row = db.get(ProjectHandoff, project_id)
    if row is None or not row.handed_off_at:
        raise HTTPException(status_code=409, detail="This project has not been handed off.")
    row.handed_off_at, row.handed_off_by = None, None
    log(db, project, "reopened the delivery handoff")
    db.commit()
    return build(db, project_id)


def _summary_markdown(project: Project, data: HandoffOverview) -> str:
    h = data.handoff
    out = [
        f"# {project.name}: Delivery handoff",
        "",
        f"Client: {(project.client or {}).get('name', '')}",
        f"Delivery lead: {h.delivery_lead or 'To be confirmed'}",
        f"Planned start: {h.start_date or 'To be confirmed'}",
        f"Status: {'Handed off ' + h.handed_off_at[:10] if h.handed_off_at else 'Not handed off yet'}",
        "",
        "## Readiness",
        "",
    ]
    out += [f"- [{'x' if c.passed else ' '}] {c.label} ({c.detail})" for c in data.checks]
    out += ["", "## Notes for the delivery team", "", h.notes.strip() or "_None._", ""]
    return "\n".join(out)


@router.get("/export")
def export_package(project_id: str, db: Session = Depends(get_db)):
    """A zip with everything the delivery team needs."""
    project = get_project_or_404(db, project_id)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("README.md", _summary_markdown(project, build(db, project_id)))
        for doc in db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id).order_by(ProjectDocument.kind, ProjectDocument.title):
            slug = re.sub(r"[^a-z0-9]+", "-", doc.title.lower()).strip("-")[:60] or doc.kind
            archive.writestr(f"documents/{doc.id[-8:]}-{doc.kind}-{slug}-v{doc.version}.md", to_markdown(doc, project))
        archive.writestr("backlog/user-stories.csv", stories_csv(project_id, db).body)
        archive.writestr("solution-design.md", solution_markdown(project_id, db).body)
        archive.writestr("estimate.md", estimate_markdown(project_id, db).body)
        archive.writestr("traceability.csv", traceability_csv(project_id, db).body)
    slug = re.sub(r"[^a-z0-9]+", "-", project.name.lower()).strip("-")[:60] or "project"
    return Response(content=buffer.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{slug}-handoff.zip"'})
