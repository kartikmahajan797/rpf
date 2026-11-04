"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDelete, FormError, Modal, errorText } from "@/components/analysis/shared";
import { Icon } from "@/components/ui/Icon";
import { Card, EmptyState, StatCard, Tabs } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { useProjects } from "@/lib/projects-store";
import type { Backlog, BacklogSuggestion, Epic, Project, Requirement, StoryStatus, UserStory } from "@/lib/types";
import { EMPTY_STORY, StoryModal, toInput } from "./StoryModal";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, priorityTone, statusTone } from "./shared";

type View = "list" | "board";
const NO_EPIC = "__none__";

export function StoriesModule({ project }: { project: Project }) {
  const { reload } = useProjects();
  const [data, setData] = useState<Backlog | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [busy, setBusy] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);

  // Filters
  const [q, setQ] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fEpic, setFEpic] = useState("");

  // Modals
  const [storyModal, setStoryModal] = useState<{ story: UserStory | null; epicId: string | null } | null>(null);
  const [epicModal, setEpicModal] = useState<{ epic: Epic | null; title: string; description: string } | null>(null);
  const [epicError, setEpicError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<{ kind: "story"; item: UserStory } | { kind: "epic"; item: Epic } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // AI draft
  const [draft, setDraft] = useState<BacklogSuggestion | null>(null);
  const [pick, setPick] = useState<boolean[][]>([]);
  const [draftError, setDraftError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [backlog, reqs] = await Promise.all([api.getBacklog(project.id), api.listRequirements(project.id)]);
      setData(backlog);
      setRequirements(reqs);
      setError(null);
    } catch (err) {
      setError(errorText(err, "Failed to load user stories"));
    }
  }, [project.id]);

  useEffect(() => {
    void load();
    api
      .aiStatus()
      .then((s) => setAiEnabled(s.enabled))
      .catch(() => setAiEnabled(false));
  }, [load]);

  const onChanged = useCallback(async () => {
    await load();
    await reload();
  }, [load, reload]);

  const reqById = useMemo(() => new Map(requirements.map((r) => [r.id, r])), [requirements]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.stories.filter(
      (s) =>
        (!fPriority || s.priority === fPriority) &&
        (!fStatus || s.status === fStatus) &&
        (!fEpic || (fEpic === NO_EPIC ? !s.epicId : s.epicId === fEpic)) &&
        (!needle || [s.code, s.title, s.persona, s.goal, s.benefit].some((t) => t.toLowerCase().includes(needle))),
    );
  }, [data, q, fPriority, fStatus, fEpic]);

  if (!data) {
    return error ? (
      <FormError message={error} />
    ) : (
      <Card>
        <p className="cell-muted">Loading user stories…</p>
      </Card>
    );
  }

  // ── actions ──────────────────────────────────────────────────────────────

  const act = async (label: string, fn: () => Promise<unknown>, fallback: string) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  const quickStatus = (s: UserStory, status: StoryStatus) => act(s.id, () => api.patchStory(project.id, s.id, { status }), "Failed to update status");

  const fromRequirements = () => act("from-reqs", () => api.storiesFromRequirements(project.id), "Failed to create stories");

  const saveEpic = async () => {
    if (!epicModal) return;
    if (!epicModal.title.trim()) {
      setEpicError("Title is required");
      return;
    }
    setBusy("epic");
    setEpicError(null);
    try {
      const input = { title: epicModal.title, description: epicModal.description };
      if (epicModal.epic) await api.patchEpic(project.id, epicModal.epic.id, input);
      else await api.createEpic(project.id, input);
      setEpicModal(null);
      await onChanged();
    } catch (err) {
      setEpicError(errorText(err, "Failed to save epic"));
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    await act(
      "delete",
      () => (target.kind === "story" ? api.deleteStory(project.id, target.item.id) : api.deleteEpic(project.id, target.item.id)),
      "Failed to delete",
    );
    setToDelete(null);
  };

  const startDraft = async () => {
    setBusy("ai");
    setError(null);
    try {
      const s = await api.suggestStories(project.id);
      if (!s.epics.length) throw new Error("The AI did not suggest any stories.");
      setDraft(s);
      setPick(s.epics.map((e) => e.stories.map(() => true)));
      setDraftError(null);
    } catch (err) {
      setError(errorText(err, "AI draft failed"));
    } finally {
      setBusy(null);
    }
  };

  const applyDraft = async () => {
    if (!draft) return;
    setBusy("apply");
    setDraftError(null);
    try {
      const groups = draft.epics
        .map((e, i) => ({ title: e.title, description: e.description, stories: e.stories.filter((_, j) => pick[i]?.[j]) }))
        .filter((g) => g.stories.length);
      await api.bulkCreateStories(project.id, groups);
      setDraft(null);
      await onChanged();
    } catch (err) {
      setDraftError(errorText(err, "Failed to save stories"));
    } finally {
      setBusy(null);
    }
  };

  // ── derived numbers ──────────────────────────────────────────────────────

  const { stories, epics } = data;
  const covered = new Set(stories.flatMap((s) => s.requirementIds));
  const coveredCount = requirements.filter((r) => covered.has(r.id)).length;
  const uncovered = requirements.length - coveredCount;
  const points = stories.reduce((n, s) => n + (s.storyPoints ?? 0), 0);
  const unestimated = stories.filter((s) => s.storyPoints == null).length;
  const noCriteria = stories.filter((s) => s.acceptanceCriteria.length === 0).length;
  const done = stories.filter((s) => s.status === "done").length;
  const selectedCount = pick.flat().filter(Boolean).length;
  const filtering = !!(q || fPriority || fStatus || fEpic);

  const groups: { key: string; epic: Epic | null; stories: UserStory[] }[] = [
    ...epics.map((e) => ({ key: e.id, epic: e, stories: filtered.filter((s) => s.epicId === e.id) })),
    { key: NO_EPIC, epic: null, stories: filtered.filter((s) => !s.epicId || !epics.some((e) => e.id === s.epicId)) },
  ].filter((g) => g.epic || g.stories.length);

  const storyRow = (s: UserStory) => (
    <div key={s.id} className="us-row">
      <div className="us-row-main">
        <div className="us-row-top">
          <code className="ba-code">{s.code}</code>
          <button type="button" className="doc-link" onClick={() => setStoryModal({ story: s, epicId: s.epicId })}>
            {s.title}
          </button>
          <Badge tone={priorityTone(s.priority)}>{PRIORITY_LABEL[s.priority]}</Badge>
          {s.storyPoints != null ? <span className="us-points" title="Story points">{s.storyPoints} pt</span> : <span className="us-points us-points-none">? pt</span>}
        </div>
        {(s.persona || s.goal) && (
          <div className="us-sentence">
            As a <strong>{s.persona || "user"}</strong>, I want {s.goal || s.title}
            {s.benefit && <>, so that {s.benefit}</>}.
          </div>
        )}
        <div className="us-row-foot">
          <span className={s.acceptanceCriteria.length ? "" : "us-warn"}>
            <Icon name="check" size={12} /> {s.acceptanceCriteria.length} acceptance criteri{s.acceptanceCriteria.length === 1 ? "on" : "a"}
          </span>
          {s.requirementIds.length > 0 && (
            <span className="ba-chips">
              {s.requirementIds.map((id) => {
                const r = reqById.get(id);
                return r ? (
                  <span key={id} className="ba-chip" title={r.title}>
                    {r.code}
                  </span>
                ) : null;
              })}
            </span>
          )}
        </div>
      </div>
      <div className="us-row-actions">
        <select
          className={`ba-status-select tone-${statusTone(s.status)}`}
          aria-label={`Status of ${s.code}`}
          value={s.status}
          disabled={busy === s.id}
          onChange={(e) => void quickStatus(s, e.target.value as StoryStatus)}
        >
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {STATUS_LABEL[st]}
            </option>
          ))}
        </select>
        <button type="button" className="icon-action-btn" title="Edit" onClick={() => setStoryModal({ story: s, epicId: s.epicId })}>
          <Icon name="pencil" size={14} />
        </button>
        <button type="button" className="icon-action-btn danger" title="Delete" onClick={() => setToDelete({ kind: "story", item: s })}>
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="stack">
      <FormError message={error} />

      <div className="stats-grid">
        <StatCard label="User stories" value={stories.length} icon="book" hint={`${epics.length} epic${epics.length === 1 ? "" : "s"} · ${done} done`} />
        <StatCard label="Story points" value={points} icon="calculator" hint={unestimated ? `${unestimated} not estimated` : "All estimated"} />
        <StatCard
          label="Requirement coverage"
          value={requirements.length ? `${coveredCount}/${requirements.length}` : "—"}
          icon="list-checks"
          hint={requirements.length ? (uncovered ? `${uncovered} without a story` : "Every requirement covered") : "No requirements yet"}
        />
        <StatCard label="Missing criteria" value={noCriteria} icon="alert" hint={noCriteria ? "Stories without acceptance criteria" : "All stories have criteria"} />
      </div>

      <div className="ba-toolbar">
        <Tabs<View>
          label="Backlog view"
          value={view}
          onChange={setView}
          tabs={[
            { value: "list", label: "By epic", count: stories.length },
            { value: "board", label: "Board" },
          ]}
        />
        <div className="us-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!!busy || uncovered === 0}
            title={uncovered ? `Create a draft story for each of the ${uncovered} requirement(s) no story covers yet` : "Every requirement already has a story"}
            onClick={() => void fromRequirements()}
          >
            <Icon name="list-checks" size={14} /> {busy === "from-reqs" ? "Creating…" : `From requirements${uncovered ? ` (${uncovered})` : ""}`}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!!busy || aiEnabled === false || requirements.length === 0}
            title={
              aiEnabled === false
                ? "Configure LLM_PROVIDER and LLM_API_KEY in backend/.env to enable AI"
                : requirements.length === 0
                  ? "Add requirements first"
                  : "Draft epics, stories and acceptance criteria from requirements"
            }
            onClick={() => void startDraft()}
          >
            <Icon name="sparkle" size={14} /> {busy === "ai" ? "Drafting…" : "Draft with AI"}
          </button>
          <a className="btn btn-secondary btn-sm" href={api.exportStoriesUrl(project.id)} title="CSV for Jira / Azure DevOps import">
            <Icon name="download" size={14} /> CSV
          </a>
        </div>
      </div>

      <div className="us-filters">
        <div className="input-icon">
          <Icon name="search" size={15} />
          <input type="search" placeholder="Search stories" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stories" />
        </div>
        <select value={fEpic} onChange={(e) => setFEpic(e.target.value)} aria-label="Filter by epic">
          <option value="">All epics</option>
          {epics.map((e) => (
            <option key={e.id} value={e.id}>
              {e.code} · {e.title}
            </option>
          ))}
          <option value={NO_EPIC}>No epic</option>
        </select>
        <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} aria-label="Filter by priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <div className="us-filters-spacer" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEpicModal({ epic: null, title: "", description: "" })}>
          <Icon name="plus" size={14} /> Epic
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setStoryModal({ story: null, epicId: fEpic && fEpic !== NO_EPIC ? fEpic : null })}>
          <Icon name="plus" size={14} /> Story
        </button>
      </div>

      {stories.length === 0 && epics.length === 0 ? (
        <Card>
          <EmptyState
            icon="book"
            title="No user stories yet"
            description={
              requirements.length
                ? "Turn this project's requirements into stories in one click, draft them with AI, or write your own."
                : "Add requirements first, or write stories by hand."
            }
            action={
              <div className="action-btn-group">
                {requirements.length > 0 && (
                  <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => void fromRequirements()}>
                    <Icon name="list-checks" size={14} /> Create from requirements
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={() => setStoryModal({ story: null, epicId: null })}>
                  <Icon name="plus" size={14} /> Add story
                </button>
              </div>
            }
          />
        </Card>
      ) : view === "list" ? (
        <>
          {filtering && filtered.length === 0 && (
            <Card>
              <EmptyState compact icon="search" title="No stories match these filters" />
            </Card>
          )}
          {groups.map((g) =>
            filtering && g.stories.length === 0 ? null : (
              <Card
                key={g.key}
                flush
                className="us-epic-card"
                title={
                  <button type="button" className="us-epic-toggle" onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}>
                    <Icon name={collapsed[g.key] ? "chevron-right" : "chevron-down"} size={16} />
                    {g.epic ? (
                      <>
                        <code className="ba-code">{g.epic.code}</code> {g.epic.title}
                      </>
                    ) : (
                      "Stories without an epic"
                    )}
                    <span className="tab-count">{g.stories.length}</span>
                    <span className="us-epic-points">{g.stories.reduce((n, s) => n + (s.storyPoints ?? 0), 0)} pts</span>
                  </button>
                }
                action={
                  g.epic ? (
                    <div className="action-btn-group">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStoryModal({ story: null, epicId: g.epic!.id })}>
                        <Icon name="plus" size={14} /> Story
                      </button>
                      <button
                        type="button"
                        className="icon-action-btn"
                        title="Edit epic"
                        onClick={() => setEpicModal({ epic: g.epic, title: g.epic!.title, description: g.epic!.description })}
                      >
                        <Icon name="pencil" size={14} />
                      </button>
                      <button type="button" className="icon-action-btn danger" title="Delete epic" onClick={() => setToDelete({ kind: "epic", item: g.epic! })}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  ) : undefined
                }
              >
                {!collapsed[g.key] && (
                  <>
                    {g.epic?.description && <p className="us-epic-desc">{g.epic.description}</p>}
                    {g.stories.length === 0 ? (
                      <p className="us-epic-empty cell-muted">No stories in this epic yet.</p>
                    ) : (
                      <div className="us-list">{g.stories.map(storyRow)}</div>
                    )}
                  </>
                )}
              </Card>
            ),
          )}
        </>
      ) : (
        <div className="us-board">
          {STATUSES.map((st) => {
            const col = filtered.filter((s) => s.status === st);
            return (
              <div key={st} className="us-board-col">
                <div className="us-board-head">
                  <Badge tone={statusTone(st)} dot>
                    {STATUS_LABEL[st]}
                  </Badge>
                  <span className="cell-muted">
                    {col.length} · {col.reduce((n, s) => n + (s.storyPoints ?? 0), 0)} pts
                  </span>
                </div>
                {col.map((s) => {
                  const epic = epics.find((e) => e.id === s.epicId);
                  const idx = STATUSES.indexOf(st);
                  return (
                    <div key={s.id} className="us-card">
                      <div className="us-row-top">
                        <code className="ba-code">{s.code}</code>
                        <Badge tone={priorityTone(s.priority)}>{PRIORITY_LABEL[s.priority]}</Badge>
                        <span className="us-points">{s.storyPoints ?? "?"} pt</span>
                      </div>
                      <button type="button" className="doc-link us-card-title" onClick={() => setStoryModal({ story: s, epicId: s.epicId })}>
                        {s.title}
                      </button>
                      {epic && <div className="cell-sub">{epic.title}</div>}
                      <div className="us-card-move">
                        <button
                          type="button"
                          className="icon-action-btn"
                          title={idx > 0 ? `Move to ${STATUS_LABEL[STATUSES[idx - 1]]}` : undefined}
                          disabled={idx === 0 || busy === s.id}
                          onClick={() => void quickStatus(s, STATUSES[idx - 1])}
                        >
                          <Icon name="chevron-left" size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-action-btn"
                          title={idx < STATUSES.length - 1 ? `Move to ${STATUS_LABEL[STATUSES[idx + 1]]}` : undefined}
                          disabled={idx === STATUSES.length - 1 || busy === s.id}
                          onClick={() => void quickStatus(s, STATUSES[idx + 1])}
                        >
                          <Icon name="chevron-right" size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {col.length === 0 && <p className="cell-muted us-board-empty">Nothing here</p>}
              </div>
            );
          })}
        </div>
      )}

      {storyModal && (
        <StoryModal
          projectId={project.id}
          story={storyModal.story}
          initial={storyModal.story ? toInput(storyModal.story) : { ...EMPTY_STORY, epicId: storyModal.epicId }}
          epics={epics}
          requirements={requirements}
          onClose={() => setStoryModal(null)}
          onSaved={onChanged}
        />
      )}

      {epicModal && (
        <Modal
          title={epicModal.epic ? `Edit ${epicModal.epic.code}` : "Add epic"}
          subtitle="An epic groups related stories into one larger capability."
          onClose={() => setEpicModal(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEpicModal(null)} disabled={busy === "epic"}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveEpic()} disabled={busy === "epic"}>
                {busy === "epic" ? "Saving…" : epicModal.epic ? "Save changes" : "Add epic"}
              </button>
            </>
          }
        >
          <FormError message={epicError} />
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="epic-title">
                Title <span className="req">*</span>
              </label>
              <input id="epic-title" autoFocus value={epicModal.title} placeholder="e.g. Digital onboarding" onChange={(e) => setEpicModal({ ...epicModal, title: e.target.value })} />
            </div>
            <div className="field span-2">
              <label htmlFor="epic-desc">Description</label>
              <textarea id="epic-desc" rows={3} value={epicModal.description} onChange={(e) => setEpicModal({ ...epicModal, description: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}

      {toDelete && (
        <ConfirmDelete
          label={
            toDelete.kind === "story"
              ? `${toDelete.item.code}: ${toDelete.item.title}`
              : `${toDelete.item.code}: ${toDelete.item.title} (its stories are kept, without an epic)`
          }
          busy={busy === "delete"}
          onCancel={() => setToDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}

      {draft && (
        <Modal
          title="Review AI backlog draft"
          subtitle="Drafted from this project's requirements and meetings. Nothing is saved until you choose what to keep."
          onClose={() => setDraft(null)}
          width={820}
          footer={
            <>
              <span className="cell-muted" style={{ marginRight: "auto", fontSize: 13 }}>
                Each epic with a ticked story is created as a new epic.
              </span>
              <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)} disabled={busy === "apply"}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={busy === "apply" || selectedCount === 0} onClick={() => void applyDraft()}>
                {busy === "apply" ? "Saving…" : `Save ${selectedCount} stor${selectedCount === 1 ? "y" : "ies"}`}
              </button>
            </>
          }
        >
          <FormError message={draftError} />
          <div className="ai-extract-list" style={{ maxHeight: 500 }}>
            {draft.epics.map((e, i) => (
              <div key={i}>
                <div className="ba-draft-heading">
                  Epic: {e.title} ({e.stories.length})
                </div>
                {e.description && <p className="cell-sub" style={{ margin: "2px 0 6px" }}>{e.description}</p>}
                {e.stories.map((s, j) => (
                  <label key={j} className="ai-extract-item">
                    <input
                      type="checkbox"
                      checked={!!pick[i]?.[j]}
                      onChange={() => setPick((p) => p.map((row, a) => (a === i ? row.map((v, b) => (b === j ? !v : v)) : row)))}
                    />
                    <div className="ai-extract-body">
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span className="cell-title">{s.title}</span>
                        <Badge tone={priorityTone(s.priority)}>{PRIORITY_LABEL[s.priority]}</Badge>
                        {s.storyPoints != null && <span className="us-points">{s.storyPoints} pt</span>}
                        {s.requirementIds.map((id) => (
                          <span key={id} className="ba-chip">
                            {reqById.get(id)?.code ?? id}
                          </span>
                        ))}
                      </div>
                      <div className="us-sentence">
                        As a <strong>{s.persona || "user"}</strong>, I want {s.goal}
                        {s.benefit && <>, so that {s.benefit}</>}.
                      </div>
                      {s.acceptanceCriteria.length > 0 && (
                        <ul className="us-ac-list">
                          {s.acceptanceCriteria.map((c, k) => (
                            <li key={k}>{c}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
