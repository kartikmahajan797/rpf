"""Builds BRD / FRD sections (markdown) from what the project already holds.

Every section is plain data assembly: no AI involved, so the result is predictable and
works without an LLM key. The analyst edits the text afterwards.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from sqlalchemy.orm import Session

from ..models import AnalysisGap, BusinessAnalysis, Meeting, ProcessMap, Project, Requirement, SourceDocument, Stakeholder, TeamMember

KIND_LABEL = {"brd": "Business Requirements Document", "frd": "Functional Requirements Document"}
TYPE_LABEL = {
    "functional": "Functional",
    "non-functional": "Non-functional",
    "integration": "Integration",
    "compliance": "Compliance",
}
PRIORITY_LABEL = {"must": "Must have", "should": "Should have", "could": "Could have"}
PRIORITY_ORDER = {"must": 0, "should": 1, "could": 2}


@dataclass
class ProjectContext:
    project: Project
    owner: TeamMember | None
    analysis: BusinessAnalysis | None
    requirements: list[Requirement]
    gaps: list[AnalysisGap]
    stakeholders: list[Stakeholder]
    processes: list[ProcessMap]
    meetings: list[Meeting]
    sources: list[SourceDocument]
    gaps_by_req: dict[str, list[str]] = field(default_factory=dict)


def load_context(db: Session, project: Project) -> ProjectContext:
    pid = project.id
    requirements = db.query(Requirement).filter(Requirement.project_id == pid).order_by(Requirement.code).all()
    gaps = db.query(AnalysisGap).filter(AnalysisGap.project_id == pid).order_by(AnalysisGap.code).all()
    ctx = ProjectContext(
        project=project,
        owner=db.get(TeamMember, project.owner_id),
        analysis=db.get(BusinessAnalysis, pid),
        requirements=requirements,
        gaps=gaps,
        stakeholders=db.query(Stakeholder).filter(Stakeholder.project_id == pid).order_by(Stakeholder.name).all(),
        processes=db.query(ProcessMap).filter(ProcessMap.project_id == pid).order_by(ProcessMap.kind, ProcessMap.name).all(),
        meetings=db.query(Meeting).filter(Meeting.project_id == pid).order_by(Meeting.started_at).all(),
        sources=db.query(SourceDocument).filter(SourceDocument.project_id == pid).order_by(SourceDocument.name).all(),
    )
    for gap in gaps:
        for rid in gap.requirement_ids or []:
            ctx.gaps_by_req.setdefault(rid, []).append(gap.code)
    return ctx


# ─────────────────────────────── markdown helpers ──────────────────────────


def cell(value) -> str:
    """Make a value safe inside a markdown table cell."""
    text = " ".join(("" if value is None else str(value)).split())
    return text.replace("|", "\\|") or "—"


def table(headers: list[str], rows: list[list]) -> str:
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join(" --- " for _ in headers) + "|"]
    lines += ["| " + " | ".join(cell(v) for v in row) + " |" for row in rows]
    return "\n".join(lines)


def todo(text: str) -> str:
    return f"_{text}_"


def bullets(lines: list[str]) -> str:
    return "\n".join(f"- {line}" for line in lines)


def text_lines(text: str | None) -> list[str]:
    return [line.strip().lstrip("-*• ").strip() for line in (text or "").splitlines() if line.strip()]


def meeting_items(ctx: ProjectContext, key: str) -> list[str]:
    items = []
    for m in ctx.meetings:
        for item in (m.summary or {}).get(key, []) or []:
            if str(item).strip():
                items.append(f"{str(item).strip()} _({m.title})_")
    return items


def reqs_of(ctx: ProjectContext, types: set[str]) -> list[Requirement]:
    rows = [r for r in ctx.requirements if r.type in types]
    return sorted(rows, key=lambda r: (PRIORITY_ORDER.get(r.priority, 9), r.code))


# ─────────────────────────────── BRD sections ──────────────────────────────


def brd_summary(ctx: ProjectContext) -> str:
    p = ctx.project
    client = p.client or {}
    must = sum(1 for r in ctx.requirements if r.priority == "must")
    lines = [
        p.description.strip() or todo("Describe the engagement in two or three sentences."),
        "",
        table(
            ["Item", "Detail"],
            [
                ["Client", client.get("name", "")],
                ["Industry", client.get("industry", "")],
                ["Project owner", ctx.owner.name if ctx.owner else p.owner_id],
                ["Target date", p.due_date or "To be confirmed"],
                ["Requirements captured", f"{len(ctx.requirements)} ({must} must-have)"],
                ["Gaps identified", len(ctx.gaps)],
            ],
        ),
    ]
    return "\n".join(lines)


def brd_objectives(ctx: ProjectContext) -> str:
    lines = text_lines(ctx.analysis.objectives if ctx.analysis else "")
    return bullets(lines) if lines else todo("No business objectives recorded yet. Add them in Business Analysis → Current & future state.")


def brd_current(ctx: ProjectContext) -> str:
    text = (ctx.analysis.current_state if ctx.analysis else "").strip()
    return text or todo("Current state not described yet. Add it in Business Analysis.")


def brd_future(ctx: ProjectContext) -> str:
    text = (ctx.analysis.future_state if ctx.analysis else "").strip()
    return text or todo("Future state not described yet. Add it in Business Analysis.")


def brd_scope(ctx: ProjectContext) -> str:
    parts = ["### In scope"]
    if ctx.requirements:
        for type_key, label in TYPE_LABEL.items():
            rows = reqs_of(ctx, {type_key})
            if rows:
                parts.append(f"**{label}**")
                parts.append(bullets([f"{r.title} ({r.code})" for r in rows]))
    else:
        parts.append(todo("No requirements captured yet."))
    parts += ["### Out of scope", todo("List what this engagement explicitly does not cover.")]
    return "\n\n".join(parts)


def brd_stakeholders(ctx: ProjectContext) -> str:
    if not ctx.stakeholders:
        return todo("No stakeholders recorded yet. Add them in Business Analysis → Stakeholders.")
    return table(
        ["Name", "Role", "Organisation", "Influence", "Interest", "Attitude"],
        [[s.name, s.role, s.organization, s.influence.title(), s.interest.title(), s.attitude.title()] for s in ctx.stakeholders],
    )


def brd_requirements(ctx: ProjectContext) -> str:
    rows = reqs_of(ctx, set(TYPE_LABEL))
    if not rows:
        return todo("No requirements captured yet. Add them in the Requirements module.")
    return table(
        ["ID", "Requirement", "Type", "Priority", "Status"],
        [[r.code, r.title, TYPE_LABEL.get(r.type, r.type), PRIORITY_LABEL.get(r.priority, r.priority), r.status.title()] for r in rows],
    )


def brd_gaps(ctx: ProjectContext) -> str:
    if not ctx.gaps:
        return todo("No gaps identified yet. Add them in Business Analysis → Gap analysis.")
    return table(
        ["ID", "Area", "Today", "Target", "Impact", "Status"],
        [[g.code, g.area, g.current, g.target, g.impact.title(), g.status.replace("-", " ").title()] for g in ctx.gaps],
    )


def brd_decisions(ctx: ProjectContext) -> str:
    items = meeting_items(ctx, "decisions")
    return bullets(items) if items else todo("No decisions recorded yet. Summarise meetings in Meeting Intelligence to list them here.")


def brd_assumptions(ctx: ProjectContext) -> str:
    parts = ["### Assumptions", todo("List the assumptions this document relies on."), "### Constraints", todo("Budget, timeline, regulatory or technology constraints.")]
    risks = meeting_items(ctx, "open_questions")
    if risks:
        parts += ["### Open questions raised in meetings", bullets(risks)]
    return "\n\n".join(parts)


def brd_signoff(ctx: ProjectContext) -> str:
    rows = []
    if ctx.owner:
        rows.append([ctx.owner.name, f"{ctx.owner.role} (project owner)", "", ""])
    rows += [[s.name, s.role or s.organization, "", ""] for s in ctx.stakeholders if s.influence == "high"]
    if not rows:
        rows = [["", "", "", ""]]
    return table(["Name", "Role", "Signature", "Date"], rows)


# ─────────────────────────────── FRD sections ──────────────────────────────


def frd_intro(ctx: ProjectContext) -> str:
    p = ctx.project
    return "\n\n".join([
        f"This document describes the functional and non-functional behaviour the solution for "
        f"**{(p.client or {}).get('name', 'the client')}** must provide. It refines the Business Requirements "
        f"Document for *{p.name}* into testable requirements.",
        p.description.strip() or todo("Describe the engagement."),
        f"Source material: {len(ctx.sources)} document(s) and {len(ctx.meetings)} meeting(s).",
    ])


def frd_processes(ctx: ProjectContext) -> str:
    if not ctx.processes:
        return todo("No process maps yet. Add as-is / to-be processes in Business Analysis → Process maps.")
    parts = []
    for pm in ctx.processes:
        parts.append(f"### {pm.name} ({'As-is' if pm.kind == 'as-is' else 'To-be'})")
        steps = []
        for i, step in enumerate(pm.steps or [], start=1):
            line = f"{i}. "
            if step.get("actor"):
                line += f"**{step['actor']}**: "
            line += step.get("action", "")
            if step.get("painPoint"):
                line += f" _(pain point: {step['painPoint']})_"
            steps.append(line)
        parts.append("\n".join(steps) if steps else todo("No steps yet."))
        if (pm.notes or "").strip():
            parts.append(pm.notes.strip())
    return "\n\n".join(parts)


def req_block(ctx: ProjectContext, r: Requirement) -> str:
    lines = [
        f"### {r.code}: {r.title}",
        f"**Priority:** {PRIORITY_LABEL.get(r.priority, r.priority)} · **Status:** {r.status.title()}",
    ]
    if (r.description or "").strip():
        lines.append(r.description.strip())
    if (r.rationale or "").strip():
        lines.append(f"**Rationale:** {r.rationale.strip()}")
    if ctx.gaps_by_req.get(r.id):
        lines.append(f"**Closes gaps:** {', '.join(ctx.gaps_by_req[r.id])}")
    lines.append("**Acceptance criteria:** " + todo("to be defined"))
    return "\n\n".join(lines)


def frd_req_section(type_key: str) -> Callable[[ProjectContext], str]:
    def build(ctx: ProjectContext) -> str:
        rows = reqs_of(ctx, {type_key})
        if not rows:
            return todo(f"No {TYPE_LABEL[type_key].lower()} requirements captured yet.")
        return "\n\n".join(req_block(ctx, r) for r in rows)

    return build


def frd_traceability(ctx: ProjectContext) -> str:
    if not ctx.requirements:
        return todo("No requirements to trace yet.")
    source_names = {s.id: s.name for s in ctx.sources}
    return table(
        ["Requirement", "Type", "Priority", "Gaps", "Sources"],
        [
            [
                f"{r.code} {r.title}",
                TYPE_LABEL.get(r.type, r.type),
                PRIORITY_LABEL.get(r.priority, r.priority),
                ", ".join(ctx.gaps_by_req.get(r.id, [])),
                ", ".join(source_names[s] for s in (r.source_ids or []) if s in source_names),
            ]
            for r in ctx.requirements
        ],
    )


def frd_open_questions(ctx: ProjectContext) -> str:
    items = meeting_items(ctx, "open_questions")
    return bullets(items) if items else todo("No open questions recorded. Summarise meetings in Meeting Intelligence to list them here.")


def frd_assumptions(_: ProjectContext) -> str:
    return "\n\n".join([
        "### Assumptions",
        todo("List technical and functional assumptions."),
        "### Dependencies",
        todo("External systems, teams or decisions this solution depends on."),
    ])


# key, title, builder
TEMPLATES: dict[str, list[tuple[str, str, Callable[[ProjectContext], str]]]] = {
    "brd": [
        ("summary", "Executive summary", brd_summary),
        ("objectives", "Business objectives", brd_objectives),
        ("current-state", "Current state", brd_current),
        ("future-state", "Future state", brd_future),
        ("scope", "Scope", brd_scope),
        ("stakeholders", "Stakeholders", brd_stakeholders),
        ("requirements", "Business requirements", brd_requirements),
        ("gaps", "Gap analysis", brd_gaps),
        ("decisions", "Key decisions", brd_decisions),
        ("assumptions", "Assumptions, constraints & risks", brd_assumptions),
        ("sign-off", "Approval & sign-off", brd_signoff),
    ],
    "frd": [
        ("introduction", "Introduction & purpose", frd_intro),
        ("processes", "Business processes (as-is / to-be)", frd_processes),
        ("functional", "Functional requirements", frd_req_section("functional")),
        ("non-functional", "Non-functional requirements", frd_req_section("non-functional")),
        ("integration", "Integration requirements", frd_req_section("integration")),
        ("compliance", "Compliance & regulatory requirements", frd_req_section("compliance")),
        ("traceability", "Traceability matrix", frd_traceability),
        ("open-questions", "Open questions", frd_open_questions),
        ("assumptions", "Assumptions & dependencies", frd_assumptions),
    ],
}


def build_sections(ctx: ProjectContext, kind: str) -> list[dict]:
    return [{"key": key, "title": title, "body": build(ctx)} for key, title, build in TEMPLATES[kind]]


def build_section(ctx: ProjectContext, kind: str, key: str) -> dict | None:
    for k, title, build in TEMPLATES[kind]:
        if k == key:
            return {"key": k, "title": title, "body": build(ctx)}
    return None


def to_markdown(doc, project: Project) -> str:
    client = (project.client or {}).get("name", "")
    head = [
        f"# {doc.title}",
        "",
        f"**{KIND_LABEL.get(doc.kind, doc.kind)}** · Project: {project.name} · Client: {client} · "
        f"Version {doc.version} · Status: {doc.status.replace('-', ' ').title()} · Last updated {doc.updated_at[:10]}",
    ]
    body = [f"## {i}. {s['title']}\n\n{s.get('body', '').strip()}" for i, s in enumerate(doc.sections or [], start=1)]
    return "\n".join(head) + "\n\n" + "\n\n".join(body) + "\n"
