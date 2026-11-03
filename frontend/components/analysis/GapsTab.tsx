"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Card, EmptyState } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import type { AnalysisGap, GapInput, GapStatus, Level, Requirement } from "@/lib/types";
import {
  ConfirmDelete,
  FormError,
  GAP_STATUSES,
  GAP_STATUS_LABEL,
  LEVELS,
  LEVEL_LABEL,
  Modal,
  errorText,
  gapStatusTone,
  levelTone,
} from "./shared";

const EMPTY: GapInput = {
  area: "",
  current: "",
  target: "",
  description: "",
  impact: "medium",
  status: "open",
  requirementIds: [],
};

export function GapsTab({
  projectId,
  gaps,
  requirements,
  onChanged,
}: {
  projectId: string;
  gaps: AnalysisGap[];
  requirements: Requirement[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<AnalysisGap | null>(null);
  const [form, setForm] = useState<GapInput | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<AnalysisGap | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reqById = new Map(requirements.map((r) => [r.id, r]));

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
  };

  const openEdit = (gap: AnalysisGap) => {
    setEditing(gap);
    setForm({
      area: gap.area,
      current: gap.current,
      target: gap.target,
      description: gap.description,
      impact: gap.impact,
      status: gap.status,
      requirementIds: gap.requirementIds,
    });
    setFormError(null);
  };

  const close = () => {
    setForm(null);
    setEditing(null);
  };

  const save = async () => {
    if (!form) return;
    if (!form.area.trim()) {
      setFormError("Area is required");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) await api.patchGap(projectId, editing.id, form);
      else await api.createGap(projectId, form);
      close();
      await onChanged();
    } catch (err) {
      setFormError(errorText(err, "Failed to save gap"));
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (gap: AnalysisGap, status: GapStatus) => {
    setBusyId(gap.id);
    setError(null);
    try {
      await api.patchGap(projectId, gap.id, { status });
      await onChanged();
    } catch (err) {
      setError(errorText(err, "Failed to update status"));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteGap(projectId, toDelete.id);
      setToDelete(null);
      await onChanged();
    } catch (err) {
      setError(errorText(err, "Failed to delete gap"));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const toggleReq = (id: string) =>
    setForm((f) =>
      f ? { ...f, requirementIds: f.requirementIds.includes(id) ? f.requirementIds.filter((r) => r !== id) : [...f.requirementIds, id] } : f,
    );

  const open = gaps.filter((g) => g.status !== "closed");
  const highOpen = open.filter((g) => g.impact === "high").length;

  return (
    <>
      <FormError message={error} />
      <Card
        flush
        title={`Gap analysis (${gaps.length})`}
        action={
          <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
            <Icon name="plus" size={14} /> Add gap
          </button>
        }
      >
        {gaps.length > 0 && (
          <div className="ba-summary">
            <span>
              <strong>{open.length}</strong> open
            </span>
            <span>
              <strong className={highOpen ? "ba-text-danger" : undefined}>{highOpen}</strong> high-impact open
            </span>
            <span>
              <strong>{gaps.length - open.length}</strong> closed
            </span>
          </div>
        )}
        {gaps.length === 0 ? (
          <EmptyState
            icon="chart"
            title="No gaps identified yet"
            description="A gap is the difference between how something works today and how it should work. Add one, or use “Draft with AI” above."
            action={
              <button type="button" className="btn btn-primary" onClick={openAdd}>
                <Icon name="plus" size={14} /> Add gap
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 90 }}>Code</th>
                  <th scope="col">Area / gap</th>
                  <th scope="col">Current → Target</th>
                  <th scope="col">Impact</th>
                  <th scope="col">Status</th>
                  <th scope="col">Requirements</th>
                  <th scope="col" style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((gap) => (
                  <tr key={gap.id}>
                    <td>
                      <code className="ba-code">{gap.code}</code>
                    </td>
                    <td>
                      <div className="cell-title">{gap.area}</div>
                      {gap.description && <div className="cell-sub">{gap.description}</div>}
                    </td>
                    <td className="ba-cell-compare">
                      <div>
                        <span className="ba-tag">Now</span> {gap.current || <span className="cell-muted">—</span>}
                      </div>
                      <div>
                        <span className="ba-tag ba-tag-target">Target</span> {gap.target || <span className="cell-muted">—</span>}
                      </div>
                    </td>
                    <td>
                      <Badge tone={levelTone(gap.impact)}>{LEVEL_LABEL[gap.impact]}</Badge>
                    </td>
                    <td>
                      <select
                        className={`ba-status-select tone-${gapStatusTone(gap.status)}`}
                        aria-label={`Status of ${gap.code}`}
                        value={gap.status}
                        disabled={busyId === gap.id}
                        onChange={(e) => void quickStatus(gap, e.target.value as GapStatus)}
                      >
                        {GAP_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {GAP_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {gap.requirementIds.length === 0 ? (
                        <span className="cell-muted">—</span>
                      ) : (
                        <div className="ba-chips">
                          {gap.requirementIds.map((id) => {
                            const r = reqById.get(id);
                            return r ? (
                              <span key={id} className="ba-chip" title={r.title}>
                                {r.code}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="action-btn-group" style={{ justifyContent: "flex-end" }}>
                        <button type="button" className="icon-action-btn" title="Edit" onClick={() => openEdit(gap)}>
                          <Icon name="pencil" size={14} />
                        </button>
                        <button type="button" className="icon-action-btn danger" title="Delete" onClick={() => setToDelete(gap)}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {form && (
        <Modal
          title={editing ? `Edit ${editing.code}` : "Add gap"}
          subtitle="Describe what is different between today and the target, and what it affects."
          onClose={close}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Add gap"}
              </button>
            </>
          }
        >
          <FormError message={formError} />
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="gap-area">
                Area <span className="req">*</span>
              </label>
              <input
                id="gap-area"
                autoFocus
                value={form.area}
                placeholder="e.g. Customer onboarding"
                onChange={(e) => setForm({ ...form, area: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="gap-current">Current (today)</label>
              <textarea id="gap-current" rows={3} value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="gap-target">Target (future)</label>
              <textarea id="gap-target" rows={3} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
            </div>
            <div className="field span-2">
              <label htmlFor="gap-desc">What must change</label>
              <textarea
                id="gap-desc"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="gap-impact">Impact</label>
              <select id="gap-impact" value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value as Level })}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="gap-status">Status</label>
              <select id="gap-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as GapStatus })}>
                {GAP_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {GAP_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field span-2">
              <label>Linked requirements</label>
              {requirements.length === 0 ? (
                <span className="field-help">This project has no requirements yet.</span>
              ) : (
                <div className="source-checkbox-list">
                  {requirements.map((r) => (
                    <label key={r.id} className="source-checkbox-item">
                      <input type="checkbox" checked={form.requirementIds.includes(r.id)} onChange={() => toggleReq(r.id)} />
                      <span>
                        <code className="ba-code">{r.code}</code> {r.title}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {toDelete && (
        <ConfirmDelete
          label={`${toDelete.code}: ${toDelete.area}`}
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </>
  );
}
