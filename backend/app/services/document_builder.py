"""Builds BRD / FRD / proposal / deck sections (markdown) from what the project already holds.

Every section is plain data assembly: no AI involved, so the result is predictable and
works without an LLM key. The analyst edits the text afterwards.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from sqlalchemy.orm import Session

from ..models import (
    AnalysisGap, BusinessAnalysis, Meeting, ProcessMap, Project, Requirement, SolutionComponent, SolutionDesign,
    SourceDocument, Stakeholder, TeamMember,
)

KIND_LABEL = {"brd": "Business Requirements Document", "frd": "Functional Requirements Document", "proposal": "Client Proposal", "deck": "Presentation"}
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
    design: SolutionDesign | None = None
    components: list[SolutionComponent] = field(default_factory=list)
    estimate: Any = None  # schemas.estimation.EstimationOverview


def load_context(db: Session, project: Project) -> ProjectContext:
    # Imported here because the estimation router itself depends on this package.
    from ..routers.estimation import overview as estimation_overview

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
        design=db.get(SolutionDesign, pid),
        components=db.query(SolutionComponent).filter(SolutionComponent.project_id == pid).order_by(SolutionComponent.layer, SolutionComponent.name).all(),
        estimate=estimation_overview(db, pid),
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


# ─────────────────────────────── proposal sections ─────────────────────────

MODEL_LABEL = {"tbd": "To be decided", "fixed-price": "Fixed price", "time-and-materials": "Time & materials", "milestone": "Milestone based"}
PHASE_LABEL = {"discovery": "Discovery", "design": "Design", "build": "Build", "test": "Test", "deploy": "Deploy", "support": "Support"}


def money(ctx: ProjectContext, value: float) -> str:
    return f"{ctx.estimate.settings.currency} {value:,.2f}"


def client_name(ctx: ProjectContext) -> str:
    return (ctx.project.client or {}).get("name", "") or "the client"


def design_text(ctx: ProjectContext, attr: str) -> str:
    return (getattr(ctx.design, attr) or "").strip() if ctx.design else ""


def has_price(ctx: ProjectContext) -> bool:
    return bool(ctx.estimate.items)


def price_table(ctx: ProjectContext) -> str:
    s, t = ctx.estimate.settings, ctx.estimate.summary
    return table(
        ["Item", "Amount"],
        [
            ["Professional services", money(ctx, t.subtotal)],
            [f"Contingency ({s.contingency_pct:g}%)", money(ctx, t.contingency_amount)],
            [f"Discount ({s.discount_pct:g}%)", f"-{money(ctx, t.discount_amount)}"],
            ["**Total**", f"**{money(ctx, t.total)}**"],
        ],
    )


def prop_summary(ctx: ProjectContext) -> str:
    parts = [ctx.project.description.strip() or todo("Summarise the engagement and the outcome it delivers.")]
    rows = [["Client", client_name(ctx)], ["Requirements in scope", len(ctx.requirements)]]
    if has_price(ctx):
        t = ctx.estimate.summary
        rows += [["Estimated effort", f"{t.total_days:g} days"], ["Minimum duration", f"{t.duration_weeks:g} weeks"], ["Investment", money(ctx, t.total)]]
    return "\n\n".join(parts + [table(["Item", "Detail"], rows)])


def prop_understanding(ctx: ProjectContext) -> str:
    return "\n\n".join(["### Where you are today", brd_current(ctx), "### What you want to achieve", brd_objectives(ctx), "### Where you want to be", brd_future(ctx)])


def prop_scope(ctx: ProjectContext) -> str:
    rows = reqs_of(ctx, set(TYPE_LABEL))
    in_scope = table(["ID", "Requirement", "Type", "Priority"], [[r.code, r.title, TYPE_LABEL.get(r.type, r.type), PRIORITY_LABEL.get(r.priority, r.priority)] for r in rows]) if rows else todo("No requirements captured yet.")
    return "\n\n".join(["### In scope", in_scope, "### Out of scope", todo("List what this proposal explicitly does not cover.")])


def prop_solution(ctx: ProjectContext) -> str:
    parts = [design_text(ctx, "overview") or todo("Solution overview not written yet. Add it in Solution Design.")]
    style = design_text(ctx, "architecture_style")
    if style:
        parts.append(f"**Architecture:** {style}")
    if ctx.components:
        parts.append(table(["Component", "Technology", "Build"], [[c.name, c.technology, "New" if c.is_new else "Existing"] for c in ctx.components]))
    return "\n\n".join(parts)


def prop_approach(ctx: ProjectContext) -> str:
    parts = [design_text(ctx, "technical_approach") or todo("Delivery approach not written yet. Add it in Solution Design.")]
    t = ctx.estimate.summary
    if t.by_phase:
        parts += ["### Delivery phases", table(["Phase", "Effort (days)"], [[PHASE_LABEL[p.phase], f"{p.days:g}"] for p in t.by_phase]), f"Minimum duration: {t.duration_weeks:g} weeks."]
    return "\n\n".join(parts)


def prop_team(ctx: ProjectContext) -> str:
    if not ctx.estimate.roles:
        return todo("No team defined yet. Add roles in Estimation & Pricing.")
    return table(["Role", "Headcount"], [[r.name, r.headcount] for r in ctx.estimate.roles])


def prop_commercials(ctx: ProjectContext) -> str:
    if not has_price(ctx):
        return todo("No estimate yet. Add effort items in Estimation & Pricing.")
    parts = [f"**Commercial model:** {MODEL_LABEL[ctx.estimate.settings.commercial_model]}", price_table(ctx)]
    if ctx.estimate.summary.unassigned_days:
        parts.append(todo(f"{ctx.estimate.summary.unassigned_days:g} days have no role and are not priced. Assign roles before sending."))
    return "\n\n".join(parts)


def prop_assumptions(ctx: ProjectContext) -> str:
    return ctx.estimate.settings.assumptions.strip() or todo("List what this price and timeline rely on. Add them in Estimation & Pricing.")


def prop_next_steps(ctx: ProjectContext) -> str:
    return "\n".join(["1. Review this proposal with your stakeholders.", "2. Confirm scope, commercial model and start date.", "3. Sign below so we can schedule kick-off.", "", table(["Name", "Role", "Signature", "Date"], [["", "", "", ""]])])


# ─────────────────────────────── deck slides ───────────────────────────────


def deck_overview(ctx: ProjectContext) -> str:
    lines = [f"Client: {client_name(ctx)}", f"{len(ctx.requirements)} requirements captured", f"{len(ctx.stakeholders)} stakeholders engaged"]
    return (ctx.project.description.strip() or todo("One-sentence summary of the engagement.")) + "\n\n" + bullets(lines)


def deck_challenge(ctx: ProjectContext) -> str:
    items = [f"{g.area}: {g.description or g.target}" for g in ctx.gaps if g.status != "closed"][:6]
    return bullets(items) if items else brd_current(ctx)


def deck_objectives(ctx: ProjectContext) -> str:
    return brd_objectives(ctx)


def deck_solution(ctx: ProjectContext) -> str:
    items = [f"{c.name}" + (f" ({c.technology})" if c.technology else "") for c in ctx.components][:7]
    head = design_text(ctx, "architecture_style") or design_text(ctx, "overview").split("\n")[0]
    return "\n\n".join(x for x in [head or todo("Summarise the solution. Add it in Solution Design."), bullets(items) if items else ""] if x)


def deck_scope(ctx: ProjectContext) -> str:
    rows = reqs_of(ctx, set(TYPE_LABEL))
    if not rows:
        return todo("No requirements captured yet.")
    lines = [f"{r.code}: {r.title}" for r in rows[:7]]
    if len(rows) > 7:
        lines.append(f"…and {len(rows) - 7} more")
    return bullets(lines)


def deck_timeline(ctx: ProjectContext) -> str:
    t = ctx.estimate.summary
    if not t.by_phase:
        return todo("No estimate yet. Add effort items in Estimation & Pricing.")
    return bullets([f"{PHASE_LABEL[p.phase]}: {p.days:g} days" for p in t.by_phase] + [f"Minimum duration: {t.duration_weeks:g} weeks", f"Team: {sum(r.headcount for r in ctx.estimate.roles)} people"])


def deck_investment(ctx: ProjectContext) -> str:
    if not has_price(ctx):
        return todo("No estimate yet. Add effort items in Estimation & Pricing.")
    return bullets([f"Commercial model: {MODEL_LABEL[ctx.estimate.settings.commercial_model]}", f"Total investment: {money(ctx, ctx.estimate.summary.total)}"])


def deck_next_steps(_: ProjectContext) -> str:
    return bullets(["Confirm scope and commercial model", "Agree start date and team", "Sign the proposal and schedule kick-off"])


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
    "proposal": [
        ("summary", "Executive summary", prop_summary),
        ("understanding", "Our understanding", prop_understanding),
        ("scope", "Scope of work", prop_scope),
        ("solution", "Proposed solution", prop_solution),
        ("approach", "Delivery approach & timeline", prop_approach),
        ("team", "Team", prop_team),
        ("commercials", "Commercials", prop_commercials),
        ("assumptions", "Assumptions", prop_assumptions),
        ("next-steps", "Next steps & acceptance", prop_next_steps),
    ],
    "deck": [
        ("overview", "Overview", deck_overview),
        ("challenge", "The challenge", deck_challenge),
        ("objectives", "Objectives", deck_objectives),
        ("solution", "Proposed solution", deck_solution),
        ("scope", "Scope", deck_scope),
        ("timeline", "Timeline & team", deck_timeline),
        ("investment", "Investment", deck_investment),
        ("next-steps", "Next steps", deck_next_steps),
    ],
}


def build_sections(ctx: ProjectContext, kind: str) -> list[dict]:
    return [{"key": key, "title": title, "body": build(ctx)} for key, title, build in TEMPLATES[kind]]


def build_section(ctx: ProjectContext, kind: str, key: str) -> dict | None:
    for k, title, build in TEMPLATES[kind]:
        if k == key:
            return {"key": k, "title": title, "body": build(ctx)}
    return None


def sections_from_template(ctx: ProjectContext, kind: str, sections: list[dict]) -> list[dict]:
    """Follow a saved template. A blank section with a standard key is filled from project data."""
    out = []
    for section in sections:
        body = section.get("body", "")
        if not body.strip():
            fresh = build_section(ctx, kind, section["key"])
            body = fresh["body"] if fresh else ""
        out.append({"key": section["key"], "title": section["title"], "body": body})
    return out


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
