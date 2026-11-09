from __future__ import annotations

from typing import Literal

from pydantic import Field

from .common import CamelModel

Currency = Literal["USD", "EUR", "GBP", "INR", "AUD", "CAD"]
CommercialModel = Literal["tbd", "fixed-price", "time-and-materials", "milestone"]
Phase = Literal["discovery", "design", "build", "test", "deploy", "support"]

MAX_DAYS = 100_000
MAX_RATE = 100_000_000


# ── Commercial settings ─────────────────────────────────────────────────────


class SettingsRead(CamelModel):
    project_id: str = Field(alias="projectId")
    currency: Currency = "USD"
    commercial_model: CommercialModel = Field(default="tbd", alias="commercialModel")
    contingency_pct: float = Field(default=10, alias="contingencyPct")
    discount_pct: float = Field(default=0, alias="discountPct")
    days_per_point: float = Field(default=1, alias="daysPerPoint")
    assumptions: str = ""
    updated_at: str | None = Field(default=None, alias="updatedAt")


class SettingsUpdate(CamelModel):
    currency: Currency | None = None
    commercial_model: CommercialModel | None = Field(default=None, alias="commercialModel")
    contingency_pct: float | None = Field(default=None, ge=0, le=100, alias="contingencyPct")
    discount_pct: float | None = Field(default=None, ge=0, le=100, alias="discountPct")
    days_per_point: float | None = Field(default=None, gt=0, le=100, alias="daysPerPoint")
    assumptions: str | None = None


# ── Team roles ──────────────────────────────────────────────────────────────


class RoleRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    name: str
    day_rate: float = Field(alias="dayRate")
    headcount: int


class RoleCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    day_rate: float = Field(default=0, ge=0, le=MAX_RATE, alias="dayRate")
    headcount: int = Field(default=1, ge=1, le=1000)


class RoleUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    day_rate: float | None = Field(default=None, ge=0, le=MAX_RATE, alias="dayRate")
    headcount: int | None = Field(default=None, ge=1, le=1000)


# ── Effort items ────────────────────────────────────────────────────────────


class ItemRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    code: str
    title: str
    phase: Phase
    description: str
    role_id: str | None = Field(default=None, alias="roleId")
    optimistic_days: float = Field(alias="optimisticDays")
    likely_days: float = Field(alias="likelyDays")
    pessimistic_days: float = Field(alias="pessimisticDays")
    story_id: str | None = Field(default=None, alias="storyId")
    requirement_ids: list[str] = Field(default_factory=list, alias="requirementIds")
    expected_days: float = Field(alias="expectedDays")
    cost: float


class ItemCreate(CamelModel):
    title: str = Field(min_length=1, max_length=255)
    phase: Phase = "build"
    description: str = ""
    role_id: str | None = Field(default=None, alias="roleId")
    optimistic_days: float = Field(default=0, ge=0, le=MAX_DAYS, alias="optimisticDays")
    likely_days: float = Field(default=0, ge=0, le=MAX_DAYS, alias="likelyDays")
    pessimistic_days: float = Field(default=0, ge=0, le=MAX_DAYS, alias="pessimisticDays")
    requirement_ids: list[str] = Field(default_factory=list, alias="requirementIds")


class ItemUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    phase: Phase | None = None
    description: str | None = None
    role_id: str | None = Field(default=None, alias="roleId")  # explicit null unassigns the role
    optimistic_days: float | None = Field(default=None, ge=0, le=MAX_DAYS, alias="optimisticDays")
    likely_days: float | None = Field(default=None, ge=0, le=MAX_DAYS, alias="likelyDays")
    pessimistic_days: float | None = Field(default=None, ge=0, le=MAX_DAYS, alias="pessimisticDays")
    requirement_ids: list[str] | None = Field(default=None, alias="requirementIds")


# ── Overview ────────────────────────────────────────────────────────────────


class RoleTotal(CamelModel):
    role_id: str = Field(alias="roleId")
    name: str
    days: float
    cost: float
    weeks: float  # days / headcount / 5


class PhaseTotal(CamelModel):
    phase: Phase
    days: float
    cost: float


class EstimationSummary(CamelModel):
    total_days: float = Field(alias="totalDays")
    unassigned_days: float = Field(alias="unassignedDays")
    unestimated_items: int = Field(alias="unestimatedItems")
    duration_weeks: float = Field(alias="durationWeeks")
    blended_day_rate: float = Field(alias="blendedDayRate")
    subtotal: float
    contingency_amount: float = Field(alias="contingencyAmount")
    discount_amount: float = Field(alias="discountAmount")
    total: float
    by_role: list[RoleTotal] = Field(alias="byRole")
    by_phase: list[PhaseTotal] = Field(alias="byPhase")


class EstimationOverview(CamelModel):
    settings: SettingsRead
    roles: list[RoleRead]
    items: list[ItemRead]
    summary: EstimationSummary
