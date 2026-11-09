"""Organisation-wide document templates (section outlines with optional standard text)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import DocumentTemplate, ProjectDocument
from ..routers.projects import utc_now_iso
from ..schemas.common import CamelModel
from ..schemas.document import DocumentKind, DocumentSection
from ..services.document_builder import TEMPLATES

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _unique(sections: list[DocumentSection] | None):
    if sections is not None:
        if not sections:
            raise ValueError("a template needs at least one section")
        keys = [s.key for s in sections]
        if len(keys) != len(set(keys)):
            raise ValueError("section keys must be unique")
    return sections


class TemplateRead(CamelModel):
    id: str
    kind: DocumentKind
    name: str
    description: str
    sections: list[DocumentSection]
    updated_at: str = Field(alias="updatedAt")


class TemplateCreate(CamelModel):
    kind: DocumentKind
    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    sections: list[DocumentSection] = Field(max_length=60)

    _check = field_validator("sections")(_unique)


class TemplateUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    sections: list[DocumentSection] | None = Field(default=None, max_length=60)

    _check = field_validator("sections")(_unique)


class TemplateFromDocument(CamelModel):
    project_id: str = Field(alias="projectId")
    document_id: str = Field(alias="documentId")
    name: str = Field(min_length=1, max_length=255)


def get_template(db: Session, template_id: str) -> DocumentTemplate:
    row = db.get(DocumentTemplate, template_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return row


@router.get("", response_model=list[TemplateRead])
def list_templates(kind: DocumentKind | None = None, db: Session = Depends(get_db)):
    query = db.query(DocumentTemplate)
    if kind:
        query = query.filter(DocumentTemplate.kind == kind)
    return query.order_by(DocumentTemplate.kind, DocumentTemplate.name).all()


@router.get("/outlines", response_model=dict[str, list[DocumentSection]])
def outlines():
    """The standard sections per document type, used as the starting point for a new template."""
    return {kind: [DocumentSection(key=key, title=title, body="") for key, title, _ in rows] for kind, rows in TEMPLATES.items()}


@router.post("", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
def create_template(payload: TemplateCreate, db: Session = Depends(get_db)):
    row = DocumentTemplate(
        id=f"tpl-{uuid.uuid4().hex[:8]}", kind=payload.kind, name=payload.name.strip(), description=payload.description,
        sections=[s.model_dump() for s in payload.sections], updated_at=utc_now_iso(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/from-document", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
def template_from_document(payload: TemplateFromDocument, db: Session = Depends(get_db)):
    """Copy a document's structure. Generated sections are blanked so client data never leaks into the template."""
    doc = db.get(ProjectDocument, payload.document_id)
    if doc is None or doc.project_id != payload.project_id:
        raise HTTPException(status_code=404, detail="Document not found")
    standard = {key for key, _, _ in TEMPLATES[doc.kind]}
    sections = [{"key": s["key"], "title": s["title"], "body": "" if s["key"] in standard else s.get("body", "")} for s in doc.sections or []]
    if not sections:
        raise HTTPException(status_code=422, detail="This document has no sections to copy.")
    row = DocumentTemplate(id=f"tpl-{uuid.uuid4().hex[:8]}", kind=doc.kind, name=payload.name.strip(), description=f"Based on {doc.title}"[:1000], sections=sections, updated_at=utc_now_iso())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{template_id}", response_model=TemplateRead)
def update_template(template_id: str, payload: TemplateUpdate, db: Session = Depends(get_db)):
    row = get_template(db, template_id)
    data = payload.model_dump(by_alias=False)
    for key in payload.model_fields_set:
        if data[key] is not None:
            setattr(row, key, data[key].strip() if key == "name" else data[key])
    row.updated_at = utc_now_iso()
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: str, db: Session = Depends(get_db)):
    db.delete(get_template(db, template_id))
    db.commit()
