"use client";

import { useCallback, useEffect, useState } from "react";
import { FormError, Modal, errorText } from "@/components/analysis/shared";
import { Icon } from "@/components/ui/Icon";
import { Card, EmptyState, StatCard, Tabs } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import type { Currency, Project, TraceLink, TraceRow, TraceabilityOverview } from "@/lib/types";

type Filter = "all" | "incomplete";

function Coverage({ ok, count }: { ok: boolean; count: number }) {
  return <Badge tone={ok ? "success" : "danger"}>{ok ? count : "Missing"}</Badge>;
}

function LinkList({ title, links }: { title: string; links: TraceLink[] }) {
  if (!links.length) return null;
  return (
    <div>
      <div className="ba-draft-heading">
        {title} ({links.length})
      </div>
      <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
        {links.map((l) => (
          <li key={l.id}>
            {l.label}
            {l.status && <span className="cell-muted"> · {l.status.replace("-", " ")}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TraceabilityModule({ project }: { project: Project }) {
  const [data, setData] = useState<TraceabilityOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [impact, setImpact] = useState<TraceRow | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.getTraceability(project.id));
      setError(null);
    } catch (err) {
      setError(errorText(err, "Failed to load traceability"));
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return error ? (
      <FormError message={error} />
    ) : (
      <Card>
        <p className="cell-muted">Loading traceability…</p>
      </Card>
    );
  }

  const { summary } = data;
  const money = new Intl.NumberFormat(undefined, { style: "currency", currency: data.currency as Currency, maximumFractionDigits: 0 });
  const complete = (r: TraceRow) => r.hasStory && r.hasDesign && r.hasEstimate;
  const rows = filter === "all" ? data.rows : data.rows.filter((r) => !complete(r));
  const approvedDocs = impact ? impact.documents.filter((d) => d.status === "approved") : [];

  return (
    <div className="stack">
      <FormError message={error} />

      <div className="stats-grid">
        <StatCard label="Fully traced" value={`${summary.fullyTraced}/${summary.total}`} icon="git-branch" hint="Has a story, design and estimate" />
        <StatCard label="No user story" value={summary.withoutStory} icon="book" hint="Not in the backlog" />
        <StatCard label="No design" value={summary.withoutDesign} icon="layers" hint="No component or integration" />
        <StatCard label="No estimate" value={summary.withoutEstimate} icon="calculator" hint="Not priced" />
      </div>

      <div className="ba-toolbar">
        <Tabs<Filter>
          label="Filter requirements"
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: "All", count: data.rows.length },
            { value: "incomplete", label: "Incomplete", count: data.rows.filter((r) => !complete(r)).length },
          ]}
        />
        <div className="us-toolbar-actions">
          <a className="btn btn-secondary btn-sm" href={api.exportTraceabilityUrl(project.id)} title="Download the matrix as CSV">
            <Icon name="download" size={14} /> CSV
          </a>
        </div>
      </div>

      <Card flush title={`Requirements (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState
            icon="git-branch"
            title={data.rows.length ? "Everything is fully traced" : "No requirements yet"}
            description={data.rows.length ? "Every requirement has a story, a design element and an estimate." : "Add requirements, then link stories, solution components and estimates to them."}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Requirement</th>
                  <th scope="col">Stories</th>
                  <th scope="col">Design</th>
                  <th scope="col">Estimate</th>
                  <th scope="col">Documents</th>
                  <th scope="col" style={{ textAlign: "right" }}>Change impact</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-title">
                        <code className="ba-code">{r.code}</code> {r.title}
                      </div>
                      <div className="cell-sub">
                        {r.type} · {r.priority} · {r.status}
                      </div>
                    </td>
                    <td><Coverage ok={r.hasStory} count={r.stories.length} /></td>
                    <td><Coverage ok={r.hasDesign} count={r.components.length + r.integrations.length} /></td>
                    <td><Coverage ok={r.hasEstimate} count={r.estimateItems.length} /></td>
                    <td>{r.documents.length || <span className="cell-muted">—</span>}</td>
                    <td style={{ textAlign: "right" }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setImpact(r)}>
                        View impact
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data.orphans.length > 0 && (
        <Card title={`Work with no requirement (${data.orphans.length})`}>
          <p className="card-text">These items are not linked to any requirement, so they may be out of scope or missing a link.</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.orphans.map((o, i) => (
              <li key={`${o.kind}-${i}`}>
                <span className="cell-muted">{o.kind}:</span> {o.label}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {impact && (
        <Modal
          title={`Change impact: ${impact.code}`}
          subtitle={impact.title}
          onClose={() => setImpact(null)}
          width={680}
          footer={
            <button type="button" className="btn btn-secondary" onClick={() => setImpact(null)}>
              Close
            </button>
          }
        >
          {approvedDocs.length > 0 && (
            <div className="ba-alert ba-alert-warning">
              Changing this requirement affects {approvedDocs.length} approved document{approvedDocs.length === 1 ? "" : "s"}, which would need a new version.
            </div>
          )}
          <p className="card-text">
            Linked estimate: <strong>{impact.estimateDays.toLocaleString()} days</strong>, <strong>{money.format(impact.estimateCost)}</strong> before contingency and discount. Items shared with other requirements are counted in full.
          </p>
          <LinkList title="Gaps" links={impact.gaps} />
          <LinkList title="User stories" links={impact.stories} />
          <LinkList title="Components" links={impact.components} />
          <LinkList title="Integrations" links={impact.integrations} />
          <LinkList title="Estimate items" links={impact.estimateItems} />
          <LinkList title="Documents" links={impact.documents} />
        </Modal>
      )}
    </div>
  );
}
