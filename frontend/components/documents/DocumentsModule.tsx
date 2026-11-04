"use client";

import { useCallback, useEffect, useState } from "react";
import { FormError, Modal, errorText } from "@/components/analysis/shared";
import { Icon } from "@/components/ui/Icon";
import { Card, EmptyState, RelativeTime, StatCard } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { useProjects } from "@/lib/projects-store";
import type { DocumentKind, Project, ProjectDocumentSummary } from "@/lib/types";
import { DocumentEditor } from "./DocumentEditor";
import { KIND_HINT, KIND_LABEL, KIND_LONG, STATUS_LABEL, statusTone } from "./shared";

export function DocumentsModule({ project }: { project: Project }) {
  const { reload } = useProjects();
  const [docs, setDocs] = useState<ProjectDocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const [creating, setCreating] = useState<{ kind: DocumentKind; title: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setDocs(await api.listDocuments(project.id));
      setError(null);
    } catch (err) {
      setError(errorText(err, "Failed to load documents"));
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onChanged = useCallback(async () => {
    await load();
    await reload(); // activity feed, approvals, updatedAt
  }, [load, reload]);

  const create = async () => {
    if (!creating) return;
    setSaving(true);
    setCreateError(null);
    try {
      const doc = await api.createDocument(project.id, { kind: creating.kind, title: creating.title.trim() || undefined });
      setCreating(null);
      await onChanged();
      setOpenId(doc.id);
    } catch (err) {
      setCreateError(errorText(err, "Failed to generate document"));
    } finally {
      setSaving(false);
    }
  };

  if (openId) {
    return (
      <DocumentEditor
        project={project}
        docId={openId}
        onBack={() => {
          setOpenId(null);
          void load();
        }}
        onChanged={onChanged}
      />
    );
  }

  if (!docs) {
    return error ? (
      <FormError message={error} />
    ) : (
      <Card>
        <p className="cell-muted">Loading documents…</p>
      </Card>
    );
  }

  const count = (pred: (d: ProjectDocumentSummary) => boolean) => docs.filter(pred).length;
  const openCreate = (kind: DocumentKind) => {
    setCreating({ kind, title: "" });
    setCreateError(null);
  };

  return (
    <div className="stack">
      <FormError message={error} />

      <div className="stats-grid">
        <StatCard label="BRDs" value={count((d) => d.kind === "brd")} icon="file-text" hint="Business requirements" />
        <StatCard label="FRDs" value={count((d) => d.kind === "frd")} icon="list-checks" hint="Functional requirements" />
        <StatCard label="In review" value={count((d) => d.status === "in-review")} icon="clock" hint="Waiting for sign-off" />
        <StatCard label="Approved" value={count((d) => d.status === "approved")} icon="check-circle" hint="Signed off by the client" />
      </div>

      <Card
        flush
        title={`Documents (${docs.length})`}
        action={
          <div className="action-btn-group">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openCreate("frd")}>
              <Icon name="plus" size={14} /> New FRD
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => openCreate("brd")}>
              <Icon name="plus" size={14} /> New BRD
            </button>
          </div>
        }
      >
        {docs.length === 0 ? (
          <EmptyState
            icon="file-text"
            title="No documents yet"
            description="Generate a BRD or FRD. It is pre-filled from this project's requirements, business analysis and meetings; you then edit, review and export it."
            action={
              <button type="button" className="btn btn-primary" onClick={() => openCreate("brd")}>
                <Icon name="plus" size={14} /> Generate BRD
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 70 }}>Type</th>
                  <th scope="col">Title</th>
                  <th scope="col">Version</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                  <th scope="col" style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <code className="ba-code">{KIND_LABEL[d.kind]}</code>
                    </td>
                    <td>
                      <button type="button" className="doc-link" onClick={() => setOpenId(d.id)}>
                        {d.title}
                      </button>
                      <div className="cell-sub">{d.sectionCount} sections</div>
                    </td>
                    <td>v{d.version}</td>
                    <td>
                      <Badge tone={statusTone(d.status)} dot>
                        {STATUS_LABEL[d.status]}
                      </Badge>
                    </td>
                    <td className="cell-muted">
                      <RelativeTime iso={d.updatedAt} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="action-btn-group" style={{ justifyContent: "flex-end" }}>
                        <button type="button" className="icon-action-btn" title="Open" onClick={() => setOpenId(d.id)}>
                          <Icon name="pencil" size={14} />
                        </button>
                        <a className="icon-action-btn" title="Download Markdown" href={api.exportDocumentUrl(project.id, d.id)}>
                          <Icon name="download" size={14} />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <Modal
          title={`Generate ${KIND_LABEL[creating.kind]}`}
          subtitle="Sections are filled from what this project already holds. Anything missing is marked as a placeholder for you to complete."
          onClose={() => setCreating(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setCreating(null)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void create()} disabled={saving}>
                {saving ? "Generating…" : "Generate"}
              </button>
            </>
          }
        >
          <FormError message={createError} />
          <div className="form-grid">
            <div className="field span-2">
              <label>Document type</label>
              <div className="doc-kind-picker">
                {(["brd", "frd"] as DocumentKind[]).map((k) => (
                  <label key={k} className={`doc-kind-option${creating.kind === k ? " is-selected" : ""}`}>
                    <input type="radio" name="doc-kind" checked={creating.kind === k} onChange={() => setCreating({ ...creating, kind: k })} />
                    <span>
                      <strong>{KIND_LONG[k]}</strong>
                      <span className="field-help">{KIND_HINT[k]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="field span-2">
              <label htmlFor="doc-title">Title</label>
              <input
                id="doc-title"
                autoFocus
                value={creating.title}
                placeholder={`${project.name}: ${KIND_LONG[creating.kind]}`}
                onChange={(e) => setCreating({ ...creating, title: e.target.value })}
              />
              <span className="field-help">Leave empty to use the default title.</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
