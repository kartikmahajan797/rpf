from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator

from .common import CamelModel

DocumentKind = Literal["brd", "frd", "proposal", "deck"]
DocumentStatus = Literal["draft", "in-review", "approved"]


class DocumentSection(CamelModel):
    key: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=255)
    body: str = Field(default="", max_length=200_000)

    @field_validator("key", "title")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class DocumentSummary(CamelModel):
    """List view: everything except the section bodies."""

    id: str
    project_id: str = Field(alias="projectId")
    kind: DocumentKind
    title: str
    version: int
    status: DocumentStatus
    section_count: int = Field(alias="sectionCount")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    approved_at: str | None = Field(default=None, alias="approvedAt")
    approved_by: str | None = Field(default=None, alias="approvedBy")


class DocumentRead(DocumentSummary):
    sections: list[DocumentSection]


class DocumentCreate(CamelModel):
    kind: DocumentKind
    title: str | None = Field(default=None, max_length=255)
    template_id: str | None = Field(default=None, alias="templateId")


class DocumentUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    sections: list[DocumentSection] | None = Field(default=None, max_length=60)

    @field_validator("sections")
    @classmethod
    def unique_keys(cls, sections: list[DocumentSection] | None):
        if sections is not None:
            keys = [s.key for s in sections]
            if len(keys) != len(set(keys)):
                raise ValueError("section keys must be unique")
        return sections


class SectionSuggestion(CamelModel):
    key: str
    body: str
