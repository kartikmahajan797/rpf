"use client";

import { useState } from "react";
import { FormError, Modal, errorText } from "@/components/analysis/shared";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api";
import type { Epic, Requirement, StoryInput, StoryPriority, StoryStatus, UserStory } from "@/lib/types";
import { POINTS, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from "./shared";

export const EMPTY_STORY: StoryInput = {
  epicId: null,
  title: "",
  persona: "",
  goal: "",
  benefit: "",
  acceptanceCriteria: [],
  priority: "should",
  storyPoints: null,
  status: "backlog",
  requirementIds: [],
};

export function toInput(s: UserStory): StoryInput {
  return {
    epicId: s.epicId,
    title: s.title,
    persona: s.persona,
    goal: s.goal,
    benefit: s.benefit,
    acceptanceCriteria: s.acceptanceCriteria,
    priority: s.priority,
    storyPoints: s.storyPoints,
    status: s.status,
    requirementIds: s.requirementIds,
  };
}

export function StoryModal({
  projectId,
  story,
  initial,
  epics,
  requirements,
  onClose,
  onSaved,
}: {
  projectId: string;
  story: UserStory | null;
  initial: StoryInput;
  epics: Epic[];
  requirements: Requirement[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  // Always keep one empty criterion row to type into.
  const [form, setForm] = useState<StoryInput>({ ...initial, acceptanceCriteria: [...initial.acceptanceCriteria, ""] });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof StoryInput>(key: K, value: StoryInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const setCriterion = (i: number, value: string) =>
    setForm((f) => {
      const list = f.acceptanceCriteria.map((c, j) => (j === i ? value : c));
      if (i === list.length - 1 && value.trim()) list.push("");
      return { ...f, acceptanceCriteria: list };
    });

  const removeCriterion = (i: number) =>
    setForm((f) => {
      const list = f.acceptanceCriteria.filter((_, j) => j !== i);
      return { ...f, acceptanceCriteria: list.length && !list[list.length - 1].trim() ? list : [...list, ""] };
    });

  const toggleReq = (id: string) =>
    set("requirementIds", form.requirementIds.includes(id) ? form.requirementIds.filter((r) => r !== id) : [...form.requirementIds, id]);

  const save = async () => {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = { ...form, acceptanceCriteria: form.acceptanceCriteria.filter((c) => c.trim()) };
    try {
      if (story) await api.patchStory(projectId, story.id, payload);
      else await api.createStory(projectId, payload);
      onClose();
      await onSaved();
    } catch (err) {
      setError(errorText(err, "Failed to save story"));
    } finally {
      setSaving(false);
    }
  };

  const sentence = `As a ${form.persona.trim() || "…"}, I want ${form.goal.trim() || "…"}${form.benefit.trim() ? `, so that ${form.benefit.trim()}` : ""}.`;

  return (
    <Modal
      title={story ? `Edit ${story.code}` : "Add user story"}
      subtitle={<span className="us-sentence-preview">{sentence}</span>}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : story ? "Save changes" : "Add story"}
          </button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid us-form">
        <div className="field span-2">
          <label htmlFor="us-title">
            Title <span className="req">*</span>
          </label>
          <input id="us-title" autoFocus value={form.title} placeholder="e.g. Upload ID document" onChange={(e) => set("title", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="us-persona">As a…</label>
          <input id="us-persona" value={form.persona} placeholder="new customer" onChange={(e) => set("persona", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="us-epic">Epic</label>
          <select id="us-epic" value={form.epicId ?? ""} onChange={(e) => set("epicId", e.target.value || null)}>
            <option value="">No epic</option>
            {epics.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.code} · {ep.title}
              </option>
            ))}
          </select>
        </div>
        <div className="field span-2">
          <label htmlFor="us-goal">I want…</label>
          <textarea id="us-goal" rows={2} value={form.goal} placeholder="to upload a photo of my passport" onChange={(e) => set("goal", e.target.value)} />
        </div>
        <div className="field span-2">
          <label htmlFor="us-benefit">So that…</label>
          <textarea id="us-benefit" rows={2} value={form.benefit} placeholder="I can open an account without visiting a branch" onChange={(e) => set("benefit", e.target.value)} />
        </div>
        <div className="field span-2">
          <label>Acceptance criteria</label>
          <div className="us-criteria">
            {form.acceptanceCriteria.map((c, i) => (
              <div key={i} className="us-criterion">
                <span className="us-criterion-num">{i + 1}</span>
                <input
                  value={c}
                  aria-label={`Acceptance criterion ${i + 1}`}
                  placeholder={i === 0 ? "Given … when … then …" : "Add another criterion"}
                  onChange={(e) => setCriterion(i, e.target.value)}
                />
                {c.trim() && (
                  <button type="button" className="icon-action-btn" title="Remove" onClick={() => removeCriterion(i)}>
                    <Icon name="x" size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <span className="field-help">Testable statements, ideally Given / When / Then. Empty rows are ignored.</span>
        </div>
        <div className="field">
          <label htmlFor="us-priority">Priority</label>
          <select id="us-priority" value={form.priority} onChange={(e) => set("priority", e.target.value as StoryPriority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="us-points">Story points</label>
          <select id="us-points" value={form.storyPoints ?? ""} onChange={(e) => set("storyPoints", e.target.value ? Number(e.target.value) : null)}>
            <option value="">Not estimated</option>
            {POINTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="us-status">Status</label>
          <select id="us-status" value={form.status} onChange={(e) => set("status", e.target.value as StoryStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field span-2">
          <label>Implements requirements</label>
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
  );
}
