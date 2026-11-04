from __future__ import annotations

from typing import Literal

from pydantic import Field

from .common import CamelModel

ProjectStatus = Literal["draft", "discovery", "in-progress", "in-review", "completed", "on-hold"]
Industry = Literal[
    "Banking & Financial Services",
    "Healthcare",
    "Retail & E-commerce",
    "Manufacturing",
    "Logistics",
    "Insurance",
    "Public Sector",
    "Telecommunications",
]
ActivityKind = Literal["upload", "requirement", "review", "document", "comment", "status", "project", "analysis", "story"]
SourceType = Literal["transcript", "rfp", "notes", "document", "spreadsheet"]
ApprovalState = Literal["pending", "changes-requested"]
RequirementPriority = Literal["must", "should", "could"]
RequirementType = Literal["functional", "non-functional", "integration", "compliance"]
StageState = Literal["complete", "current", "upcoming"]
WorkflowModuleKey = Literal[
    "sources",
    "meetings",
    "requirements",
    "analysis",
    "documents",
    "user-stories",
    "solution",
    "estimation",
    "proposals",
    "presentations",
    "handoff",
    "traceability",
]


class ClientRead(CamelModel):
    name: str
    industry: Industry
    contact_name: str = Field(alias="contactName")
    contact_role: str = Field(alias="contactRole")
    contact_email: str = Field(alias="contactEmail")
    region: str


class WorkflowStageRead(CamelModel):
    key: WorkflowModuleKey
    state: StageState


class ProjectCounts(CamelModel):
    sources: int = 0
    requirements: int = 0
    user_stories: int = Field(default=0, alias="userStories")
    open_reviews: int = Field(default=0, alias="openReviews")


class ProjectRead(CamelModel):
    id: str
    name: str
    description: str
    client: ClientRead
    owner_id: str = Field(alias="ownerId")
    status: ProjectStatus
    progress: int
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    due_date: str | None = Field(default=None, alias="dueDate")
    stages: list[WorkflowStageRead]
    counts: ProjectCounts


class ActivityRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    actor_id: str = Field(alias="actorId")
    kind: ActivityKind
    message: str
    timestamp: str


class SourceDocumentRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    name: str
    type: SourceType
    size_kb: int = Field(alias="sizeKb")
    uploaded_by: str = Field(alias="uploadedBy")
    uploaded_at: str = Field(alias="uploadedAt")


class ApprovalRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    title: str
    artifact: str
    requested_by: str = Field(alias="requestedBy")
    assignee_id: str = Field(alias="assigneeId")
    due_date: str = Field(alias="dueDate")
    state: ApprovalState


class RequirementRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    code: str
    title: str
    type: RequirementType
    priority: RequirementPriority
    status: Literal["draft", "validated", "approved"]
    description: str | None = None
    rationale: str | None = None
    source_ids: list[str] = Field(default_factory=list, alias="sourceIds")
    notes: str | None = None


class RequirementCreate(CamelModel):
    title: str = Field(min_length=1, max_length=255)
    type: RequirementType
    priority: RequirementPriority
    status: Literal["draft", "validated", "approved"] = "draft"
    description: str | None = None
    rationale: str | None = None
    source_ids: list[str] = Field(default_factory=list, alias="sourceIds")
    notes: str | None = None


class RequirementUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    type: RequirementType | None = None
    priority: RequirementPriority | None = None
    status: Literal["draft", "validated", "approved"] | None = None
    description: str | None = None
    rationale: str | None = None
    source_ids: list[str] | None = Field(default=None, alias="sourceIds")
    notes: str | None = None


class NewProjectInput(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    client_name: str = Field(alias="clientName", min_length=1, max_length=255)
    industry: Industry | Literal[""] = ""
    owner_id: str = Field(alias="ownerId", min_length=1)
    description: str = ""
    status: ProjectStatus = "draft"


class ClientUpdate(CamelModel):
    name: str | None = None
    industry: Industry | None = None
    contact_name: str | None = Field(default=None, alias="contactName")
    contact_role: str | None = Field(default=None, alias="contactRole")
    contact_email: str | None = Field(default=None, alias="contactEmail")
    region: str | None = None


class ProjectUpdate(CamelModel):
    """Fields a client may change. id, createdAt and counts are server-managed."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    client: ClientUpdate | None = None
    owner_id: str | None = Field(default=None, alias="ownerId")
    status: ProjectStatus | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    due_date: str | None = Field(default=None, alias="dueDate")
    stages: list[WorkflowStageRead] | None = None
