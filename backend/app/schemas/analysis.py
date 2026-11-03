from __future__ import annotations

from typing import Literal

from pydantic import Field

from .common import CamelModel

Level = Literal["high", "medium", "low"]
GapStatus = Literal["open", "in-progress", "closed"]
Attitude = Literal["champion", "supporter", "neutral", "resistant"]
ProcessKind = Literal["as-is", "to-be"]


# ── Current / future state ──────────────────────────────────────────────────


class AnalysisStateRead(CamelModel):
    project_id: str = Field(alias="projectId")
    current_state: str = Field(default="", alias="currentState")
    future_state: str = Field(default="", alias="futureState")
    objectives: str = ""
    updated_at: str | None = Field(default=None, alias="updatedAt")


class AnalysisStateUpdate(CamelModel):
    current_state: str | None = Field(default=None, alias="currentState")
    future_state: str | None = Field(default=None, alias="futureState")
    objectives: str | None = None


# ── Gaps ────────────────────────────────────────────────────────────────────


class GapRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    code: str
    area: str
    current: str
    target: str
    description: str
    impact: Level
    status: GapStatus
    requirement_ids: list[str] = Field(default_factory=list, alias="requirementIds")


class GapCreate(CamelModel):
    area: str = Field(min_length=1, max_length=255)
    current: str = ""
    target: str = ""
    description: str = ""
    impact: Level = "medium"
    status: GapStatus = "open"
    requirement_ids: list[str] = Field(default_factory=list, alias="requirementIds")


class GapUpdate(CamelModel):
    area: str | None = Field(default=None, min_length=1, max_length=255)
    current: str | None = None
    target: str | None = None
    description: str | None = None
    impact: Level | None = None
    status: GapStatus | None = None
    requirement_ids: list[str] | None = Field(default=None, alias="requirementIds")


# ── Stakeholders ────────────────────────────────────────────────────────────


class StakeholderRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    name: str
    role: str
    organization: str
    influence: Level
    interest: Level
    attitude: Attitude
    notes: str


class StakeholderCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    role: str = Field(default="", max_length=255)
    organization: str = Field(default="", max_length=255)
    influence: Level = "medium"
    interest: Level = "medium"
    attitude: Attitude = "neutral"
    notes: str = ""


class StakeholderUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    role: str | None = Field(default=None, max_length=255)
    organization: str | None = Field(default=None, max_length=255)
    influence: Level | None = None
    interest: Level | None = None
    attitude: Attitude | None = None
    notes: str | None = None


# ── Process maps ────────────────────────────────────────────────────────────


class ProcessStep(CamelModel):
    actor: str = Field(default="", max_length=255)
    action: str = Field(min_length=1, max_length=1000)
    pain_point: str = Field(default="", alias="painPoint")


class ProcessMapRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    name: str
    kind: ProcessKind
    steps: list[ProcessStep] = Field(default_factory=list)
    notes: str
    updated_at: str = Field(alias="updatedAt")


class ProcessMapCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    kind: ProcessKind = "as-is"
    steps: list[ProcessStep] = Field(default_factory=list, max_length=50)
    notes: str = ""


class ProcessMapUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    kind: ProcessKind | None = None
    steps: list[ProcessStep] | None = Field(default=None, max_length=50)
    notes: str | None = None


# ── Overview ────────────────────────────────────────────────────────────────


class AnalysisOverview(CamelModel):
    state: AnalysisStateRead
    gaps: list[GapRead]
    stakeholders: list[StakeholderRead]
    process_maps: list[ProcessMapRead] = Field(alias="processMaps")


# ── AI suggestions (never saved by the suggest endpoint) ────────────────────


class GapSuggestion(CamelModel):
    area: str
    current: str
    target: str
    description: str
    impact: Level


class AnalysisSuggestion(CamelModel):
    current_state: str = Field(alias="currentState")
    future_state: str = Field(alias="futureState")
    objectives: str
    gaps: list[GapSuggestion]
