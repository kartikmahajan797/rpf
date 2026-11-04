from __future__ import annotations

from typing import Literal

from pydantic import Field

from .common import CamelModel

Hosting = Literal["cloud", "on-premise", "hybrid", "saas", "tbd"]
Layer = Literal["channel", "service", "data", "platform"]
Direction = Literal["inbound", "outbound", "both"]
Protocol = Literal["rest", "soap", "event", "file", "database", "other"]
Frequency = Literal["real-time", "batch", "on-demand"]
IntegrationStatus = Literal["proposed", "agreed"]
DecisionStatus = Literal["proposed", "accepted", "rejected", "superseded"]


# ── Design overview ─────────────────────────────────────────────────────────


class DesignRead(CamelModel):
    project_id: str = Field(alias="projectId")
    overview: str = ""
    hosting: Hosting = "tbd"
    architecture_style: str = Field(default="", alias="architectureStyle")
    technical_approach: str = Field(default="", alias="technicalApproach")
    nfr_approach: str = Field(default="", alias="nfrApproach")
    updated_at: str | None = Field(default=None, alias="updatedAt")


class DesignUpdate(CamelModel):
    overview: str | None = None
    hosting: Hosting | None = None
    architecture_style: str | None = Field(default=None, max_length=255, alias="architectureStyle")
    technical_approach: str | None = Field(default=None, alias="technicalApproach")
    nfr_approach: str | None = Field(default=None, alias="nfrApproach")


# ── Components ──────────────────────────────────────────────────────────────


class ComponentRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    name: str
    layer: Layer
    technology: str
    description: str
    is_new: bool = Field(alias="isNew")
    requirement_ids: list[str] = Field(default_factory=list, alias="requirementIds")


class ComponentCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    layer: Layer = "service"
    technology: str = Field(default="", max_length=255)
    description: str = ""
    is_new: bool = Field(default=True, alias="isNew")
    requirement_ids: list[str] = Field(default_factory=list, alias="requirementIds")


class ComponentUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    layer: Layer | None = None
    technology: str | None = Field(default=None, max_length=255)
    description: str | None = None
    is_new: bool | None = Field(default=None, alias="isNew")
    requirement_ids: list[str] | None = Field(default=None, alias="requirementIds")


# ── Integrations ────────────────────────────────────────────────────────────


class IntegrationRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    name: str
    external_system: str = Field(alias="externalSystem")
    direction: Direction
    protocol: Protocol
    frequency: Frequency
    data: str
    status: IntegrationStatus
    requirement_ids: list[str] = Field(default_factory=list, alias="requirementIds")


class IntegrationCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    external_system: str = Field(default="", max_length=255, alias="externalSystem")
    direction: Direction = "outbound"
    protocol: Protocol = "rest"
    frequency: Frequency = "real-time"
    data: str = ""
    status: IntegrationStatus = "proposed"
    requirement_ids: list[str] = Field(default_factory=list, alias="requirementIds")


class IntegrationUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    external_system: str | None = Field(default=None, max_length=255, alias="externalSystem")
    direction: Direction | None = None
    protocol: Protocol | None = None
    frequency: Frequency | None = None
    data: str | None = None
    status: IntegrationStatus | None = None
    requirement_ids: list[str] | None = Field(default=None, alias="requirementIds")


# ── Decisions (ADRs) ────────────────────────────────────────────────────────


class DecisionRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    code: str
    title: str
    context: str
    decision: str
    alternatives: str
    consequences: str
    status: DecisionStatus
    updated_at: str = Field(alias="updatedAt")


class DecisionCreate(CamelModel):
    title: str = Field(min_length=1, max_length=255)
    context: str = ""
    decision: str = ""
    alternatives: str = ""
    consequences: str = ""
    status: DecisionStatus = "proposed"


class DecisionUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    context: str | None = None
    decision: str | None = None
    alternatives: str | None = None
    consequences: str | None = None
    status: DecisionStatus | None = None


# ── Overview + AI ───────────────────────────────────────────────────────────


class SolutionOverview(CamelModel):
    design: DesignRead
    components: list[ComponentRead]
    integrations: list[IntegrationRead]
    decisions: list[DecisionRead]


class SolutionSuggestion(CamelModel):
    """AI draft; never saved by the suggest endpoint."""

    overview: str
    hosting: Hosting
    architecture_style: str = Field(alias="architectureStyle")
    technical_approach: str = Field(alias="technicalApproach")
    nfr_approach: str = Field(alias="nfrApproach")
    components: list[ComponentCreate]
    integrations: list[IntegrationCreate]
    decisions: list[DecisionCreate]


class SolutionBulkInput(CamelModel):
    components: list[ComponentCreate] = Field(default_factory=list, max_length=60)
    integrations: list[IntegrationCreate] = Field(default_factory=list, max_length=60)
    decisions: list[DecisionCreate] = Field(default_factory=list, max_length=30)
