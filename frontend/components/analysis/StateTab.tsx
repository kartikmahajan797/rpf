"use client";

import { useEffect, useState } from "react";
import { Card, RelativeTime } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { AnalysisState, AnalysisStateInput } from "@/lib/types";
import { FormError, errorText } from "./shared";

type Fields = Required<AnalysisStateInput>;

const toFields = (s: AnalysisState): Fields => ({
  currentState: s.currentState,
  futureState: s.futureState,
  objectives: s.objectives,
});

export function StateTab({
  projectId,
  state,
  onSaved,
  onDirtyChange,
}: {
  projectId: string;
  state: AnalysisState;
  onSaved: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [form, setForm] = useState<Fields>(() => toFields(state));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Server text changed (saved, or AI draft applied): take it. Keyed on the strings, not the
  // object, so reloading the overview after an unrelated change doesn't wipe unsaved edits.
  useEffect(
    () => setForm({ currentState: state.currentState, futureState: state.futureState, objectives: state.objectives }),
    [state.currentState, state.futureState, state.objectives],
  );

  const saved = toFields(state);
  const dirty =
    form.currentState !== saved.currentState || form.futureState !== saved.futureState || form.objectives !== saved.objectives;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.saveAnalysisState(projectId, form);
      await onSaved();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setError(errorText(err, "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof Fields, label: string, help: string, placeholder: string, rows: number) => (
    <div className="field">
      <label htmlFor={`ba-${key}`}>{label}</label>
      <textarea
        id={`ba-${key}`}
        rows={rows}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
      <span className="field-help">{help}</span>
    </div>
  );

  return (
    <Card
      title="Current & future state"
      action={
        state.updatedAt ? (
          <span className="cell-muted" style={{ fontSize: 12.5 }}>
            Last saved <RelativeTime iso={state.updatedAt} />
          </span>
        ) : undefined
      }
    >
      <FormError message={error} />
      <div className="ba-state-grid">
        {field(
          "currentState",
          "Current state (as-is)",
          "How the client works today: systems, manual steps, problems.",
          "e.g. Branch staff re-key paper application forms into three separate systems…",
          8,
        )}
        {field(
          "futureState",
          "Future state (to-be)",
          "How it should work once the solution is live.",
          "e.g. Customers apply online; data flows automatically into core banking…",
          8,
        )}
      </div>
      <div style={{ marginTop: 16 }}>
        {field(
          "objectives",
          "Business objectives",
          "Measurable outcomes, one per line.",
          "e.g. Reduce account opening time from 5 days to 1 day",
          4,
        )}
      </div>
      <div className="form-actions">
        {dirty && <span className="ba-unsaved">Unsaved changes</span>}
        {savedFlash && !dirty && <span className="ba-saved">Saved</span>}
        <button type="button" className="btn btn-secondary" disabled={!dirty || saving} onClick={() => setForm(saved)}>
          Discard
        </button>
        <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Card>
  );
}
