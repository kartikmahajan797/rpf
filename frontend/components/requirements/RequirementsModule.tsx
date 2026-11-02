"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Card, EmptyState } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api, ApiError } from "@/lib/api";
import { useProjects } from "@/lib/projects-store";
import type {
  Project,
  Requirement,
  RequirementCreateInput,
  RequirementExtracted,
  RequirementPriority,
  RequirementType,
  SourceDocument,
} from "@/lib/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPES: RequirementType[] = ["functional", "non-functional", "integration", "compliance"];
const PRIORITIES: RequirementPriority[] = ["must", "should", "could"];
const STATUSES = ["draft", "validated", "approved"] as const;

const TYPE_LABELS: Record<RequirementType, string> = {
  functional: "Functional",
  "non-functional": "Non-functional",
  integration: "Integration",
  compliance: "Compliance",
};

const PRIORITY_LABELS: Record<RequirementPriority, string> = {
  must: "Must",
  should: "Should",
  could: "Could",
};

function priorityTone(p: RequirementPriority): "danger" | "warning" | "neutral" {
  if (p === "must") return "danger";
  if (p === "should") return "warning";
  return "neutral";
}

function statusTone(s: string): "neutral" | "info" | "success" {
  if (s === "approved") return "success";
  if (s === "validated") return "info";
  return "neutral";
}

// ─── Empty form state ─────────────────────────────────────────────────────────

const EMPTY_FORM: RequirementCreateInput = {
  title: "",
  type: "functional",
  priority: "must",
  status: "draft",
  description: "",
  rationale: "",
  sourceIds: [],
  notes: "",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function RequirementsModule({ project }: { project: Project }) {
  const { reload } = useProjects();

  // Data
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterQ, setFilterQ] = useState("");

  // Add/Edit modal
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [form, setForm] = useState<RequirementCreateInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete modal
  const [reqToDelete, setReqToDelete] = useState<Requirement | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Action buttons (approve/validate)
  const [actioning, setActioning] = useState<string | null>(null);

  // LLM state
  const [llmEnabled, setLlmEnabled] = useState<boolean | null>(null); // null = unknown
  const [showExtractPicker, setShowExtractPicker] = useState(false);
  const [extractingSource, setExtractingSource] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<RequirementExtracted[]>([]);
  const [showExtractReview, setShowExtractReview] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const firstInputRef = useRef<HTMLInputElement>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadRequirements = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [reqs, srcs] = await Promise.all([
        api.listRequirements(project.id, {
          type: filterType || undefined,
          priority: filterPriority || undefined,
          status: filterStatus || undefined,
          q: filterQ || undefined,
        }),
        api.listSources(project.id),
      ]);
      setRequirements(reqs);
      setSources(srcs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requirements");
    } finally {
      setLoading(false);
    }
  }, [project.id, filterType, filterPriority, filterStatus, filterQ]);

  useEffect(() => {
    void loadRequirements();
  }, [loadRequirements]);

  // ── Detect LLM availability ───────────────────────────────────────────────

  useEffect(() => {
    api
      .aiStatus()
      .then((s) => setLlmEnabled(s.enabled))
      .catch(() => setLlmEnabled(false));
  }, []);

  // ── Form helpers ──────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
    setTimeout(() => firstInputRef.current?.focus(), 50);
  };

  const openEdit = (req: Requirement) => {
    setEditing(req);
    setForm({
      title: req.title,
      type: req.type,
      priority: req.priority,
      status: req.status,
      description: req.description ?? "",
      rationale: req.rationale ?? "",
      sourceIds: req.sourceIds ?? [],
      notes: req.notes ?? "",
    });
    setFormError(null);
    setShowForm(true);
    setTimeout(() => firstInputRef.current?.focus(), 50);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setFormError(null);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setFormError("Title is required");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.patchRequirement(project.id, editing.id, form);
      } else {
        await api.createRequirement(project.id, form);
      }
      closeForm();
      await loadRequirements();
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save requirement");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!reqToDelete) return;
    setDeleting(true);
    try {
      await api.deleteRequirement(project.id, reqToDelete.id);
      setReqToDelete(null);
      await loadRequirements();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete requirement");
    } finally {
      setDeleting(false);
    }
  };

  // ── Status workflow ───────────────────────────────────────────────────────

  const handleValidate = async (req: Requirement) => {
    setActioning(req.id);
    try {
      await api.validateRequirement(project.id, req.id);
      await loadRequirements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate");
    } finally {
      setActioning(null);
    }
  };

  const handleApprove = async (req: Requirement) => {
    setActioning(req.id);
    try {
      await api.approveRequirement(project.id, req.id);
      await loadRequirements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setActioning(null);
    }
  };

  // ── AI Extract ────────────────────────────────────────────────────────────

  const handleExtract = async (sourceId: string) => {
    setExtractingSource(sourceId);
    setShowExtractPicker(false);
    setError(null);
    try {
      const items = await api.extractRequirements(project.id, sourceId);
      setExtracted(items.map((item) => ({ ...item, selected: true })));
      setShowExtractReview(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setLlmEnabled(false);
        setError("LLM not configured. Add LLM_PROVIDER and LLM_API_KEY to backend/.env to enable AI extraction.");
      } else {
        setError(err instanceof Error ? err.message : "Extraction failed");
      }
    } finally {
      setExtractingSource(null);
    }
  };

  const handleBulkSave = async () => {
    const selected = extracted.filter((e) => e.selected);
    if (!selected.length) return;

    setBulkSaving(true);
    try {
      await api.bulkCreateRequirements(
        project.id,
        selected.map((e) => ({
          title: e.title,
          type: e.type,
          priority: e.priority,
          status: "draft" as const,
          rationale: e.rationale,
        }))
      );
      setShowExtractReview(false);
      setExtracted([]);
      await loadRequirements();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save requirements");
    } finally {
      setBulkSaving(false);
    }
  };

  // ── Source checkbox helpers ───────────────────────────────────────────────

  const toggleSourceId = (id: string) => {
    setForm((prev) => {
      const current = prev.sourceIds ?? [];
      return {
        ...prev,
        sourceIds: current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
      };
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isExtractDisabled = llmEnabled === false || !!extractingSource;
  const extractTooltip =
    llmEnabled === false
      ? "Configure LLM_PROVIDER and LLM_API_KEY in backend/.env to enable AI extraction"
      : extractingSource
      ? "Extracting…"
      : undefined;

  return (
    <div className="stack">
      {error && (
        <div
          className="field-error"
          style={{ padding: "8px 12px", background: "var(--danger-soft)", borderRadius: "var(--radius)" }}
        >
          {error}
        </div>
      )}

      {/* ── Requirements card ───────────────────────────────────────────── */}
      <Card
        flush
        title={`Requirements (${requirements.length})`}
        action={
          <div className="req-header-actions">
            {sources.length > 0 && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={isExtractDisabled}
                  title={extractTooltip}
                  onClick={() => setShowExtractPicker((v) => !v)}
                >
                  <Icon name="sparkle" size={14} />
                  {extractingSource ? "Extracting…" : "Extract with AI"}
                </button>

                {/* Source picker dropdown */}
                {showExtractPicker && (
                  <div
                    className="dropdown-menu dropdown-end"
                    style={{ minWidth: "260px", top: "calc(100% + 4px)" }}
                  >
                    <div className="dropdown-header">Choose a source to extract from</div>
                    {sources.map((src) => (
                      <button
                        key={src.id}
                        type="button"
                        className="dropdown-item"
                        onClick={() => void handleExtract(src.id)}
                      >
                        <Icon name="file-text" size={14} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {src.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
              <Icon name="plus" size={14} /> Add Requirement
            </button>
          </div>
        }
      >
        {/* Filter bar */}
        <div className="req-filter-bar">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>

          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>

          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>

          <div className="req-search">
            <Icon name="search" size={14} />
            <input
              type="search"
              placeholder="Search…"
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
            Loading requirements…
          </div>
        ) : requirements.length === 0 ? (
          <EmptyState
            icon="list-checks"
            title="No requirements yet"
            description={
              filterType || filterPriority || filterStatus || filterQ
                ? "No requirements match the current filters."
                : "Click “Add Requirement” to create your first one, or use “Extract with AI” on a source document."
            }
            action={
              !filterType && !filterPriority && !filterStatus && !filterQ ? (
                <button type="button" className="btn btn-primary" onClick={openAdd}>
                  <Icon name="plus" size={14} /> Add Requirement
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: "90px" }}>Code</th>
                  <th scope="col">Title / Description</th>
                  <th scope="col">Type</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col" style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requirements.map((req) => (
                  <tr key={req.id}>
                    <td>
                      <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>
                        {req.code}
                      </code>
                    </td>
                    <td>
                      <div className="cell-title">{req.title}</div>
                      {req.description && (
                        <div className="cell-sub" style={{ marginTop: "2px" }}>
                          {req.description.length > 100 ? req.description.slice(0, 100) + "…" : req.description}
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge tone="neutral">{TYPE_LABELS[req.type] ?? req.type}</Badge>
                    </td>
                    <td>
                      <Badge tone={priorityTone(req.priority)}>{PRIORITY_LABELS[req.priority] ?? req.priority}</Badge>
                    </td>
                    <td>
                      <Badge tone={statusTone(req.status)}>
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="action-btn-group" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {req.status === "draft" && (
                          <button
                            type="button"
                            className="icon-action-btn"
                            title="Validate"
                            disabled={actioning === req.id}
                            onClick={() => void handleValidate(req)}
                          >
                            <Icon name="check" size={14} />
                          </button>
                        )}
                        {req.status === "validated" && (
                          <button
                            type="button"
                            className="icon-action-btn"
                            title="Approve"
                            disabled={actioning === req.id}
                            onClick={() => void handleApprove(req)}
                          >
                            <Icon name="check-circle" size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-action-btn"
                          title="Edit"
                          onClick={() => openEdit(req)}
                        >
                          <Icon name="pencil" size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-action-btn danger"
                          title="Delete"
                          onClick={() => setReqToDelete(req)}
                        >
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

      {/* ── Add/Edit Modal ──────────────────────────────────────────────── */}
      {showForm && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && closeForm()}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="req-form-title" style={{ maxWidth: "600px" }}>
            <div className="modal-head">
              <div>
                <h2 id="req-form-title">{editing ? `Edit ${editing.code}` : "Add Requirement"}</h2>
                <p>{editing ? "Update the requirement details below." : "Fill in the details for the new requirement."}</p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={closeForm}>
                <Icon name="x" />
              </button>
            </div>

            {formError && (
              <div style={{ margin: "0 0 12px", padding: "8px 12px", background: "var(--danger-soft)", borderRadius: "var(--radius)", fontSize: "13px", color: "var(--danger)" }}>
                {formError}
              </div>
            )}

            <div className="form-grid">
              {/* Title */}
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="req-title" className="field-label">
                  Title <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  ref={firstInputRef}
                  id="req-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Concise requirement statement"
                  aria-invalid={formError && !form.title.trim() ? "true" : undefined}
                />
              </div>

              {/* Type */}
              <div className="field">
                <label htmlFor="req-type" className="field-label">Type</label>
                <select id="req-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as RequirementType }))}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div className="field">
                <label htmlFor="req-priority" className="field-label">Priority</label>
                <select id="req-priority" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as RequirementPriority }))}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div className="field">
                <label htmlFor="req-status" className="field-label">Status</label>
                <select id="req-status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "draft" | "validated" | "approved" }))}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="req-desc" className="field-label">Description</label>
                <textarea
                  id="req-desc"
                  rows={3}
                  value={form.description ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Detailed description of the requirement"
                />
              </div>

              {/* Rationale */}
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="req-rationale" className="field-label">Rationale</label>
                <textarea
                  id="req-rationale"
                  rows={2}
                  value={form.rationale ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, rationale: e.target.value }))}
                  placeholder="Why this requirement exists"
                />
              </div>

              {/* Notes */}
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="req-notes" className="field-label">Notes</label>
                <textarea
                  id="req-notes"
                  rows={2}
                  value={form.notes ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional notes or implementation hints"
                />
              </div>

              {/* Source links */}
              {sources.length > 0 && (
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label className="field-label">Linked Source Documents</label>
                  <div className="source-checkbox-list">
                    {sources.map((src) => (
                      <label key={src.id} className="source-checkbox-item">
                        <input
                          type="checkbox"
                          checked={(form.sourceIds ?? []).includes(src.id)}
                          onChange={() => toggleSourceId(src.id)}
                        />
                        <span>{src.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="form-actions" style={{ marginTop: "20px", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={closeForm} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create requirement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ───────────────────────────────────── */}
      {reqToDelete && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setReqToDelete(null)}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: "440px" }}>
            <div className="modal-head">
              <div>
                <h2>Delete requirement?</h2>
                <p>
                  Are you sure you want to delete <strong>{reqToDelete.code}: {reqToDelete.title}</strong>? This action cannot be undone.
                </p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setReqToDelete(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="form-actions" style={{ marginTop: "16px", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setReqToDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Extraction Review Modal ──────────────────────────────────── */}
      {showExtractReview && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowExtractReview(false)}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: "720px" }}>
            <div className="modal-head">
              <div>
                <h2>Review Extracted Requirements</h2>
                <p>
                  {extracted.length} requirement{extracted.length !== 1 ? "s" : ""} extracted by AI. Select which ones to import.
                </p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setShowExtractReview(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div style={{ margin: "4px 0 16px", display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setExtracted((prev) => prev.map((e) => ({ ...e, selected: true })))}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setExtracted((prev) => prev.map((e) => ({ ...e, selected: false })))}
              >
                Deselect all
              </button>
            </div>

            <div className="ai-extract-list">
              {extracted.map((item, idx) => (
                <div key={idx} className="ai-extract-item">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() =>
                      setExtracted((prev) =>
                        prev.map((e, i) => (i === idx ? { ...e, selected: !e.selected } : e))
                      )
                    }
                  />
                  <div className="ai-extract-body">
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "6px" }}>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) =>
                          setExtracted((prev) =>
                            prev.map((ei, i) => (i === idx ? { ...ei, title: e.target.value } : ei))
                          )
                        }
                        style={{ flex: 1, minWidth: "200px", height: "30px", fontSize: "13px" }}
                      />
                      <select
                        value={item.type}
                        onChange={(e) =>
                          setExtracted((prev) =>
                            prev.map((ei, i) => (i === idx ? { ...ei, type: e.target.value as RequirementType } : ei))
                          )
                        }
                        style={{ height: "30px", fontSize: "12px" }}
                      >
                        {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                      </select>
                      <select
                        value={item.priority}
                        onChange={(e) =>
                          setExtracted((prev) =>
                            prev.map((ei, i) => (i === idx ? { ...ei, priority: e.target.value as RequirementPriority } : ei))
                          )
                        }
                        style={{ height: "30px", fontSize: "12px" }}
                      >
                        {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                      </select>
                    </div>
                    {item.rationale && (
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                        <strong>Rationale:</strong> {item.rationale}
                      </div>
                    )}
                    {item.quote && <div className="ai-extract-quote">{item.quote}</div>}
                  </div>
                </div>
              ))}
            </div>

            <div className="form-actions" style={{ marginTop: "16px", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                {extracted.filter((e) => e.selected).length} of {extracted.length} selected
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowExtractReview(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={bulkSaving || extracted.filter((e) => e.selected).length === 0}
                  onClick={() => void handleBulkSave()}
                >
                  {bulkSaving ? "Saving…" : `Save ${extracted.filter((e) => e.selected).length} selected`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
