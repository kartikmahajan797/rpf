"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDelete, FormError, Modal, errorText } from "@/components/analysis/shared";
import { Icon } from "@/components/ui/Icon";
import { Card, RelativeTime } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { DocumentSection, Project, ProjectDocument } from "@/lib/types";
import { Markdown } from "./Markdown";
import { KIND_LABEL, KIND_LONG, STATUS_LABEL, TEMPLATE_KEYS, statusTone } from "./shared";

type Mode = "edit" | "preview";

const sameSections = (a: DocumentSection[], b: DocumentSection[]) => JSON.stringify(a) === JSON.stringify(b);

function newKey(sections: DocumentSection[]) {
  let n = sections.length + 1;
  while (sections.some((s) => s.key === `custom-${n}`)) n++;
  return `custom-${n}`;
}

export function DocumentEditor({
  project,
  docId,
  onBack,
  onChanged,
}: {
  project: Project;
  docId: string;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [doc, setDoc] = useState<ProjectDocument | null>(null);
  const [title, setTitle] = useState("");
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>("edit");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [suggestion, setSuggestion] = useState<{ index: number; body: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const apply = useCallback((d: ProjectDocument) => {
    setDoc(d);
    setTitle(d.title);
    setSections(d.sections);
    setActive((i) => Math.min(i, Math.max(0, d.sections.length - 1)));
  }, []);

  useEffect(() => {
    api
      .getDocument(project.id, docId)
      .then(apply)
      .catch((err) => setError(errorText(err, "Failed to load document")));
    api
      .aiStatus()
      .then((s) => setAiEnabled(s.enabled))
      .catch(() => setAiEnabled(false));
  }, [project.id, docId, apply]);

  const dirty = !!doc && (title.trim() !== doc.title || !sameSections(sections, doc.sections));

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  if (!doc) {
    return error ? (
      <div className="stack">
        <FormError message={error} />
        <div>
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            <Icon name="arrow-left" size={14} /> All documents
          </button>
        </div>
      </div>
    ) : (
      <Card>
        <p className="cell-muted">Loading document…</p>
      </Card>
    );
  }

  const locked = doc.status === "in-review";
  const current = sections[active];
  const canRefresh = !!current && TEMPLATE_KEYS[doc.kind].includes(current.key);

  /** Run a server call that returns the updated document. */
  const run = async (label: string, call: () => Promise<ProjectDocument>, fallback: string) => {
    setBusy(label);
    setError(null);
    try {
      apply(await call());
      await onChanged();
      return true;
    } catch (err) {
      setError(errorText(err, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return false;
    }
    if (sections.some((s) => !s.title.trim())) {
      setError("Every section needs a title");
      return false;
    }
    if (doc.status === "approved" && !window.confirm(`This document is approved. Saving starts version ${doc.version + 1} as a new draft. Continue?`)) {
      return false;
    }
    const ok = await run("save", () => api.patchDocument(project.id, doc.id, { title: title.trim(), sections }), "Failed to save");
    if (ok) {
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    }
    return ok;
  };

  /** Server actions work on the saved copy, so save pending edits first. */
  const saveFirst = async () => (dirty ? save() : true);

  const refresh = async () => {
    if (!current) return;
    if (!window.confirm(`Replace “${current.title}” with fresh content from the project's current data? Your edits to this section will be lost.`)) return;
    if (!(await saveFirst())) return;
    await run("refresh", () => api.refreshDocumentSection(project.id, doc.id, current.key), "Failed to refresh section");
  };

  const askAi = async () => {
    if (!current) return;
    if (!(await saveFirst())) return;
    setBusy("ai");
    setError(null);
    try {
      const s = await api.suggestDocumentSection(project.id, doc.id, current.key);
      setSuggestion({ index: active, body: s.body });
    } catch (err) {
      setError(errorText(err, "AI rewrite failed"));
    } finally {
      setBusy(null);
    }
  };

  const workflow = async (action: "submit" | "approve" | "request-changes") => {
    if (action === "submit" && !(await saveFirst())) return;
    await run(action, () => api.documentAction(project.id, doc.id, action), "Action failed");
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await api.deleteDocument(project.id, doc.id);
      await onChanged();
      onBack();
    } catch (err) {
      setError(errorText(err, "Failed to delete"));
      setConfirmDelete(false);
      setBusy(null);
    }
  };

  const back = () => {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    onBack();
  };

  const updateSection = (patch: Partial<DocumentSection>, index = active) =>
    setSections((list) => list.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const addSection = () => {
    const next = [...sections];
    next.splice(active + 1, 0, { key: newKey(sections), title: "New section", body: "" });
    setSections(next);
    setActive(active + 1);
    setMode("edit");
  };

  const removeSection = (index: number) => {
    if (!window.confirm(`Remove section “${sections[index].title}”?`)) return;
    setSections((list) => list.filter((_, i) => i !== index));
    setActive((a) => Math.max(0, a >= index ? a - 1 : a));
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
    setActive(target);
  };

  const placeholders = sections.filter((s) => /(^|\n)_[^_\n]+_\s*($|\n)/.test(s.body)).length;
  const disabled = !!busy;

  return (
    <div className="stack">
      <div className="doc-topbar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={back}>
          <Icon name="arrow-left" size={14} /> All documents
        </button>
        <div className="doc-topbar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            title="Reuse this document's structure. Generated client content is left out."
            disabled={!!busy}
            onClick={async () => {
              const name = window.prompt("Template name", doc.title);
              if (!name?.trim()) return;
              try {
                await api.templateFromDocument(project.id, doc.id, name.trim());
                window.alert("Template saved. Find it on the Templates page.");
              } catch (err) {
                setError(errorText(err, "Failed to save the template"));
              }
            }}
          >
            <Icon name="template" size={14} /> Save as template
          </button>
          {doc.kind === "deck" && (
            <a className="btn btn-secondary btn-sm" href={api.exportDocumentPptxUrl(project.id, doc.id)} title={dirty ? "Exports the last saved version" : "Download as PowerPoint"}>
              <Icon name="download" size={14} /> PowerPoint
            </a>
          )}
          <a className="btn btn-secondary btn-sm" href={api.exportDocumentPdfUrl(project.id, doc.id)} title={dirty ? "Exports the last saved version" : "Download as PDF"}>
            <Icon name="download" size={14} /> PDF
          </a>
          <a className="btn btn-secondary btn-sm" href={api.exportDocumentUrl(project.id, doc.id)} title={dirty ? "Exports the last saved version" : undefined}>
            <Icon name="download" size={14} /> Markdown
          </a>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
            <Icon name="printer" size={14} /> Print / PDF
          </button>
          {doc.status === "draft" && (
            <button type="button" className="btn btn-primary btn-sm" disabled={disabled} onClick={() => void workflow("submit")}>
              <Icon name="send" size={14} /> {busy === "submit" ? "Submitting…" : "Submit for review"}
            </button>
          )}
          {doc.status === "in-review" && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={() => void workflow("request-changes")}>
                Request changes
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={disabled} onClick={() => void workflow("approve")}>
                <Icon name="check" size={14} /> {busy === "approve" ? "Approving…" : "Approve"}
              </button>
            </>
          )}
          <button type="button" className="icon-action-btn danger" title="Delete document" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      <Card>
        <div className="doc-head">
          <input
            className="doc-title-input"
            aria-label="Document title"
            value={title}
            disabled={locked}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="doc-meta">
            <code className="ba-code">{KIND_LABEL[doc.kind]}</code>
            <span>{KIND_LONG[doc.kind]}</span>
            <span>·</span>
            <span>Version {doc.version}</span>
            <Badge tone={statusTone(doc.status)} dot>
              {STATUS_LABEL[doc.status]}
            </Badge>
            <span>·</span>
            <span>
              Updated <RelativeTime iso={doc.updatedAt} />
            </span>
            {placeholders > 0 && (
              <>
                <span>·</span>
                <span className="doc-placeholder-count" title="Sections that still contain an italic placeholder line">
                  {placeholders} section{placeholders === 1 ? "" : "s"} with placeholders
                </span>
              </>
            )}
          </div>
        </div>
        {locked && <div className="ba-alert ba-alert-warning">In review: editing is locked. Approve it, or request changes to return it to draft.</div>}
        {doc.status === "approved" && doc.approvedAt && (
          <div className="doc-approved">
            <Icon name="check-circle" size={15} /> Approved on {formatDate(doc.approvedAt)}. Saving any change starts version {doc.version + 1} as a new draft.
          </div>
        )}
        <FormError message={error} />
      </Card>

      <div className="doc-layout">
        <nav className="doc-outline card" aria-label="Sections">
          <div className="doc-outline-head">
            <span>Sections</span>
            <div className="tabs-mini" role="tablist" aria-label="View">
              <button type="button" role="tab" aria-selected={mode === "edit"} className={mode === "edit" ? "is-active" : ""} onClick={() => setMode("edit")}>
                Edit
              </button>
              <button type="button" role="tab" aria-selected={mode === "preview"} className={mode === "preview" ? "is-active" : ""} onClick={() => setMode("preview")}>
                Preview
              </button>
            </div>
          </div>
          <ol>
            {sections.map((s, i) => (
              <li key={s.key} className={i === active ? "is-active" : ""}>
                <button
                  type="button"
                  className="doc-outline-item"
                  onClick={() => {
                    setActive(i);
                    if (mode === "preview") document.getElementById(`doc-sec-${s.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <span className="doc-outline-num">{i + 1}</span>
                  <span className="doc-outline-title">{s.title || "Untitled"}</span>
                </button>
              </li>
            ))}
          </ol>
          {!locked && (
            <button type="button" className="btn btn-ghost btn-sm doc-outline-add" onClick={addSection}>
              <Icon name="plus" size={14} /> Add section
            </button>
          )}
        </nav>

        {mode === "preview" ? (
          <Card className="doc-preview-card">
            <DocumentBody title={title} project={project} doc={doc} sections={sections} anchors />
          </Card>
        ) : current ? (
          <Card
            className="doc-section-card"
            title={`${active + 1}. ${current.title || "Untitled"}`}
            action={
              <div className="action-btn-group">
                <button type="button" className="icon-action-btn" title="Move up" disabled={locked || active === 0} onClick={() => move(active, -1)}>
                  <Icon name="arrow-up" size={14} />
                </button>
                <button
                  type="button"
                  className="icon-action-btn"
                  title="Move down"
                  disabled={locked || active === sections.length - 1}
                  onClick={() => move(active, 1)}
                >
                  <Icon name="arrow-down" size={14} />
                </button>
                <button type="button" className="icon-action-btn danger" title="Remove section" disabled={locked} onClick={() => removeSection(active)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            }
          >
            <div className="field">
              <label htmlFor="sec-title">Section title</label>
              <input id="sec-title" value={current.title} disabled={locked} onChange={(e) => updateSection({ title: e.target.value })} />
            </div>
            <div className="doc-editor-grid">
              <div className="field">
                <label htmlFor="sec-body">Content (Markdown)</label>
                <textarea
                  id="sec-body"
                  className="doc-textarea"
                  rows={18}
                  value={current.body}
                  disabled={locked}
                  onChange={(e) => updateSection({ body: e.target.value })}
                />
                <span className="field-help">
                  Supports ### headings, - bullet lists, 1. numbered lists, | tables |, **bold** and _italic_. Italic lines mark placeholders to complete.
                </span>
              </div>
              <div className="field">
                <label>Preview</label>
                <div className="doc-live-preview">
                  {current.body.trim() ? <Markdown text={current.body} /> : <p className="cell-muted">Nothing written yet.</p>}
                </div>
              </div>
            </div>
            <div className="form-actions">
              {!locked && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ marginRight: "auto" }}
                    disabled={disabled || !canRefresh}
                    title={canRefresh ? "Rebuild this section from the latest requirements and analysis" : "Custom sections have no project data to refresh from"}
                    onClick={() => void refresh()}
                  >
                    <Icon name="refresh" size={14} /> {busy === "refresh" ? "Refreshing…" : "Refresh from project data"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={disabled || aiEnabled === false}
                    title={aiEnabled === false ? "Configure LLM_PROVIDER and LLM_API_KEY in backend/.env to enable AI" : "Let AI rewrite this section; you review before anything changes"}
                    onClick={() => void askAi()}
                  >
                    <Icon name="sparkle" size={14} /> {busy === "ai" ? "Writing…" : "Improve with AI"}
                  </button>
                </>
              )}
            </div>
          </Card>
        ) : (
          <Card>
            <p className="cell-muted">This document has no sections. Add one from the outline.</p>
          </Card>
        )}
      </div>

      {!locked && (
        <div className="doc-savebar">
          {dirty && <span className="ba-unsaved">Unsaved changes</span>}
          {savedFlash && !dirty && <span className="ba-saved">Saved</span>}
          <button type="button" className="btn btn-secondary" disabled={!dirty || disabled} onClick={() => apply(doc)}>
            Discard
          </button>
          <button type="button" className="btn btn-primary" disabled={!dirty || disabled} onClick={() => void save()}>
            {busy === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {/* Only visible when printing (see globals.css @media print). */}
      <div className="doc-print">
        <DocumentBody title={title} project={project} doc={doc} sections={sections} />
      </div>

      {suggestion && (
        <Modal
          title={`AI rewrite: ${sections[suggestion.index]?.title ?? ""}`}
          subtitle="Written from this project's requirements and meetings. Check facts before using it."
          onClose={() => setSuggestion(null)}
          width={820}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setSuggestion(null)}>
                Keep mine
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  updateSection({ body: suggestion.body }, suggestion.index);
                  setSuggestion(null);
                }}
              >
                Use AI version
              </button>
            </>
          }
        >
          <div className="doc-live-preview" style={{ maxHeight: 460 }}>
            <Markdown text={suggestion.body} />
          </div>
          <p className="field-help" style={{ marginTop: 8 }}>
            “Use AI version” replaces the section text in the editor. Nothing is saved until you press Save.
          </p>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDelete
          label={`${KIND_LABEL[doc.kind]} “${doc.title}”`}
          busy={busy === "delete"}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void remove()}
        />
      )}
    </div>
  );
}

function DocumentBody({
  title,
  project,
  doc,
  sections,
  anchors = false,
}: {
  title: string;
  project: Project;
  doc: ProjectDocument;
  sections: DocumentSection[];
  anchors?: boolean;
}) {
  return (
    <article className="doc-body">
      <header className="doc-body-head">
        <div className="doc-body-kind">{KIND_LONG[doc.kind]}</div>
        <h1>{title}</h1>
        <div className="doc-body-meta">
          {project.client.name} · {project.name} · Version {doc.version} · {STATUS_LABEL[doc.status]} · {formatDate(doc.updatedAt)}
        </div>
      </header>
      <ol className="doc-toc">
        {sections.map((s) => (
          <li key={s.key}>{s.title}</li>
        ))}
      </ol>
      {sections.map((s, i) => (
        <section key={s.key} id={anchors ? `doc-sec-${s.key}` : undefined}>
          <h2>
            {i + 1}. {s.title}
          </h2>
          <Markdown text={s.body} />
        </section>
      ))}
    </article>
  );
}
