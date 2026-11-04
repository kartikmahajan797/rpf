from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator

from .common import CamelModel

StoryPriority = Literal["must", "should", "could"]
StoryStatus = Literal["backlog", "ready", "in-progress", "done"]
STORY_POINTS = (1, 2, 3, 5, 8, 13, 21)


def clean_criteria(items: list[str] | None) -> list[str] | None:
    if items is None:
        return None
    return [c.strip() for c in items if c and c.strip()]


def check_points(value: int | None) -> int | None:
    if value is not None and value not in STORY_POINTS:
        raise ValueError(f"story points must be one of {', '.join(map(str, STORY_POINTS))}")
    return value


# ── Epics ───────────────────────────────────────────────────────────────────


class EpicRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    code: str
    title: str
    description: str


class EpicCreate(CamelModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = ""


class EpicUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


# ── Stories ─────────────────────────────────────────────────────────────────


class StoryRead(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    epic_id: str | None = Field(default=None, alias="epicId")
    code: str
    title: str
    persona: str
    goal: str
    benefit: str
    acceptance_criteria: list[str] = Field(default_factory=list, alias="acceptanceCriteria")
    priority: StoryPriority
    story_points: int | None = Field(default=None, alias="storyPoints")
    status: StoryStatus
    requirement_ids: list[str] = Field(default_factory=list, alias="requirementIds")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class StoryCreate(CamelModel):
    title: str = Field(min_length=1, max_length=255)
    epic_id: str | None = Field(default=None, alias="epicId")
    persona: str = Field(default="", max_length=255)
    goal: str = ""
    benefit: str = ""
    acceptance_criteria: list[str] = Field(default_factory=list, alias="acceptanceCriteria", max_length=30)
    priority: StoryPriority = "should"
    story_points: int | None = Field(default=None, alias="storyPoints")
    status: StoryStatus = "backlog"
    requirement_ids: list[str] = Field(default_factory=list, alias="requirementIds")

    @field_validator("acceptance_criteria")
    @classmethod
    def _criteria(cls, v):
        return clean_criteria(v)

    @field_validator("story_points")
    @classmethod
    def _points(cls, v):
        return check_points(v)


class StoryUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    epic_id: str | None = Field(default=None, alias="epicId")
    persona: str | None = Field(default=None, max_length=255)
    goal: str | None = None
    benefit: str | None = None
    acceptance_criteria: list[str] | None = Field(default=None, alias="acceptanceCriteria", max_length=30)
    priority: StoryPriority | None = None
    story_points: int | None = Field(default=None, alias="storyPoints")
    status: StoryStatus | None = None
    requirement_ids: list[str] | None = Field(default=None, alias="requirementIds")

    @field_validator("acceptance_criteria")
    @classmethod
    def _criteria(cls, v):
        return clean_criteria(v)

    @field_validator("story_points")
    @classmethod
    def _points(cls, v):
        return check_points(v)


class BacklogOverview(CamelModel):
    epics: list[EpicRead]
    stories: list[StoryRead]


# ── Bulk save of accepted suggestions ───────────────────────────────────────


class EpicWithStories(CamelModel):
    """An epic to create (or None for 'no epic') with its stories."""

    title: str | None = Field(default=None, max_length=255)
    description: str = ""
    stories: list[StoryCreate] = Field(default_factory=list, max_length=100)


class BulkStoriesInput(CamelModel):
    groups: list[EpicWithStories] = Field(max_length=30)


# ── AI suggestions (never saved by the suggest endpoint) ────────────────────


class StorySuggestion(CamelModel):
    title: str
    persona: str
    goal: str
    benefit: str
    acceptance_criteria: list[str] = Field(alias="acceptanceCriteria")
    priority: StoryPriority
    story_points: int | None = Field(default=None, alias="storyPoints")
    requirement_ids: list[str] = Field(default_factory=list, alias="requirementIds")


class EpicSuggestion(CamelModel):
    title: str
    description: str
    stories: list[StorySuggestion]


class BacklogSuggestion(CamelModel):
    epics: list[EpicSuggestion]
