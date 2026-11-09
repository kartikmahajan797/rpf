"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDelete, FormError, errorText } from "@/components/analysis/shared";
import { KIND_LONG } from "@/components/documents/shared";
import { Actions, EditModal, Select, useEditor } from "@/components/solution/ItemTabs";
import { Icon } from "@/components/ui/Icon";
import { Card, EmptyState, RelativeTime } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { DocumentKind, DocumentSection, DocumentTemplate } from "@/lib/types";

type Form = { kind: DocumentKind; name: string; description: string; sections: DocumentSection[] };

function newKey(sections: DocumentSection[]) {
  let n = sections.length + 1;
  while (sections.some((s) => s.key === `custom-${n}`)) n++;
  return `custom-${n}`;
}

function validate(f: Form): string | null {
  if (!f.name.trim()) return "Name is required";
  if (f.sections.length === 0) return "Add at least one section";
  if (f.sections.some((s) => !s.title.trim())) return "Every section needs a title";
  return null;
}

export function TemplatesManager() {
  const [templates, setTemplates] = useState<DocumentTemplate[] | null>(null);
  const [outlines, setOutlines] = useState<Record<string, DocumentSection[]>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, standard] = await Promise.all([api.listTemplates(), api.templateOutlines()]);
      setTemplates(list);
      setOutlines(standard);
      setError(null);
    } catch (err) {
      setError(errorText(err, "Failed to load templates"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ed = useEditor<DocumentTemplate, Form>(
    { kind: "brd", name: "", description: "", sections: outlines.brd ?? [] },
    ({ kind, name, description, sections }) => ({ kind, name, description, sections }),
  );
  const f = ed.form;

  if (!templates) {
    return error ? (
      <FormError message={error} />
    ) : (
      <Card>
        <p className="cell-muted">Loading templates…</p>
      </Card>
    );
  }

  const setSection = (index: number, patch: Partial<DocumentSection>) =>
    f && ed.setForm({ ...f, sections: f.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) });

  const move = (index: number, delta: number) => {
    if (!f) return;
    const sections = [...f.sections];
    const [item] = sections.splice(index, 1);
    sections.splice(index + delta, 0, item);
    ed.setForm({ ...f, sections });
  };

  return (
    <div className="stack">
      <FormError message={ed.listError ?? error} />
      <Card
        flush
        title={`Templates (${templates.length})`}
        action={
          <button type="button" className="btn btn-primary btn-sm" onClick={ed.openAdd}>
            <Icon name="plus" size={14} /> New template
          </button>
        }
      >
        {templates.length === 0 ? (
          <EmptyState icon="template" title="No templates yet" description="Save a standard outline for BRDs, FRDs, proposals or presentations, then choose it when generating a document." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Template</th>
                  <th scope="col">Type</th>
                  <th scope="col">Sections</th>
                  <th scope="col">Updated</th>
                  <th scope="col" style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="cell-title">{t.name}</div>
                      {t.description && <div className="cell-sub">{t.description}</div>}
                    </td>
                    <td>{KIND_LONG[t.kind]}</td>
                    <td>{t.sections.length}</td>
                    <td className="cell-muted">
                      <RelativeTime iso={t.updatedAt} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Actions onEdit={() => ed.openEdit(t)} onDelete={() => ed.setToDelete(t)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {f && (
        <EditModal
          title={ed.editing ? `Edit ${ed.editing.name}` : "New template"}
          subtitle="Leave a standard section blank and it is filled from the project's data when a document is generated."
          error={ed.error}
          saving={ed.saving}
          onClose={ed.close}
          onSave={() =>
            void ed.save(
              (form, editing) => {
                const { kind, ...rest } = form;
                return editing ? api.patchTemplate(editing.id, rest) : api.createTemplate({ kind, ...rest });
              },
              validate,
              load,
            )
          }
        >
          <div className="field span-2">
            <label htmlFor="tpl-name">
              Name <span className="req">*</span>
            </label>
            <input id="tpl-name" autoFocus value={f.name} placeholder="e.g. Banking BRD" onChange={(e) => ed.setForm({ ...f, name: e.target.value })} />
          </div>
          {!ed.editing && (
            <div className="span-2">
              <Select<DocumentKind> id="tpl-kind" label="Document type" value={f.kind} options={KIND_LONG} onChange={(kind) => ed.setForm({ ...f, kind, sections: outlines[kind] ?? [] })} />
            </div>
          )}
          <div className="field span-2">
            <label htmlFor="tpl-desc">Description</label>
            <input id="tpl-desc" value={f.description} onChange={(e) => ed.setForm({ ...f, description: e.target.value })} />
          </div>
          <div className="field span-2">
            <label>Sections</label>
            {f.sections.map((s, i) => (
              <div key={s.key} style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <input aria-label={`Section ${i + 1} title`} value={s.title} style={{ flex: 1 }} onChange={(e) => setSection(i, { title: e.target.value })} />
                  <button type="button" className="btn btn-secondary btn-sm" disabled={i === 0} aria-label="Move section up" onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={i === f.sections.length - 1} aria-label="Move section down" onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="icon-action-btn danger" title="Remove section" onClick={() => ed.setForm({ ...f, sections: f.sections.filter((_, j) => j !== i) })}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
                <textarea aria-label={`Section ${i + 1} standard text`} rows={2} value={s.body} placeholder="Standard text (optional)" style={{ width: "100%" }} onChange={(e) => setSection(i, { body: e.target.value })} />
              </div>
            ))}
            <div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => ed.setForm({ ...f, sections: [...f.sections, { key: newKey(f.sections), title: "New section", body: "" }] })}>
                <Icon name="plus" size={14} /> Add section
              </button>
            </div>
          </div>
        </EditModal>
      )}

      {ed.toDelete && (
        <ConfirmDelete label={ed.toDelete.name} busy={ed.deleting} onCancel={() => ed.setToDelete(null)} onConfirm={() => void ed.remove((t) => api.deleteTemplate(t.id), load)} />
      )}
    </div>
  );
}
