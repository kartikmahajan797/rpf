"use client";

import { useCallback, useEffect, useState } from "react";
import { FormError, errorText } from "@/components/analysis/shared";
import { Icon } from "@/components/ui/Icon";
import { Card, StatCard } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useProjects } from "@/lib/projects-store";
import type { HandoffCheck, HandoffOverview, Project } from "@/lib/types";

function CheckRow({ check }: { check: HandoffCheck }) {
  const tone = check.passed ? "success" : check.required ? "danger" : "warning";
  return (
    <tr>
      <td>
        <div className="cell-title">{check.label}</div>
        <div className="cell-sub">{check.detail}</div>
      </td>
      <td>{check.required ? "Required" : <span className="cell-muted">Recommended</span>}</td>
      <td style={{ textAlign: "right" }}>
        <Badge tone={tone}>{check.passed ? "Done" : "Not done"}</Badge>
      </td>
    </tr>
  );
}

export function HandoffModule({ project }: { project: Project }) {
  const { reload } = useProjects();
  const [data, setData] = useState<HandoffOverview | null>(null);
  const [form, setForm] = useState({ deliveryLead: "", startDate: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const apply = useCallback((d: HandoffOverview) => {
    setData(d);
    setForm({ deliveryLead: d.handoff.deliveryLead, startDate: d.handoff.startDate, notes: d.handoff.notes });
  }, []);

  useEffect(() => {
    api
      .getHandoff(project.id)
      .then(apply)
      .catch((err) => setError(errorText(err, "Failed to load the handoff")));
  }, [project.id, apply]);

  if (!data) {
    return error ? (
      <FormError message={error} />
    ) : (
      <Card>
        <p className="cell-muted">Loading handoff…</p>
      </Card>
    );
  }

  const { handoff, checks, ready } = data;
  const required = checks.filter((c) => c.required);
  const dirty = form.deliveryLead !== handoff.deliveryLead || form.startDate !== handoff.startDate || form.notes !== handoff.notes;
  const handedOff = !!handoff.handedOffAt;

  const run = async (label: string, call: () => Promise<HandoffOverview>, fallback: string) => {
    setBusy(label);
    setError(null);
    try {
      apply(await call());
      await reload();
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      <FormError message={error} />

      <div className="stats-grid">
        <StatCard label="Status" value={handedOff ? "Handed off" : ready ? "Ready" : "Not ready"} icon="handshake" hint={handedOff ? formatDate(handoff.handedOffAt as string) : "Required checks decide this"} />
        <StatCard label="Required checks" value={`${required.filter((c) => c.passed).length}/${required.length}`} icon="check-circle" hint="Must all be done" />
        <StatCard label="Recommended" value={`${checks.filter((c) => !c.required && c.passed).length}/${checks.length - required.length}`} icon="list-checks" hint="Good to have" />
        <StatCard label="Delivery lead" value={handoff.deliveryLead || "—"} icon="users" hint={handoff.startDate ? `Starts ${formatDate(handoff.startDate)}` : "Start date not set"} />
      </div>

      <div className="ba-toolbar">
        <div />
        <div className="us-toolbar-actions">
          <a className="btn btn-secondary btn-sm" href={api.exportHandoffUrl(project.id)} title="Download documents, backlog, design, estimate and traceability as a zip">
            <Icon name="download" size={14} /> Download package
          </a>
          {handedOff ? (
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => void run("reopen", () => api.reopenHandoff(project.id), "Failed to reopen")}>
              {busy === "reopen" ? "Reopening…" : "Reopen handoff"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!!busy || !ready || dirty}
              title={!ready ? "Finish every required check first" : dirty ? "Save the handoff details first" : undefined}
              onClick={() => void run("complete", () => api.completeHandoff(project.id), "Failed to complete the handoff")}
            >
              <Icon name="handshake" size={14} /> {busy === "complete" ? "Handing off…" : "Mark as handed off"}
            </button>
          )}
        </div>
      </div>

      <Card flush title="Readiness checklist">
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {checks.map((c) => (
                <CheckRow key={c.key} check={c} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Handoff details">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ho-lead">Delivery lead</label>
            <input id="ho-lead" value={form.deliveryLead} placeholder="Who takes over delivery" onChange={(e) => setForm({ ...form, deliveryLead: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ho-start">Planned start date</label>
            <input id="ho-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="field span-2">
            <label htmlFor="ho-notes">Notes for the delivery team</label>
            <textarea id="ho-notes" rows={5} value={form.notes} placeholder="Client context, risks, access still needed" onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="form-actions start">
          <button type="button" className="btn btn-primary" disabled={!!busy || !dirty} onClick={() => void run("save", () => api.saveHandoff(project.id, form), "Failed to save")}>
            {busy === "save" ? "Saving…" : "Save details"}
          </button>
        </div>
      </Card>
    </div>
  );
}
