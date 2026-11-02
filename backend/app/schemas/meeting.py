from __future__ import annotations

from pydantic import Field

from .common import CamelModel


class DeviceInfo(CamelModel):
    index: int
    name: str


class DeviceListResponse(CamelModel):
    inputs: list[DeviceInfo]
    default_input: int = 0


class MeetingStatusResponse(CamelModel):
    recording: bool
    project_id: str | None = Field(default=None, alias="projectId")
    title: str | None = None
    started_at: str | None = Field(default=None, alias="startedAt")


class MeetingStartRequest(CamelModel):
    project_id: str | None = Field(default=None, alias="projectId")
    title: str | None = None
    model: str = "base"
    mic_device: int | str | None = Field(default=None, alias="micDevice")
    system_device: int | str | None = Field(default=None, alias="systemDevice")
    duration: float | None = None
    language: str | None = None
    prompt: str | None = None


class MeetingRead(CamelModel):
    id: str
    project_id: str | None = Field(default=None, alias="projectId")
    title: str
    started_at: str = Field(alias="startedAt")
    duration_sec: int = Field(default=0, alias="durationSec")
    transcript: str = ""
    audio_paths: list[str] = Field(default_factory=list, alias="audioPaths")
    status: str = "completed"
    summary: dict | None = None


class MeetingUpdate(CamelModel):
    title: str | None = None
    project_id: str | None = Field(default=None, alias="projectId")

