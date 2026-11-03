"use client";

import { Fragment, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Card, EmptyState, RelativeTime } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import type { ProcessKind, ProcessMap, ProcessMapInput, ProcessStep } from "@/lib/types";
import { ConfirmDelete, FormError, Modal, errorText } from "./shared";

const KIND_LABEL: Record<ProcessKind, string> = { "as-is": "As-is (today)", "to-be": "To-be (future)" };
const BLANK_STEP: ProcessStep = { actor: "", action: "", painPoint: "" };

const emptyForm = (kind: ProcessKind = "as-is"): ProcessMapInput => ({ name: "", kind, steps: [{ ...BLANK_STEP }], notes: "" });

function Flow({ steps }: { steps: ProcessStep[] }) {
  if (steps.length === 0) return <p className="cell-muted">No steps yet.</p>;
  return (
    <ol className="ba-flow">
      {steps.map((step, i) => (
        <Fragment key={i}>
          <li className={`ba-step${step.painPoint ? " ba-step-pain" : ""}`}>
            <span className="ba-step-num">{i + 1}</span>
            {step.actor && <span className="ba-step-actor">{step.actor}</span>}
            <span className="ba-step-action">{step.action}</span>
            {step.painPoint && (
              <span className="ba-step-painpoint">
                <Icon name="alert" size={12} /> {step.painPoint}
              </span>
            )}
          </li>
          {i < steps.length - 1 && (
            <li className="ba-flow-arrow" aria-hidden="true">
              <Icon name="arrow-right" size={16} />
            </li>
          )}
        </Fragment>
      ))}
    </ol>
  );
}

export function ProcessesTab({
  projectId,
  processes,
  onChanged,
}: {
  projectId: string;
  processes: ProcessMap[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<ProcessMap | null>(null);
  const [form, setForm] = useState<ProcessMapInput | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<ProcessMap | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAdd = (kind: ProcessKind) => {
    setEditing(null);
    setForm(emptyForm(kind));
    setFormError(null);
  };

  const openEdit = (p: ProcessMap) => {
    setEditing(p);
    setForm({ name: p.name, kind: p.kind, steps: p.steps.length ? p.steps.map((s) => ({ ...s })) : [{ ...BLANK_STEP }], notes: p.notes });
    setFormError(null);
  };

  /** Copy an as-is map into a new to-be draft: the usual starting point for redesign. */
  const openCopyToBe = (p: ProcessMap) => {
    setEditing(null);
    setForm({ name: `${p.name} (to-be)`, kind: "to-be", steps: p.steps.map((s) => ({ ...s, painPoint: "" })), notes: "" });
    setFormError(null);
  };

  const close = () => {
    setForm(null);
    setEditing(null);
  };

  const setStep = (i: number, patch: Partial<ProcessStep>) =>
    setForm((f) => (f ? { ...f, steps: f.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) } : f));

  const moveStep = (i: number, dir: -1 | 1) =>
    setForm((f) => {
      if (!f) return f;
      const j = i + dir;
      if (j < 0 || j >= f.steps.length) return f;
      const steps = [...f.steps];
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...f, steps };
    });

  const removeStep = (i: number) => setForm((f) => (f ? { ...f, steps: f.steps.filter((_, idx) => idx !== i) } : f));

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }
    // Rows left completely empty are dropped; a row with only an actor or pain point needs an action.
    const steps = form.steps.filter((s) => s.actor.trim() || s.action.trim() || s.painPoint.trim());
    const missing = steps.findIndex((s) => !s.action.trim());
    if (missing !== -1) {
      setFormError(`Step ${missing + 1} needs an action`);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = { ...form, steps };
      if (editing) await api.patchProcess(projectId, editing.id, payload);
      else await api.createProcess(projectId, payload);
      close();
      await onChanged();
    } catch (err) {
      setFormError(errorText(err, "Failed to save process map"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteProcess(projectId, toDelete.id);
      setToDelete(null);
      await onChanged();
    } catch (err) {
      setError(errorText(err, "Failed to delete process map"));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const section = (kind: ProcessKind) => {
    const list = processes.filter((p) => p.kind === kind);
    return (
      <Card
        title={`${KIND_LABEL[kind]} processes (${list.length})`}
        action={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openAdd(kind)}>
            <Icon name="plus" size={14} /> Add {kind} process
          </button>
        }
      >
        {list.length === 0 ? (
          <EmptyState
            compact
            icon="git-branch"
            title={kind === "as-is" ? "No as-is processes yet" : "No to-be processes yet"}
            description={
              kind === "as-is"
                ? "Map how work flows today, step by step, and mark the pain points."
                : "Map how the work will flow once the solution is in place."
            }
          />
        ) : (
          <div className="stack" style={{ gap: 16 }}>
            {list.map((p) => {
              const pains = p.steps.filter((s) => s.painPoint).length;
              return (
                <div key={p.id} className="ba-process">
                  <div className="ba-process-head">
                    <div>
                      <h3>{p.name}</h3>
                      <span className="cell-muted" style={{ fontSize: 12.5 }}>
                        {p.steps.length} step{p.steps.length === 1 ? "" : "s"} · updated <RelativeTime iso={p.updatedAt} />
                      </span>
                    </div>
                    <div className="action-btn-group">
                      {pains > 0 && (
                        <Badge tone="danger">
                          {pains} pain point{pains === 1 ? "" : "s"}
                        </Badge>
                      )}
                      {kind === "as-is" && (
                        <button type="button" className="icon-action-btn" title="Copy as to-be draft" onClick={() => openCopyToBe(p)}>
                          <Icon name="copy" size={14} />
                        </button>
                      )}
                      <button type="button" className="icon-action-btn" title="Edit" onClick={() => openEdit(p)}>
                        <Icon name="pencil" size={14} />
                      </button>
                      <button type="button" className="icon-action-btn danger" title="Delete" onClick={() => setToDelete(p)}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                  <Flow steps={p.steps} />
                  {p.notes && <p className="ba-process-notes">{p.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );
  };

  return (
    <>
      <FormError message={error} />
      {section("as-is")}
      {section("to-be")}

      {form && (
        <Modal
          title={editing ? `Edit ${editing.name}` : "Add process map"}
          subtitle="List the steps in order. Mark a pain point on any step that is slow, manual or error-prone."
          onClose={close}
          width={760}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Add process"}
              </button>
            </>
          }
        >
          <FormError message={formError} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pm-name">
                Process name <span className="req">*</span>
              </label>
              <input
                id="pm-name"
                autoFocus
                value={form.name}
                placeholder="e.g. Account opening"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="pm-kind">Type</label>
              <select id="pm-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ProcessKind })}>
                <option value="as-is">{KIND_LABEL["as-is"]}</option>
                <option value="to-be">{KIND_LABEL["to-be"]}</option>
              </select>
            </div>
            <div className="field span-2">
              <label>Steps</label>
              <div className="ba-step-editor">
                <div className="ba-step-row ba-step-row-head" aria-hidden="true">
                  <span>#</span>
                  <span>Who</span>
                  <span>Does what</span>
                  <span>Pain point (optional)</span>
                  <span />
                </div>
                {form.steps.map((step, i) => (
                  <div key={i} className="ba-step-row">
                    <span className="ba-step-num">{i + 1}</span>
                    <input aria-label={`Step ${i + 1} actor`} value={step.actor} placeholder="Customer" onChange={(e) => setStep(i, { actor: e.target.value })} />
                    <input
                      aria-label={`Step ${i + 1} action`}
                      value={step.action}
                      placeholder="Fills in paper form"
                      onChange={(e) => setStep(i, { action: e.target.value })}
                    />
                    <input
                      aria-label={`Step ${i + 1} pain point`}
                      value={step.painPoint}
                      placeholder="—"
                      onChange={(e) => setStep(i, { painPoint: e.target.value })}
                    />
                    <div className="action-btn-group">
                      <button type="button" className="icon-action-btn" title="Move up" disabled={i === 0} onClick={() => moveStep(i, -1)}>
                        <Icon name="chevron-down" size={14} className="ba-rotate-180" />
                      </button>
                      <button
                        type="button"
                        className="icon-action-btn"
                        title="Move down"
                        disabled={i === form.steps.length - 1}
                        onClick={() => moveStep(i, 1)}
                      >
                        <Icon name="chevron-down" size={14} />
                      </button>
                      <button type="button" className="icon-action-btn danger" title="Remove step" onClick={() => removeStep(i)}>
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ alignSelf: "flex-start" }}
                  disabled={form.steps.length >= 50}
                  onClick={() => setForm({ ...form, steps: [...form.steps, { ...BLANK_STEP }] })}
                >
                  <Icon name="plus" size={14} /> Add step
                </button>
              </div>
            </div>
            <div className="field span-2">
              <label htmlFor="pm-notes">Notes</label>
              <textarea id="pm-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}

      {toDelete && (
        <ConfirmDelete label={toDelete.name} busy={deleting} onCancel={() => setToDelete(null)} onConfirm={() => void confirmDelete()} />
      )}
    </>
  );
}
