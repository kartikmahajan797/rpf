"use client";

import { useEffect, useState } from "react";
import { FormError, errorText } from "@/components/analysis/shared";
import { Card, RelativeTime } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { Hosting, SolutionOverview } from "@/lib/types";
import { HOSTING_LABEL, LAYERS, LAYER_LABEL, PROTOCOL_LABEL, keys } from "./shared";

type Fields = { overview: string; hosting: Hosting; architectureStyle: string; technicalApproach: string; nfrApproach: string };

export function DesignTab({
  projectId,
  data,
  onSaved,
  onDirtyChange,
}: {
  projectId: string;
  data: SolutionOverview;
  onSaved: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const d = data.design;
  const saved: Fields = { overview: d.overview, hosting: d.hosting, architectureStyle: d.architectureStyle, technicalApproach: d.technicalApproach, nfrApproach: d.nfrApproach };
  const [form, setForm] = useState<Fields>(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedKey = JSON.stringify(saved);

  // Reload the form when the saved design changes (e.g. after accepting an AI draft).
  useEffect(() => {
    setForm(JSON.parse(savedKey));
  }, [savedKey]);

  const dirty = JSON.stringify(form) !== savedKey;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.saveSolutionDesign(projectId, form);
      await onSaved();
    } catch (err) {
      setError(errorText(err, "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const area = (key: keyof Fields, label: string, help: string, rows: number, placeholder: string) => (
    <div className="field span-2">
      <label htmlFor={`sd-${key}`}>{label}</label>
      <textarea id={`sd-${key}`} rows={rows} value={form[key]} placeholder={placeholder} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      <span className="field-help">{help}</span>
    </div>
  );

  const externals = Array.from(new Set(data.integrations.map((i) => i.externalSystem.trim() || i.name)));

  return (
    <div className="sd-grid">
      <Card
        title="Technical approach"
        action={
          d.updatedAt ? (
            <span className="cell-muted" style={{ fontSize: 12.5 }}>
              Last saved <RelativeTime iso={d.updatedAt} />
            </span>
          ) : undefined
        }
      >
        <FormError message={error} />
        <div className="form-grid">
          <div className="field">
            <label htmlFor="sd-hosting">Hosting</label>
            <select id="sd-hosting" value={form.hosting} onChange={(e) => setForm({ ...form, hosting: e.target.value as Hosting })}>
              {keys(HOSTING_LABEL).map((h) => (
                <option key={h} value={h}>
                  {HOSTING_LABEL[h]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sd-style">Architecture style</label>
            <input
              id="sd-style"
              value={form.architectureStyle}
              placeholder="e.g. Modular monolith with event-driven integrations"
              onChange={(e) => setForm({ ...form, architectureStyle: e.target.value })}
            />
          </div>
          {area("overview", "Solution overview", "What will be built and how it solves the client's problem, in plain language.", 4, "A customer-facing portal backed by…")}
          {area("technicalApproach", "Build & delivery approach", "Key technologies, build vs. buy, environments, delivery method. Markdown supported.", 6, "- Frontend: …\n- Backend: …\n- Delivery: 2-week sprints…")}
          {area("nfrApproach", "Non-functional approach", "Security, performance, availability, scalability, monitoring.", 5, "- Security: SSO via Azure AD, data encrypted at rest…")}
        </div>
        <div className="form-actions">
          {dirty && <span className="ba-unsaved">Unsaved changes</span>}
          <button type="button" className="btn btn-secondary" disabled={!dirty || saving} onClick={() => setForm(saved)}>
            Discard
          </button>
          <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Card>

      <Card title="Architecture at a glance">
        {data.components.length === 0 && externals.length === 0 ? (
          <p className="cell-muted" style={{ margin: 0 }}>
            Add components and integrations to see the architecture laid out by layer here.
          </p>
        ) : (
          <div className="sd-diagram">
            <div className="sd-layers">
              {LAYERS.map((layer) => {
                const items = data.components.filter((c) => c.layer === layer);
                return (
                  <div key={layer} className={`sd-layer sd-layer-${layer}`}>
                    <div className="sd-layer-label">{LAYER_LABEL[layer]}</div>
                    <div className="sd-boxes">
                      {items.length === 0 ? (
                        <span className="sd-empty">—</span>
                      ) : (
                        items.map((c) => (
                          <div key={c.id} className={`sd-box${c.isNew ? "" : " sd-box-existing"}`} title={c.description || undefined}>
                            <strong>{c.name}</strong>
                            {c.technology && <span>{c.technology}</span>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {externals.length > 0 && (
              <div className="sd-externals">
                <div className="sd-layer-label">External systems</div>
                {externals.map((name) => {
                  const links = data.integrations.filter((i) => (i.externalSystem.trim() || i.name) === name);
                  return (
                    <div key={name} className="sd-box sd-box-external">
                      <strong>{name}</strong>
                      <span>{Array.from(new Set(links.map((l) => PROTOCOL_LABEL[l.protocol]))).join(", ")} · {links.length} link{links.length === 1 ? "" : "s"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="sd-legend">
          <span>
            <i className="sd-swatch" /> New build
          </span>
          <span>
            <i className="sd-swatch sd-swatch-existing" /> Existing system
          </span>
          <span>
            <i className="sd-swatch sd-swatch-external" /> External
          </span>
        </div>
      </Card>
    </div>
  );
}
