"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Card, EmptyState } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import type { Level, Stakeholder, StakeholderAttitude, StakeholderInput } from "@/lib/types";
import {
  ATTITUDES,
  ATTITUDE_LABEL,
  ConfirmDelete,
  FormError,
  LEVELS,
  LEVEL_LABEL,
  Modal,
  attitudeTone,
  errorText,
  levelTone,
} from "./shared";

const EMPTY: StakeholderInput = {
  name: "",
  role: "",
  organization: "",
  influence: "medium",
  interest: "medium",
  attitude: "neutral",
  notes: "",
};

/** Classic power/interest grid. Only "high" counts as high; medium and low share the lower half. */
const QUADRANTS = [
  { key: "satisfied", title: "Keep satisfied", hint: "High influence, lower interest", match: (s: Stakeholder) => s.influence === "high" && s.interest !== "high" },
  { key: "manage", title: "Manage closely", hint: "High influence, high interest", match: (s: Stakeholder) => s.influence === "high" && s.interest === "high" },
  { key: "monitor", title: "Monitor", hint: "Lower influence, lower interest", match: (s: Stakeholder) => s.influence !== "high" && s.interest !== "high" },
  { key: "informed", title: "Keep informed", hint: "Lower influence, high interest", match: (s: Stakeholder) => s.influence !== "high" && s.interest === "high" },
];

export function StakeholdersTab({
  projectId,
  stakeholders,
  onChanged,
}: {
  projectId: string;
  stakeholders: Stakeholder[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Stakeholder | null>(null);
  const [form, setForm] = useState<StakeholderInput | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Stakeholder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
  };

  const openEdit = (s: Stakeholder) => {
    setEditing(s);
    setForm({
      name: s.name,
      role: s.role,
      organization: s.organization,
      influence: s.influence,
      interest: s.interest,
      attitude: s.attitude,
      notes: s.notes,
    });
    setFormError(null);
  };

  const close = () => {
    setForm(null);
    setEditing(null);
  };

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) await api.patchStakeholder(projectId, editing.id, form);
      else await api.createStakeholder(projectId, form);
      close();
      await onChanged();
    } catch (err) {
      setFormError(errorText(err, "Failed to save stakeholder"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteStakeholder(projectId, toDelete.id);
      setToDelete(null);
      await onChanged();
    } catch (err) {
      setError(errorText(err, "Failed to delete stakeholder"));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const levelSelect = (key: "influence" | "interest", label: string) =>
    form && (
      <div className="field">
        <label htmlFor={`sh-${key}`}>{label}</label>
        <select id={`sh-${key}`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value as Level })}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </select>
      </div>
    );

  return (
    <>
      <FormError message={error} />

      {stakeholders.length > 0 && (
        <Card title="Power / interest grid">
          <div className="ba-quadrants">
            <span className="ba-axis ba-axis-y">Influence ↑</span>
            {QUADRANTS.map((q) => {
              const people = stakeholders.filter(q.match);
              return (
                <div key={q.key} className={`ba-quadrant ba-quadrant-${q.key}`}>
                  <div className="ba-quadrant-head">
                    <strong>{q.title}</strong>
                    <span>{q.hint}</span>
                  </div>
                  {people.length === 0 ? (
                    <span className="cell-muted" style={{ fontSize: 12.5 }}>
                      Nobody
                    </span>
                  ) : (
                    <div className="ba-chips">
                      {people.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`ba-chip ba-chip-btn tone-${attitudeTone(p.attitude)}`}
                          title={`${p.role || "No role"} · ${ATTITUDE_LABEL[p.attitude]} — click to edit`}
                          onClick={() => openEdit(p)}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <span className="ba-axis ba-axis-x">Interest →</span>
          </div>
        </Card>
      )}

      <Card
        flush
        title={`Stakeholders (${stakeholders.length})`}
        action={
          <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
            <Icon name="plus" size={14} /> Add stakeholder
          </button>
        }
      >
        {stakeholders.length === 0 ? (
          <EmptyState
            icon="users"
            title="No stakeholders yet"
            description="List the people who sponsor, use or are affected by this engagement, and how much influence and interest each has."
            action={
              <button type="button" className="btn btn-primary" onClick={openAdd}>
                <Icon name="plus" size={14} /> Add stakeholder
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role / organization</th>
                  <th scope="col">Influence</th>
                  <th scope="col">Interest</th>
                  <th scope="col">Attitude</th>
                  <th scope="col" style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stakeholders.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-title">{s.name}</div>
                      {s.notes && <div className="cell-sub">{s.notes}</div>}
                    </td>
                    <td>
                      <div>{s.role || <span className="cell-muted">—</span>}</div>
                      {s.organization && <div className="cell-sub">{s.organization}</div>}
                    </td>
                    <td>
                      <Badge tone={levelTone(s.influence)}>{LEVEL_LABEL[s.influence]}</Badge>
                    </td>
                    <td>
                      <Badge tone={levelTone(s.interest)}>{LEVEL_LABEL[s.interest]}</Badge>
                    </td>
                    <td>
                      <Badge tone={attitudeTone(s.attitude)} dot>
                        {ATTITUDE_LABEL[s.attitude]}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="action-btn-group" style={{ justifyContent: "flex-end" }}>
                        <button type="button" className="icon-action-btn" title="Edit" onClick={() => openEdit(s)}>
                          <Icon name="pencil" size={14} />
                        </button>
                        <button type="button" className="icon-action-btn danger" title="Delete" onClick={() => setToDelete(s)}>
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
          title={editing ? `Edit ${editing.name}` : "Add stakeholder"}
          onClose={close}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Add stakeholder"}
              </button>
            </>
          }
        >
          <FormError message={formError} />
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="sh-name">
                Name <span className="req">*</span>
              </label>
              <input id="sh-name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="sh-role">Role</label>
              <input id="sh-role" value={form.role} placeholder="e.g. Head of Operations" onChange={(e) => setForm({ ...form, role: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="sh-org">Organization / department</label>
              <input id="sh-org" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} />
            </div>
            {levelSelect("influence", "Influence")}
            {levelSelect("interest", "Interest")}
            <div className="field">
              <label htmlFor="sh-attitude">Attitude to the project</label>
              <select
                id="sh-attitude"
                value={form.attitude}
                onChange={(e) => setForm({ ...form, attitude: e.target.value as StakeholderAttitude })}
              >
                {ATTITUDES.map((a) => (
                  <option key={a} value={a}>
                    {ATTITUDE_LABEL[a]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field span-2">
              <label htmlFor="sh-notes">Notes</label>
              <textarea
                id="sh-notes"
                rows={3}
                value={form.notes}
                placeholder="Concerns, what they need from the project, how to engage them"
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
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
