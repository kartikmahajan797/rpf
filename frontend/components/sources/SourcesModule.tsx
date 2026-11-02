"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Avatar, Card, EmptyState, RelativeTime } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { formatSize, getMember } from "@/lib/format";
import { useProjects } from "@/lib/projects-store";
import type { Project, SourceDocument, SourcePreview, SourceType } from "@/lib/types";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  transcript: "Transcript",
  rfp: "RFP",
  notes: "Notes",
  document: "Document",
  spreadsheet: "Spreadsheet",
};

export function SourcesModule({ project }: { project: Project }) {
  const { reload } = useProjects();
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Preview state
  const [previewData, setPreviewData] = useState<SourcePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Delete confirm state
  const [sourceToDelete, setSourceToDelete] = useState<SourceDocument | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSources = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listSources(project.id);
      setSources(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sources");
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const handleFiles = async (files: FileList | File[]) => {
    setError(null);
    const fileList = Array.from(files);
    if (!fileList.length) return;

    // Validate size
    for (const f of fileList) {
      if (f.size > MAX_UPLOAD_BYTES) {
        setError(`"${f.name}" exceeds the 50 MB limit (${(f.size / (1024 * 1024)).toFixed(1)} MB).`);
        return;
      }
    }

    setUploading(true);
    try {
      for (const f of fileList) {
        await api.uploadSource(project.id, f);
      }
      await loadSources();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file(s)");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      void handleFiles(e.dataTransfer.files);
    }
  };

  const handleDownload = (source: SourceDocument) => {
    const url = api.downloadSourceUrl(project.id, source.id);
    const a = document.createElement("a");
    a.href = url;
    a.download = source.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePreview = async (source: SourceDocument) => {
    try {
      setLoadingPreview(true);
      setError(null);
      const preview = await api.previewSource(project.id, source.id);
      setPreviewData(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview could not be loaded.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const confirmDelete = async () => {
    if (!sourceToDelete) return;
    setDeletingId(sourceToDelete.id);
    try {
      await api.deleteSource(project.id, sourceToDelete.id);
      setSourceToDelete(null);
      await loadSources();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete source.");
    } finally {
      setDeletingId(null);
    }
  };

  const isTextPreviewable = (name: string) => {
    const lower = name.toLowerCase();
    return (
      lower.endsWith(".txt") ||
      lower.endsWith(".md") ||
      lower.endsWith(".vtt") ||
      lower.endsWith(".srt") ||
      lower.endsWith(".csv") ||
      lower.endsWith(".json")
    );
  };

  return (
    <div className="stack">
      {error && (
        <div className="field-error" style={{ marginBottom: "12px", padding: "8px 12px", background: "var(--danger-soft)", borderRadius: "var(--radius)" }}>
          {error}
        </div>
      )}

      {/* Drag and drop upload card */}
      <Card title="Upload Source Documents">
        <div
          className={`dropzone ${isDragging ? "dragging" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <div className="dropzone-icon">
            <Icon name="upload" size={24} />
          </div>
          <div className="dropzone-text">
            <h4>{uploading ? "Uploading files..." : "Drop files here or click to browse"}</h4>
            <p>Upload meeting transcripts, RFPs, client notes, or requirement docs (max 50 MB each)</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => e.target.files && void handleFiles(e.target.files)}
            disabled={uploading}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={uploading}
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            {uploading ? "Uploading..." : "Select files"}
          </button>
        </div>
      </Card>

      {/* Sources list */}
      <Card title={`Project Sources (${sources.length})`} flush>
        {loading ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>Loading sources...</div>
        ) : sources.length === 0 ? (
          <EmptyState
            icon="folder"
            title="No source documents yet"
            description="Drag and drop transcripts, RFPs, or notes above to feed the project analysis."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Document Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Size</th>
                  <th scope="col">Uploaded By</th>
                  <th scope="col">Date</th>
                  <th scope="col" style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => {
                  const member = getMember(source.uploadedBy);
                  const canPreview = isTextPreviewable(source.name);

                  return (
                    <tr key={source.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Icon name={source.type === "transcript" ? "mic" : "file-text"} size={16} />
                          <span className="cell-title">{source.name}</span>
                        </div>
                      </td>
                      <td>
                        <Badge tone={source.type === "transcript" ? "info" : "neutral"}>
                          {SOURCE_TYPE_LABELS[source.type] ?? source.type}
                        </Badge>
                      </td>
                      <td className="cell-muted nowrap">{formatSize(source.sizeKb)}</td>
                      <td>
                        <span className="owner-cell">
                          <Avatar userId={member.id} size="sm" />
                          <span>{member.name}</span>
                        </span>
                      </td>
                      <td className="cell-muted nowrap">
                        <RelativeTime iso={source.uploadedAt} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="action-btn-group" style={{ justifyContent: "flex-end" }}>
                          {canPreview && (
                            <button
                              type="button"
                              className="icon-action-btn"
                              title="Preview inline"
                              disabled={loadingPreview}
                              onClick={() => void handlePreview(source)}
                            >
                              <Icon name="eye" size={15} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="icon-action-btn"
                            title="Download file"
                            onClick={() => handleDownload(source)}
                          >
                            <Icon name="download" size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-action-btn danger"
                            title="Delete file"
                            disabled={deletingId === source.id}
                            onClick={() => setSourceToDelete(source)}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Inline Preview Modal */}
      {previewData && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPreviewData(null)}>
          <div className="modal preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title">
            <div className="modal-head">
              <div>
                <h2 id="preview-title">{previewData.name}</h2>
                <p>Previewing text content ({formatSize(previewData.sizeKb)})</p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setPreviewData(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="preview-content">
              {previewData.content || "(Empty file)"}
            </div>
            <div className="form-actions" style={{ marginTop: "16px", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  void navigator.clipboard.writeText(previewData.content);
                }}
              >
                <Icon name="copy" size={14} /> Copy text
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setPreviewData(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {sourceToDelete && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSourceToDelete(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" style={{ maxWidth: "440px" }}>
            <div className="modal-head">
              <div>
                <h2 id="delete-dialog-title">Delete source document?</h2>
                <p>Are you sure you want to delete <strong>{sourceToDelete.name}</strong>? This also removes the file from disk.</p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setSourceToDelete(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="form-actions" style={{ marginTop: "16px", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setSourceToDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                onClick={() => void confirmDelete()}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
