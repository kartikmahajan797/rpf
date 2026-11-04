"use client";

import { useState, type ReactNode } from "react";
import { ConfirmDelete, FormError, Modal, errorText } from "@/components/analysis/shared";
import { Icon } from "@/components/ui/Icon";
import { Card, EmptyState } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import type {
  ComponentInput,
  ComponentLayer,
  DecisionInput,
  DecisionStatus,
  DesignDecision,
  Integration,
  IntegrationDirection,
  IntegrationFrequency,
  IntegrationInput,
  IntegrationProtocol,
  IntegrationStatus,
  Requirement,
  SolutionComponent,
} from "@/lib/types";
import {
  DECISION_STATUS_LABEL,
  DIRECTION_LABEL,
  FREQUENCY_LABEL,
  INTEGRATION_STATUS_LABEL,
  LAYERS,
  LAYER_LABEL,
  PROTOCOL_LABEL,
  ReqChips,
  RequirementPicker,
  decisionTone,
  keys,
} from "./shared";

type Common = { projectId: string; requirements: Requirement[]; onChanged: () => Promise<void> };

/** Add/edit modal + delete confirm state shared by the three tabs. */
function useEditor<T extends { id: string }, I>(empty: I, toInput: (item: T) => I) {
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<I | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  return {
    editing,
    form,
    setForm,
    error,
    saving,
    toDelete,
    deleting,
    listError,
    setToDelete,
    openAdd: () => {
      setEditing(null);
      setForm(empty);
      setError(null);
    },
    openEdit: (item: T) => {
      setEditing(item);
      setForm(toInput(item));
      setError(null);
    },
    close: () => setForm(null),
    async save(call: (form: I, editing: T | null) => Promise<unknown>, validate: (form: I) => string | null, onDone: () => Promise<void>) {
      if (!form) return;
      const problem = validate(form);
      if (problem) return setError(problem);
      setSaving(true);
      setError(null);
      try {
        await call(form, editing);
        setForm(null);
        await onDone();
      } catch (err) {
        setError(errorText(err, "Failed to save"));
      } finally {
        setSaving(false);
      }
    },
    async remove(call: (item: T) => Promise<unknown>, onDone: () => Promise<void>) {
      if (!toDelete) return;
      setDeleting(true);
      try {
        await call(toDelete);
        await onDone();
      } catch (err) {
        setListError(errorText(err, "Failed to delete"));
      } finally {
        setToDelete(null);
        setDeleting(false);
      }
    },
  };
}

function EditModal({ title, subtitle, error, saving, onClose, onSave, children }: {
  title: string;
  subtitle: string;
  error: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      width={680}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">{children}</div>
    </Modal>
  );
}

function Actions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="action-btn-group" style={{ justifyContent: "flex-end" }}>
      <button type="button" className="icon-action-btn" title="Edit" onClick={onEdit}>
        <Icon name="pencil" size={14} />
      </button>
      <button type="button" className="icon-action-btn danger" title="Delete" onClick={onDelete}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

function Select<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {keys(options).map((k) => (
          <option key={k} value={k}>
            {options[k]}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─────────────────────────────── components ────────────────────────────────

const EMPTY_COMPONENT: ComponentInput = { name: "", layer: "service", technology: "", description: "", isNew: true, requirementIds: [] };

export function ComponentsTab({ projectId, requirements, onChanged, components }: Common & { components: SolutionComponent[] }) {
  const ed = useEditor<SolutionComponent, ComponentInput>(EMPTY_COMPONENT, ({ name, layer, technology, description, isNew, requirementIds }) => ({
    name, layer, technology, description, isNew, requirementIds,
  }));
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const f = ed.form;
  const layerOptions = Object.fromEntries(LAYERS.map((l) => [l, LAYER_LABEL[l]])) as Record<ComponentLayer, string>;

  return (
    <>
      <FormError message={ed.listError} />
      <Card
        flush
        title={`Components (${components.length})`}
        action={
          <button type="button" className="btn btn-primary btn-sm" onClick={ed.openAdd}>
            <Icon name="plus" size={14} /> Add component
          </button>
        }
      >
        {components.length === 0 ? (
          <EmptyState
            icon="layers"
            title="No components yet"
            description="Components are the building blocks of the solution: portals, services, databases, platforms. Mark existing client systems as “existing”."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Component</th>
                  <th scope="col">Layer</th>
                  <th scope="col">Technology</th>
                  <th scope="col">Build</th>
                  <th scope="col">Requirements</th>
                  <th scope="col" style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {components.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="cell-title">{c.name}</div>
                      {c.description && <div className="cell-sub">{c.description}</div>}
                    </td>
                    <td>{LAYER_LABEL[c.layer]}</td>
                    <td>{c.technology || <span className="cell-muted">—</span>}</td>
                    <td>
                      <Badge tone={c.isNew ? "info" : "neutral"}>{c.isNew ? "New" : "Existing"}</Badge>
                    </td>
                    <td>
                      <ReqChips ids={c.requirementIds} byId={byId} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Actions onEdit={() => ed.openEdit(c)} onDelete={() => ed.setToDelete(c)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {f && (
        <EditModal
          title={ed.editing ? `Edit ${ed.editing.name}` : "Add component"}
          subtitle="A building block of the solution, new or reused."
          error={ed.error}
          saving={ed.saving}
          onClose={ed.close}
          onSave={() =>
            void ed.save(
              (form, editing) => (editing ? api.patchComponent(projectId, editing.id, form) : api.createComponent(projectId, form)),
              (form) => (form.name.trim() ? null : "Name is required"),
              onChanged,
            )
          }
        >
          <div className="field span-2">
            <label htmlFor="sc-name">
              Name <span className="req">*</span>
            </label>
            <input id="sc-name" autoFocus value={f.name} placeholder="e.g. Customer portal" onChange={(e) => ed.setForm({ ...f, name: e.target.value })} />
          </div>
          <Select id="sc-layer" label="Layer" value={f.layer} options={layerOptions} onChange={(layer) => ed.setForm({ ...f, layer })} />
          <div className="field">
            <label htmlFor="sc-tech">Technology</label>
            <input id="sc-tech" value={f.technology} placeholder="e.g. Next.js, PostgreSQL" onChange={(e) => ed.setForm({ ...f, technology: e.target.value })} />
          </div>
          <div className="field span-2">
            <label htmlFor="sc-desc">Responsibility</label>
            <textarea id="sc-desc" rows={2} value={f.description} onChange={(e) => ed.setForm({ ...f, description: e.target.value })} />
          </div>
          <div className="field span-2">
            <label className="checkbox-inline">
              <input type="checkbox" checked={!f.isNew} onChange={(e) => ed.setForm({ ...f, isNew: !e.target.checked })} /> Existing client system (reused, not built)
            </label>
          </div>
          <div className="field span-2">
            <label>Delivers requirements</label>
            <RequirementPicker requirements={requirements} value={f.requirementIds} onChange={(requirementIds) => ed.setForm({ ...f, requirementIds })} />
          </div>
        </EditModal>
      )}

      {ed.toDelete && (
        <ConfirmDelete
          label={ed.toDelete.name}
          busy={ed.deleting}
          onCancel={() => ed.setToDelete(null)}
          onConfirm={() => void ed.remove((c) => api.deleteComponent(projectId, c.id), onChanged)}
        />
      )}
    </>
  );
}

// ─────────────────────────────── integrations ──────────────────────────────

const EMPTY_INTEGRATION: IntegrationInput = {
  name: "", externalSystem: "", direction: "outbound", protocol: "rest", frequency: "real-time", data: "", status: "proposed", requirementIds: [],
};

export function IntegrationsTab({ projectId, requirements, onChanged, integrations }: Common & { integrations: Integration[] }) {
  const ed = useEditor<Integration, IntegrationInput>(EMPTY_INTEGRATION, ({ name, externalSystem, direction, protocol, frequency, data, status, requirementIds }) => ({
    name, externalSystem, direction, protocol, frequency, data, status, requirementIds,
  }));
  const [busy, setBusy] = useState(false);
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const f = ed.form;
  const linked = new Set(integrations.flatMap((i) => i.requirementIds));
  const pending = requirements.filter((r) => r.type === "integration" && !linked.has(r.id)).length;

  const fromRequirements = async () => {
    setBusy(true);
    try {
      await api.integrationsFromRequirements(projectId);
      await onChanged();
    } catch (err) {
      window.alert(errorText(err, "Failed to create integrations"));
    } finally {
      setBusy(false);
    }
  };

  const quickStatus = async (i: Integration, status: IntegrationStatus) => {
    try {
      await api.patchIntegration(projectId, i.id, { status });
      await onChanged();
    } catch (err) {
      window.alert(errorText(err, "Failed to update"));
    }
  };

  return (
    <>
      <FormError message={ed.listError} />
      <Card
        flush
        title={`Integrations (${integrations.length})`}
        action={
          <div className="action-btn-group">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || pending === 0}
              title={pending ? `Create a proposed integration for each of the ${pending} integration requirement(s) without one` : "Every integration requirement already has an integration"}
              onClick={() => void fromRequirements()}
            >
              <Icon name="list-checks" size={14} /> From requirements{pending ? ` (${pending})` : ""}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={ed.openAdd}>
              <Icon name="plus" size={14} /> Add integration
            </button>
          </div>
        }
      >
        {integrations.length === 0 ? (
          <EmptyState icon="link" title="No integrations yet" description="List every data exchange with an external or existing system: which system, which way, how, how often and what data." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Integration</th>
                  <th scope="col">External system</th>
                  <th scope="col">Direction</th>
                  <th scope="col">How</th>
                  <th scope="col">Status</th>
                  <th scope="col">Requirements</th>
                  <th scope="col" style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="cell-title">{i.name}</div>
                      {i.data && <div className="cell-sub">{i.data}</div>}
                    </td>
                    <td>{i.externalSystem || <span className="cell-muted">—</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{DIRECTION_LABEL[i.direction]}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {PROTOCOL_LABEL[i.protocol]} · {FREQUENCY_LABEL[i.frequency]}
                    </td>
                    <td>
                      <select
                        className={`ba-status-select tone-${i.status === "agreed" ? "success" : "neutral"}`}
                        aria-label={`Status of ${i.name}`}
                        value={i.status}
                        onChange={(e) => void quickStatus(i, e.target.value as IntegrationStatus)}
                      >
                        {keys(INTEGRATION_STATUS_LABEL).map((s) => (
                          <option key={s} value={s}>
                            {INTEGRATION_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <ReqChips ids={i.requirementIds} byId={byId} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Actions onEdit={() => ed.openEdit(i)} onDelete={() => ed.setToDelete(i)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {f && (
        <EditModal
          title={ed.editing ? `Edit ${ed.editing.name}` : "Add integration"}
          subtitle="One data exchange between the solution and another system."
          error={ed.error}
          saving={ed.saving}
          onClose={ed.close}
          onSave={() =>
            void ed.save(
              (form, editing) => (editing ? api.patchIntegration(projectId, editing.id, form) : api.createIntegration(projectId, form)),
              (form) => (form.name.trim() ? null : "Name is required"),
              onChanged,
            )
          }
        >
          <div className="field">
            <label htmlFor="int-name">
              Name <span className="req">*</span>
            </label>
            <input id="int-name" autoFocus value={f.name} placeholder="e.g. Credit check" onChange={(e) => ed.setForm({ ...f, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="int-ext">External system</label>
            <input id="int-ext" value={f.externalSystem} placeholder="e.g. Experian" onChange={(e) => ed.setForm({ ...f, externalSystem: e.target.value })} />
          </div>
          <Select<IntegrationDirection> id="int-dir" label="Direction" value={f.direction} options={DIRECTION_LABEL} onChange={(direction) => ed.setForm({ ...f, direction })} />
          <Select<IntegrationProtocol> id="int-proto" label="Protocol" value={f.protocol} options={PROTOCOL_LABEL} onChange={(protocol) => ed.setForm({ ...f, protocol })} />
          <Select<IntegrationFrequency> id="int-freq" label="Frequency" value={f.frequency} options={FREQUENCY_LABEL} onChange={(frequency) => ed.setForm({ ...f, frequency })} />
          <Select<IntegrationStatus> id="int-status" label="Status" value={f.status} options={INTEGRATION_STATUS_LABEL} onChange={(status) => ed.setForm({ ...f, status })} />
          <div className="field span-2">
            <label htmlFor="int-data">Data exchanged</label>
            <textarea id="int-data" rows={2} value={f.data} placeholder="e.g. Applicant ID, credit score, decision" onChange={(e) => ed.setForm({ ...f, data: e.target.value })} />
          </div>
          <div className="field span-2">
            <label>Implements requirements</label>
            <RequirementPicker requirements={requirements} value={f.requirementIds} onChange={(requirementIds) => ed.setForm({ ...f, requirementIds })} />
          </div>
        </EditModal>
      )}

      {ed.toDelete && (
        <ConfirmDelete
          label={ed.toDelete.name}
          busy={ed.deleting}
          onCancel={() => ed.setToDelete(null)}
          onConfirm={() => void ed.remove((i) => api.deleteIntegration(projectId, i.id), onChanged)}
        />
      )}
    </>
  );
}

// ─────────────────────────────── decisions ─────────────────────────────────

const EMPTY_DECISION: DecisionInput = { title: "", context: "", decision: "", alternatives: "", consequences: "", status: "proposed" };

export function DecisionsTab({ projectId, onChanged, decisions }: Omit<Common, "requirements"> & { decisions: DesignDecision[] }) {
  const ed = useEditor<DesignDecision, DecisionInput>(EMPTY_DECISION, ({ title, context, decision, alternatives, consequences, status }) => ({
    title, context, decision, alternatives, consequences, status,
  }));
  const f = ed.form;

  return (
    <>
      <FormError message={ed.listError} />
      <Card
        title={`Architecture decisions (${decisions.length})`}
        action={
          <button type="button" className="btn btn-primary btn-sm" onClick={ed.openAdd}>
            <Icon name="plus" size={14} /> Record decision
          </button>
        }
      >
        {decisions.length === 0 ? (
          <EmptyState
            icon="git-branch"
            title="No decisions recorded"
            description="Record each significant design choice (hosting, database, build vs buy…) with its context, the alternatives and the consequences, so the reasoning survives handoff."
          />
        ) : (
          <div className="sd-decisions">
            {decisions.map((d) => (
              <article key={d.id} className="sd-decision">
                <header>
                  <code className="ba-code">{d.code}</code>
                  <strong>{d.title}</strong>
                  <Badge tone={decisionTone(d.status)}>{DECISION_STATUS_LABEL[d.status]}</Badge>
                  <span style={{ marginLeft: "auto" }}>
                    <Actions onEdit={() => ed.openEdit(d)} onDelete={() => ed.setToDelete(d)} />
                  </span>
                </header>
                <dl>
                  {(
                    [
                      ["Context", d.context],
                      ["Decision", d.decision],
                      ["Alternatives", d.alternatives],
                      ["Consequences", d.consequences],
                    ] as const
                  )
                    .filter(([, text]) => text.trim())
                    .map(([label, text]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd className="ba-pre">{text}</dd>
                      </div>
                    ))}
                </dl>
              </article>
            ))}
          </div>
        )}
      </Card>

      {f && (
        <EditModal
          title={ed.editing ? `Edit ${ed.editing.code}` : "Record decision"}
          subtitle="An architecture decision record: what was decided, and why."
          error={ed.error}
          saving={ed.saving}
          onClose={ed.close}
          onSave={() =>
            void ed.save(
              (form, editing) => (editing ? api.patchDecision(projectId, editing.id, form) : api.createDecision(projectId, form)),
              (form) => (form.title.trim() ? null : "Title is required"),
              onChanged,
            )
          }
        >
          <div className="field">
            <label htmlFor="adr-title">
              Title <span className="req">*</span>
            </label>
            <input id="adr-title" autoFocus value={f.title} placeholder="e.g. Host on Azure" onChange={(e) => ed.setForm({ ...f, title: e.target.value })} />
          </div>
          <Select<DecisionStatus> id="adr-status" label="Status" value={f.status} options={DECISION_STATUS_LABEL} onChange={(status) => ed.setForm({ ...f, status })} />
          {(
            [
              ["context", "Context", "What forces this decision? Constraints, requirements, risks."],
              ["decision", "Decision", "What was chosen."],
              ["alternatives", "Alternatives considered", "Options rejected and why."],
              ["consequences", "Consequences", "Trade-offs, follow-up work, risks accepted."],
            ] as const
          ).map(([key, label, help]) => (
            <div key={key} className="field span-2">
              <label htmlFor={`adr-${key}`}>{label}</label>
              <textarea id={`adr-${key}`} rows={2} value={f[key]} onChange={(e) => ed.setForm({ ...f, [key]: e.target.value })} />
              <span className="field-help">{help}</span>
            </div>
          ))}
        </EditModal>
      )}

      {ed.toDelete && (
        <ConfirmDelete
          label={`${ed.toDelete.code}: ${ed.toDelete.title}`}
          busy={ed.deleting}
          onCancel={() => ed.setToDelete(null)}
          onConfirm={() => void ed.remove((d) => api.deleteDecision(projectId, d.id), onChanged)}
        />
      )}
    </>
  );
}
