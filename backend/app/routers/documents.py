"""BRD / FRD documents: generated from project data, edited by the analyst, then reviewed and approved."""

from __future__ import annotations

import re
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activity, Approval, Project, ProjectDocument
from ..schemas.document import DocumentCreate, DocumentRead, DocumentSummary, DocumentUpdate, SectionSuggestion
from ..services.document_builder import KIND_LABEL, build_section, build_sections, load_context, to_markdown
from .analysis import build_suggest_context
from .projects import CURRENT_USER_ID, get_project_or_404, utc_now_iso
from .requirements import check_input_size, run_llm_json

router = APIRouter(prefix="/api/projects/{project_id}/documents", tags=["documents"])

REVIEW_DAYS = 7


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


def summary(doc: ProjectDocument) -> DocumentSummary:
    return DocumentSummary.model_validate({**_fields(doc), "section_count": len(doc.sections or [])})


def full(doc: ProjectDocument) -> DocumentRead:
    return DocumentRead.model_validate({**_fields(doc), "section_count": len(doc.sections or []), "sections": doc.sections or []})


def _fields(doc: ProjectDocument) -> dict:
    return {
        "id": doc.id,
        "project_id": doc.project_id,
        "kind": doc.kind,
        "title": doc.title,
        "version": doc.version,
        "status": doc.status,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "approved_at": doc.approved_at,
        "approved_by": doc.approved_by,
    }


def get_doc(db: Session, project_id: str, doc_id: str) -> ProjectDocument:
    doc = db.get(ProjectDocument, doc_id)
    if doc is None or doc.project_id != project_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


def label(doc: ProjectDocument) -> str:
    return f"{doc.kind.upper()} “{doc.title}” v{doc.version}"


def begin_edit(doc: ProjectDocument) -> None:
    """Content changes: blocked while in review; editing an approved document starts a new draft version."""
    if doc.status == "in-review":
        raise HTTPException(
            status_code=409,
            detail="This document is in review. Approve it or request changes before editing.",
        )
    if doc.status == "approved":
        doc.status = "draft"
        doc.version += 1
        doc.approved_at = None
        doc.approved_by = None
    doc.updated_at = utc_now_iso()


def linked_approval(db: Session, doc: ProjectDocument) -> Approval | None:
    return db.get(Approval, doc.approval_id) if doc.approval_id else None


# ─────────────────────────────── CRUD ──────────────────────────────────────


@router.get("", response_model=list[DocumentSummary])
def list_documents(project_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    docs = (
        db.query(ProjectDocument)
        .filter(ProjectDocument.project_id == project_id)
        .order_by(ProjectDocument.updated_at.desc())
        .all()
    )
    return [summary(d) for d in docs]


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
def create_document(project_id: str, payload: DocumentCreate, db: Session = Depends(get_db)):
    """Create a BRD or FRD pre-filled from the project's requirements, analysis and meetings."""
    project = get_project_or_404(db, project_id)
    now = utc_now_iso()
    title = (payload.title or "").strip() or f"{project.name}: {KIND_LABEL[payload.kind]}"
    doc = ProjectDocument(
        id=f"doc-{uuid.uuid4().hex[:8]}",
        project_id=project_id,
        kind=payload.kind,
        title=title[:255],
        version=1,
        status="draft",
        sections=build_sections(load_context(db, project), payload.kind),
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    log(db, project, f"generated {label(doc)}")
    db.commit()
    db.refresh(doc)
    return full(doc)


@router.get("/{doc_id}", response_model=DocumentRead)
def get_document(project_id: str, doc_id: str, db: Session = Depends(get_db)):
    get_project_or_404(db, project_id)
    return full(get_doc(db, project_id, doc_id))


@router.patch("/{doc_id}", response_model=DocumentRead)
def update_document(project_id: str, doc_id: str, payload: DocumentUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    doc = get_doc(db, project_id, doc_id)
    fields = payload.model_fields_set
    changes = {}
    if "title" in fields and payload.title is not None and payload.title.strip() != doc.title:
        changes["title"] = payload.title.strip()
    if "sections" in fields and payload.sections is not None:
        sections = [s.model_dump() for s in payload.sections]
        if sections != list(doc.sections or []):
            changes["sections"] = sections
    if changes:
        begin_edit(doc)
        for key, value in changes.items():
            setattr(doc, key, value)
        log(db, project, f"edited {label(doc)}")
        db.commit()
        db.refresh(doc)
    return full(doc)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(project_id: str, doc_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    doc = get_doc(db, project_id, doc_id)
    approval = linked_approval(db, doc)
    if approval is not None:
        db.delete(approval)
    db.delete(doc)
    log(db, project, f"deleted {label(doc)}")
    db.commit()


@router.post("/{doc_id}/sections/{key}/refresh", response_model=DocumentRead)
def refresh_section(project_id: str, doc_id: str, key: str, db: Session = Depends(get_db)):
    """Rebuild one template section from the project's current data (replaces its text)."""
    project = get_project_or_404(db, project_id)
    doc = get_doc(db, project_id, doc_id)
    sections = list(doc.sections or [])
    index = next((i for i, s in enumerate(sections) if s.get("key") == key), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Section not found")
    fresh = build_section(load_context(db, project), doc.kind, key)
    if fresh is None:
        raise HTTPException(status_code=422, detail="This is a custom section; there is no project data to refresh it from.")
    begin_edit(doc)
    sections[index] = {**sections[index], "body": fresh["body"]}
    doc.sections = sections
    log(db, project, f"refreshed “{sections[index]['title']}” in {label(doc)}")
    db.commit()
    db.refresh(doc)
    return full(doc)


# ─────────────────────────────── review workflow ───────────────────────────


@router.post("/{doc_id}/submit", response_model=DocumentRead)
def submit_for_review(project_id: str, doc_id: str, db: Session = Depends(get_db)):
    """draft → in-review. Raises a pending approval for the project owner."""
    project = get_project_or_404(db, project_id)
    doc = get_doc(db, project_id, doc_id)
    if doc.status != "draft":
        raise HTTPException(status_code=409, detail=f"Only a draft can be submitted (this document is {doc.status}).")
    due = (date.today() + timedelta(days=REVIEW_DAYS)).isoformat()
    title = f"{doc.title} v{doc.version}"[:255]
    approval = linked_approval(db, doc)
    if approval is None:
        approval = Approval(
            id=f"ap-{uuid.uuid4().hex[:8]}",
            project_id=project_id,
            title=title,
            artifact=doc.kind.upper(),
            requested_by=CURRENT_USER_ID,
            assignee_id=project.owner_id,
            due_date=due,
            state="pending",
        )
        db.add(approval)
        doc.approval_id = approval.id
    else:
        approval.title, approval.due_date, approval.state = title, due, "pending"
    doc.status = "in-review"
    doc.updated_at = utc_now_iso()
    log(db, project, f"submitted {label(doc)} for review")
    db.commit()
    db.refresh(doc)
    return full(doc)


@router.post("/{doc_id}/approve", response_model=DocumentRead)
def approve_document(project_id: str, doc_id: str, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    doc = get_doc(db, project_id, doc_id)
    if doc.status != "in-review":
        raise HTTPException(status_code=409, detail="Only a document in review can be approved.")
    approval = linked_approval(db, doc)
    if approval is not None:
        db.delete(approval)  # the approvals list only shows open items
    now = utc_now_iso()
    doc.status, doc.approval_id, doc.approved_at, doc.approved_by, doc.updated_at = "approved", None, now, CURRENT_USER_ID, now
    log(db, project, f"approved {label(doc)}")
    db.commit()
    db.refresh(doc)
    return full(doc)


@router.post("/{doc_id}/request-changes", response_model=DocumentRead)
def request_changes(project_id: str, doc_id: str, db: Session = Depends(get_db)):
    """in-review → draft; the approval stays visible as “changes requested” until resubmitted."""
    project = get_project_or_404(db, project_id)
    doc = get_doc(db, project_id, doc_id)
    if doc.status != "in-review":
        raise HTTPException(status_code=409, detail="Only a document in review can be sent back for changes.")
    approval = linked_approval(db, doc)
    if approval is not None:
        approval.state = "changes-requested"
    doc.status = "draft"
    doc.updated_at = utc_now_iso()
    log(db, project, f"requested changes to {label(doc)}")
    db.commit()
    db.refresh(doc)
    return full(doc)


# ─────────────────────────────── export + AI ───────────────────────────────


@router.get("/{doc_id}/export")
def export_document(project_id: str, doc_id: str, db: Session = Depends(get_db)):
    """Download the document as Markdown."""
    project = get_project_or_404(db, project_id)
    doc = get_doc(db, project_id, doc_id)
    slug = re.sub(r"[^a-z0-9]+", "-", doc.title.lower()).strip("-")[:80] or doc.kind
    return Response(
        content=to_markdown(doc, project),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{slug}-v{doc.version}.md"'},
    )


SECTION_SYSTEM_PROMPT = (
    "You are a senior business analyst writing one section of a {kind} for a client engagement. "
    "Use only the material provided; do not invent facts, names or numbers. Where information is missing, "
    "write a short italic placeholder such as _To be confirmed with the client_. "
    "Write in clear, professional English using GitHub-flavoured markdown (### sub-headings, bullet lists, tables). "
    "Do not repeat the section title as a heading. "
    'Respond ONLY with a valid JSON object (no markdown fences, no extra text): {{"body": "<markdown>"}}'
)


@router.post("/{doc_id}/sections/{key}/suggest", response_model=SectionSuggestion)
def suggest_section(project_id: str, doc_id: str, key: str, db: Session = Depends(get_db)):
    """AI rewrite of one section from project material. Not saved: the analyst reviews it in the editor."""
    project = get_project_or_404(db, project_id)
    doc = get_doc(db, project_id, doc_id)
    section = next((s for s in doc.sections or [] if s.get("key") == key), None)
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found")
    context, has_material = build_suggest_context(db, project)
    if not has_material:
        raise HTTPException(status_code=422, detail="Add requirements or meetings to this project first; the AI writes from them.")
    prompt = (
        f"Section to write: {section['title']}\n\n"
        f"Current draft of this section (improve it; keep facts and IDs that are correct):\n{section.get('body', '')}\n\n"
        f"PROJECT MATERIAL:\n{context}"
    )
    data = run_llm_json(SECTION_SYSTEM_PROMPT.format(kind=KIND_LABEL[doc.kind]), check_input_size(prompt))
    if not isinstance(data, dict) or not str(data.get("body", "")).strip():
        raise HTTPException(status_code=502, detail="AI reply did not contain a section body")
    return SectionSuggestion(key=key, body=str(data["body"]).strip())
