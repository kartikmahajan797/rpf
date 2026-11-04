"use client";

import { useCallback, useEffect, useState } from "react";
import { FormError, Modal, errorText } from "@/components/analysis/shared";
import { Markdown } from "@/components/documents/Markdown";
import { Icon } from "@/components/ui/Icon";
import { Card, StatCard, Tabs } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { useProjects } from "@/lib/projects-store";
import type { Project, Requirement, SolutionOverview, SolutionSuggestion } from "@/lib/types";
import { DesignTab } from "./DesignTab";
import { ComponentsTab, DecisionsTab, IntegrationsTab } from "./ItemTabs";
import { HOSTING_LABEL, LAYER_LABEL, PROTOCOL_LABEL } from "./shared";

type TabKey = "design" | "components" | "integrations" | "decisions";
type DesignField = "overview" | "architectureStyle" | "technicalApproach" | "nfrApproach" | "hosting";
const DESIGN_FIELDS: { key: DesignField; label: string }[] = [
  { key: "overview", label: "Solution overview" },
  { key: "hosting", label: "Hosting" },
  { key: "architectureStyle", label: "Architecture style" },
  { key: "technicalApproach", label: "Build & delivery approach" },
  { key: "nfrApproach", label: "Non-functional approach" },
];

export function SolutionModule({ project }: { project: Project }) {
  const { reload } = useProjects();
  const [data, setData] = useState<SolutionOverview | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("design");
  const [designDirty, setDesignDirty] = useState(false);

  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<SolutionSuggestion | null>(null);
  const [useField, setUseField] = useState<Record<DesignField, boolean>>({ overview: true, hosting: true, architectureStyle: true, technicalApproach: true, nfrApproach: true });
  const [pick, setPick] = useState<{ components: boolean[]; integrations: boolean[]; decisions: boolean[] }>({ components: [], integrations: [], decisions: [] });
  const [applying, setApplying] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [overview, reqs] = await Promise.all([api.getSolution(project.id), api.listRequirements(project.id)]);
      setData(overview);
      setRequirements(reqs);
      setError(null);
    } catch (err) {
      setError(errorText(err, "Failed to load solution design"));
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

  if (!data) {
    return error ? (
      <FormError message={error} />
    ) : (
      <Card>
        <p className="cell-muted">Loading solution design…</p>
      </Card>
    );
  }

  const changeTab = (next: TabKey) => {
    if (tab === "design" && designDirty && !window.confirm("You have unsaved changes to the technical approach. Leave without saving?")) return;
    setDesignDirty(false);
    setTab(next);
  };

  const startDraft = async () => {
    setDrafting(true);
    setError(null);
    try {
      const s = await api.suggestSolution(project.id);
      setDraft(s);
      setUseField({
        overview: !!s.overview,
        hosting: s.hosting !== "tbd",
        architectureStyle: !!s.architectureStyle,
        technicalApproach: !!s.technicalApproach,
        nfrApproach: !!s.nfrApproach,
      });
      setPick({ components: s.components.map(() => true), integrations: s.integrations.map(() => true), decisions: s.decisions.map(() => true) });
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
      const design = Object.fromEntries(DESIGN_FIELDS.filter((f) => useField[f.key]).map((f) => [f.key, draft[f.key]]));
      if (Object.keys(design).length) await api.saveSolutionDesign(project.id, design);
      const bulk = {
        components: draft.components.filter((_, i) => pick.components[i]),
        integrations: draft.integrations.filter((_, i) => pick.integrations[i]),
        decisions: draft.decisions.filter((_, i) => pick.decisions[i]),
      };
      if (bulk.components.length + bulk.integrations.length + bulk.decisions.length) await api.bulkCreateSolution(project.id, bulk);
      setDraft(null);
      setDesignDirty(false);
      await onChanged();
    } catch (err) {
      setDraftError(errorText(err, "Failed to save the draft"));
    } finally {
      setApplying(false);
    }
  };

  const toggle = (list: "components" | "integrations" | "decisions", i: number) =>
    setPick((p) => ({ ...p, [list]: p[list].map((v, j) => (j === i ? !v : v)) }));

  // Requirement coverage: requirements delivered by a component or an integration.
  const covered = new Set([...data.components, ...data.integrations].flatMap((x) => x.requirementIds));
  const coveredCount = requirements.filter((r) => covered.has(r.id)).length;
  const approachDone = [data.design.overview, data.design.technicalApproach, data.design.nfrApproach].filter((s) => s.trim()).length;
  const accepted = data.decisions.filter((d) => d.status === "accepted").length;
  const selectedCount =
    DESIGN_FIELDS.filter((f) => useField[f.key] && draft && (f.key === "hosting" ? draft.hosting !== "tbd" : draft[f.key])).length +
    pick.components.filter(Boolean).length +
    pick.integrations.filter(Boolean).length +
    pick.decisions.filter(Boolean).length;

  return (
    <div className="stack">
      <FormError message={error} />

      <div className="stats-grid">
        <StatCard label="Approach written" value={`${approachDone}/3`} icon="file-text" hint={`Hosting: ${HOSTING_LABEL[data.design.hosting]}`} />
        <StatCard label="Components" value={data.components.length} icon="layers" hint={`${data.components.filter((c) => c.isNew).length} new · ${data.components.filter((c) => !c.isNew).length} existing`} />
        <StatCard label="Integrations" value={data.integrations.length} icon="link" hint={`${data.integrations.filter((i) => i.status === "agreed").length} agreed with the client`} />
        <StatCard
          label="Requirement coverage"
          value={requirements.length ? `${coveredCount}/${requirements.length}` : "—"}
          icon="list-checks"
          hint={`${accepted}/${data.decisions.length} decisions accepted`}
        />
      </div>

      <div className="ba-toolbar">
        <Tabs<TabKey>
          label="Solution design sections"
          value={tab}
          onChange={changeTab}
          tabs={[
            { value: "design", label: "Approach & architecture" },
            { value: "components", label: "Components", count: data.components.length },
            { value: "integrations", label: "Integrations", count: data.integrations.length },
            { value: "decisions", label: "Decisions", count: data.decisions.length },
          ]}
        />
        <div className="us-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={aiEnabled === false || drafting}
            title={aiEnabled === false ? "Configure LLM_PROVIDER and LLM_API_KEY in backend/.env to enable AI" : "Draft the approach, components, integrations and decisions from requirements and meetings"}
            onClick={() => void startDraft()}
          >
            <Icon name="sparkle" size={14} /> {drafting ? "Drafting…" : "Draft with AI"}
          </button>
          <a className="btn btn-secondary btn-sm" href={api.exportSolutionUrl(project.id)} title="Download the solution design as Markdown">
            <Icon name="download" size={14} /> Markdown
          </a>
        </div>
      </div>

      {tab === "design" && <DesignTab projectId={project.id} data={data} onSaved={onChanged} onDirtyChange={setDesignDirty} />}
      {tab === "components" && <ComponentsTab projectId={project.id} requirements={requirements} components={data.components} onChanged={onChanged} />}
      {tab === "integrations" && <IntegrationsTab projectId={project.id} requirements={requirements} integrations={data.integrations} onChanged={onChanged} />}
      {tab === "decisions" && <DecisionsTab projectId={project.id} decisions={data.decisions} onChanged={onChanged} />}

      {draft && (
        <Modal
          title="Review AI solution draft"
          subtitle="Drafted from this project's requirements and meetings. Nothing is saved until you choose what to keep."
          onClose={() => setDraft(null)}
          width={820}
          footer={
            <>
              <span className="cell-muted" style={{ marginRight: "auto", fontSize: 13 }}>
                Ticked approach fields replace the saved text; ticked items are added.
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
          {designDirty && <div className="ba-alert ba-alert-warning">You have unsaved edits on the approach tab; ticked fields below will replace them.</div>}
          <div className="ai-extract-list" style={{ maxHeight: 500 }}>
            {DESIGN_FIELDS.filter((f) => (f.key === "hosting" ? draft.hosting !== "tbd" : draft[f.key])).map((f) => (
              <label key={f.key} className="ai-extract-item">
                <input type="checkbox" checked={useField[f.key]} onChange={() => setUseField((u) => ({ ...u, [f.key]: !u[f.key] }))} />
                <div className="ai-extract-body">
                  <div className="cell-title">{f.label}</div>
                  {f.key === "hosting" ? <div>{HOSTING_LABEL[draft.hosting]}</div> : <Markdown text={draft[f.key]} />}
                </div>
              </label>
            ))}
            {draft.components.length > 0 && <div className="ba-draft-heading">Components ({draft.components.length})</div>}
            {draft.components.map((c, i) => (
              <label key={`c${i}`} className="ai-extract-item">
                <input type="checkbox" checked={!!pick.components[i]} onChange={() => toggle("components", i)} />
                <div className="ai-extract-body">
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="cell-title">{c.name}</span>
                    <Badge tone={c.isNew ? "info" : "neutral"}>{c.isNew ? "New" : "Existing"}</Badge>
                    <span className="cell-muted">{LAYER_LABEL[c.layer]}{c.technology ? ` · ${c.technology}` : ""}</span>
                  </div>
                  {c.description && <div className="cell-sub">{c.description}</div>}
                </div>
              </label>
            ))}
            {draft.integrations.length > 0 && <div className="ba-draft-heading">Integrations ({draft.integrations.length})</div>}
            {draft.integrations.map((it, i) => (
              <label key={`i${i}`} className="ai-extract-item">
                <input type="checkbox" checked={!!pick.integrations[i]} onChange={() => toggle("integrations", i)} />
                <div className="ai-extract-body">
                  <div className="cell-title">
                    {it.name}
                    {it.externalSystem && <span className="cell-muted"> · {it.externalSystem}</span>}
                  </div>
                  <div className="cell-sub">
                    {PROTOCOL_LABEL[it.protocol]} · {it.direction} · {it.frequency}
                    {it.data && ` · ${it.data}`}
                  </div>
                </div>
              </label>
            ))}
            {draft.decisions.length > 0 && <div className="ba-draft-heading">Decisions ({draft.decisions.length})</div>}
            {draft.decisions.map((d, i) => (
              <label key={`d${i}`} className="ai-extract-item">
                <input type="checkbox" checked={!!pick.decisions[i]} onChange={() => toggle("decisions", i)} />
                <div className="ai-extract-body">
                  <div className="cell-title">{d.title}</div>
                  {d.decision && <div className="cell-sub">{d.decision}</div>}
                </div>
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
