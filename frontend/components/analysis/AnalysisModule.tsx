"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Card, StatCard, Tabs } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { useProjects } from "@/lib/projects-store";
import type { AnalysisOverview, AnalysisSuggestion, Project, Requirement } from "@/lib/types";
import { GapsTab } from "./GapsTab";
import { ProcessesTab } from "./ProcessesTab";
import { StakeholdersTab } from "./StakeholdersTab";
import { StateTab } from "./StateTab";
import { FormError, LEVEL_LABEL, Modal, errorText, levelTone } from "./shared";

type TabKey = "state" | "gaps" | "stakeholders" | "processes";

type StateField = "currentState" | "futureState" | "objectives";
const STATE_FIELDS: { key: StateField; label: string }[] = [
  { key: "currentState", label: "Current state" },
  { key: "futureState", label: "Future state" },
  { key: "objectives", label: "Business objectives" },
];

export function AnalysisModule({ project }: { project: Project }) {
  const { reload } = useProjects();

  const [data, setData] = useState<AnalysisOverview | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("state");
  const [stateDirty, setStateDirty] = useState(false);

  // AI draft
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<AnalysisSuggestion | null>(null);
  const [useField, setUseField] = useState<Record<StateField, boolean>>({ currentState: true, futureState: true, objectives: true });
  const [useGap, setUseGap] = useState<boolean[]>([]);
  const [applying, setApplying] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [overview, reqs] = await Promise.all([api.getAnalysis(project.id), api.listRequirements(project.id)]);
      setData(overview);
      setRequirements(reqs);
      setError(null);
    } catch (err) {
      setError(errorText(err, "Failed to load business analysis"));
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api
      .aiStatus()
      .then((s) => setAiEnabled(s.enabled))
      .catch(() => setAiEnabled(false));
  }, []);

  /** After any change: refresh this screen and the shared project store (activity feed, updatedAt). */
  const onChanged = useCallback(async () => {
    await load();
    await reload();
  }, [load, reload]);

  const changeTab = (next: TabKey) => {
    if (tab === "state" && stateDirty && !window.confirm("You have unsaved changes to the current / future state. Leave without saving?")) return;
    setStateDirty(false);
    setTab(next);
  };

  // ── AI draft ──────────────────────────────────────────────────────────────

  const startDraft = async () => {
    setDrafting(true);
    setError(null);
    try {
      const suggestion = await api.suggestAnalysis(project.id);
      setDraft(suggestion);
      setUseField({
        currentState: !!suggestion.currentState,
        futureState: !!suggestion.futureState,
        objectives: !!suggestion.objectives,
      });
      setUseGap(suggestion.gaps.map(() => true));
      setDraftError(null);
    } catch (err) {
      setError(errorText(err, "AI draft failed"));
    } finally {
      setDrafting(false);
    }
  };

  const applyDraft = async () => {
    if (!draft) return;
    setApplying(true);
    setDraftError(null);
    try {
      const stateInput = Object.fromEntries(STATE_FIELDS.filter((f) => useField[f.key]).map((f) => [f.key, draft[f.key]]));
      if (Object.keys(stateInput).length) await api.saveAnalysisState(project.id, stateInput);
      const gaps = draft.gaps.filter((_, i) => useGap[i]);
      if (gaps.length) {
        await api.bulkCreateGaps(
          project.id,
          gaps.map((g) => ({ ...g, status: "open" as const, requirementIds: [] })),
        );
      }
      setDraft(null);
      setStateDirty(false);
      await onChanged();
    } catch (err) {
      setDraftError(errorText(err, "Failed to save the draft"));
    } finally {
      setApplying(false);
    }
  };

  if (!data) {
    return error ? (
      <FormError message={error} />
    ) : (
      <Card>
        <p className="cell-muted">Loading business analysis…</p>
      </Card>
    );
  }

  const hasSourceMaterial = requirements.length > 0 || project.counts.requirements > 0;
  const draftDisabledReason =
    aiEnabled === false
      ? "Configure LLM_PROVIDER and LLM_API_KEY in backend/.env to enable AI"
      : drafting
        ? "Drafting…"
        : undefined;

  const openGaps = data.gaps.filter((g) => g.status !== "closed").length;
  const painPoints = data.processMaps.reduce((n, p) => n + p.steps.filter((s) => s.painPoint).length, 0);
  const stateDone = [data.state.currentState, data.state.futureState].filter((s) => s.trim()).length;
  const selectedCount = STATE_FIELDS.filter((f) => useField[f.key] && draft?.[f.key]).length + useGap.filter(Boolean).length;

  return (
    <div className="stack">
      <FormError message={error} />

      <div className="stats-grid">
        <StatCard label="Current / future state" value={`${stateDone}/2`} icon="file-text" hint={stateDone === 2 ? "Both written" : "Still to describe"} />
        <StatCard label="Open gaps" value={openGaps} icon="chart" hint={`${data.gaps.length} identified in total`} />
        <StatCard label="Stakeholders" value={data.stakeholders.length} icon="users" hint={`${data.stakeholders.filter((s) => s.attitude === "resistant").length} resistant`} />
        <StatCard label="Process maps" value={data.processMaps.length} icon="git-branch" hint={`${painPoints} pain point${painPoints === 1 ? "" : "s"} marked`} />
      </div>

      <div className="ba-toolbar">
        <Tabs<TabKey>
          label="Business analysis sections"
          value={tab}
          onChange={changeTab}
          tabs={[
            { value: "state", label: "Current & future state" },
            { value: "gaps", label: "Gap analysis", count: data.gaps.length },
            { value: "stakeholders", label: "Stakeholders", count: data.stakeholders.length },
            { value: "processes", label: "Process maps", count: data.processMaps.length },
          ]}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={aiEnabled === false || drafting}
          title={draftDisabledReason ?? (hasSourceMaterial ? "Draft current/future state and gaps from requirements and meetings" : undefined)}
          onClick={() => void startDraft()}
        >
          <Icon name="sparkle" size={14} /> {drafting ? "Drafting…" : "Draft with AI"}
        </button>
      </div>

      {tab === "state" && <StateTab projectId={project.id} state={data.state} onSaved={onChanged} onDirtyChange={setStateDirty} />}
      {tab === "gaps" && <GapsTab projectId={project.id} gaps={data.gaps} requirements={requirements} onChanged={onChanged} />}
      {tab === "stakeholders" && <StakeholdersTab projectId={project.id} stakeholders={data.stakeholders} onChanged={onChanged} />}
      {tab === "processes" && <ProcessesTab projectId={project.id} processes={data.processMaps} onChanged={onChanged} />}

      {draft && (
        <Modal
          title="Review AI draft"
          subtitle="Drafted from this project's requirements and meetings. Nothing is saved until you choose what to keep."
          onClose={() => setDraft(null)}
          width={760}
          footer={
            <>
              <span className="cell-muted" style={{ marginRight: "auto", fontSize: 13 }}>
                Ticked state fields replace the saved text; ticked gaps are added.
              </span>
              <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)} disabled={applying}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={applying || selectedCount === 0} onClick={() => void applyDraft()}>
                {applying ? "Saving…" : `Save ${selectedCount} selected`}
              </button>
            </>
          }
        >
          <FormError message={draftError} />
          {stateDirty && <div className="ba-alert ba-alert-warning">You have unsaved edits on the state tab; ticked fields below will replace them.</div>}
          <div className="ai-extract-list" style={{ maxHeight: 480 }}>
            {STATE_FIELDS.filter((f) => draft[f.key]).map((f) => (
              <label key={f.key} className="ai-extract-item">
                <input type="checkbox" checked={useField[f.key]} onChange={() => setUseField((u) => ({ ...u, [f.key]: !u[f.key] }))} />
                <div className="ai-extract-body">
                  <div className="cell-title">{f.label}</div>
                  <div className="ba-pre">{draft[f.key]}</div>
                </div>
              </label>
            ))}
            {draft.gaps.length > 0 && <div className="ba-draft-heading">Suggested gaps ({draft.gaps.length})</div>}
            {draft.gaps.map((g, i) => (
              <label key={i} className="ai-extract-item">
                <input type="checkbox" checked={!!useGap[i]} onChange={() => setUseGap((u) => u.map((v, j) => (j === i ? !v : v)))} />
                <div className="ai-extract-body">
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="cell-title">{g.area}</span>
                    <Badge tone={levelTone(g.impact)}>{LEVEL_LABEL[g.impact]} impact</Badge>
                  </div>
                  {g.description && <div className="cell-sub">{g.description}</div>}
                  <div className="ba-cell-compare" style={{ marginTop: 4 }}>
                    <div>
                      <span className="ba-tag">Now</span> {g.current || "—"}
                    </div>
                    <div>
                      <span className="ba-tag ba-tag-target">Target</span> {g.target || "—"}
                    </div>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
