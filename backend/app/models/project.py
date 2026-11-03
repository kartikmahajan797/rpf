from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy.ext.mutable import MutableDict, MutableList
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class TeamMember(Base):
    __tablename__ = "team_members"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(255), nullable=False)
    initials: Mapped[str] = mapped_column(String(8), nullable=False)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    client: Mapped[dict] = mapped_column(MutableDict.as_mutable(JSON), nullable=False, default=dict)
    owner_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False, default=utc_now_iso)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False, default=utc_now_iso)
    due_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    stages: Mapped[list[dict]] = mapped_column(MutableList.as_mutable(JSON), nullable=False, default=list)
    counts: Mapped[dict] = mapped_column(MutableDict.as_mutable(JSON), nullable=False, default=lambda: {"sources": 0, "requirements": 0, "userStories": 0, "openReviews": 0})

    activities: Mapped[list["Activity"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    requirements: Mapped[list["Requirement"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    approvals: Mapped[list["Approval"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    sources: Mapped[list["SourceDocument"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    meetings: Mapped[list["Meeting"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    analysis: Mapped["BusinessAnalysis | None"] = relationship(back_populates="project", cascade="all, delete-orphan", uselist=False)
    gaps: Mapped[list["AnalysisGap"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    stakeholders: Mapped[list["Stakeholder"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    process_maps: Mapped[list["ProcessMap"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id"), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    message: Mapped[str] = mapped_column(String(255), nullable=False)
    timestamp: Mapped[str] = mapped_column(String(64), nullable=False, default=utc_now_iso)

    project: Mapped[Project] = relationship(back_populates="activities")


class SourceDocument(Base):
    __tablename__ = "source_documents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    size_kb: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    uploaded_by: Mapped[str] = mapped_column(String(64), nullable=False)
    uploaded_at: Mapped[str] = mapped_column(String(64), nullable=False, default=utc_now_iso)

    project: Mapped[Project] = relationship(back_populates="sources")


class Approval(Base):
    __tablename__ = "approvals"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    artifact: Mapped[str] = mapped_column(String(255), nullable=False)
    requested_by: Mapped[str] = mapped_column(String(64), nullable=False)
    assignee_id: Mapped[str] = mapped_column(String(64), nullable=False)
    due_date: Mapped[str] = mapped_column(String(32), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)

    project: Mapped[Project] = relationship(back_populates="approvals")


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    priority: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_ids: Mapped[list] = mapped_column(MutableList.as_mutable(JSON), nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped[Project] = relationship(back_populates="requirements")


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("projects.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    started_at: Mapped[str] = mapped_column(String(64), nullable=False, default=utc_now_iso)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    transcript: Mapped[str] = mapped_column(Text, nullable=False, default="")
    audio_paths: Mapped[list] = mapped_column(MutableList.as_mutable(JSON), nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="completed")
    summary: Mapped[dict | None] = mapped_column(MutableDict.as_mutable(JSON), nullable=True)

    project: Mapped[Project | None] = relationship(back_populates="meetings")


# ─────────────────────────────── Business Analysis ─────────────────────────


class BusinessAnalysis(Base):
    """One per project: the narrative current state / future state / objectives."""

    __tablename__ = "business_analyses"

    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id"), primary_key=True)
    current_state: Mapped[str] = mapped_column(Text, nullable=False, default="")
    future_state: Mapped[str] = mapped_column(Text, nullable=False, default="")
    objectives: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Highest GAP-nnn number ever issued, so codes are never reused after a delete.
    last_gap_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    project: Mapped[Project] = relationship(back_populates="analysis")


class AnalysisGap(Base):
    __tablename__ = "analysis_gaps"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    area: Mapped[str] = mapped_column(String(255), nullable=False)
    current: Mapped[str] = mapped_column(Text, nullable=False, default="")
    target: Mapped[str] = mapped_column(Text, nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    impact: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    requirement_ids: Mapped[list] = mapped_column(MutableList.as_mutable(JSON), nullable=False, default=list)

    project: Mapped[Project] = relationship(back_populates="gaps")


class Stakeholder(Base):
    __tablename__ = "stakeholders"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    organization: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    influence: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    interest: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    attitude: Mapped[str] = mapped_column(String(16), nullable=False, default="neutral")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")

    project: Mapped[Project] = relationship(back_populates="stakeholders")


class ProcessMap(Base):
    __tablename__ = "process_maps"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="as-is")
    # [{"actor": str, "action": str, "painPoint": str}]
    steps: Mapped[list] = mapped_column(MutableList.as_mutable(JSON), nullable=False, default=list)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False, default=utc_now_iso)

    project: Mapped[Project] = relationship(back_populates="process_maps")
