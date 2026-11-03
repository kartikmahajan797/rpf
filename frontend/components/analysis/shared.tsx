"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Tone } from "@/components/ui/StatusBadge";
import type { GapStatus, Level, StakeholderAttitude } from "@/lib/types";

export const LEVELS: Level[] = ["high", "medium", "low"];
export const GAP_STATUSES: GapStatus[] = ["open", "in-progress", "closed"];
export const ATTITUDES: StakeholderAttitude[] = ["champion", "supporter", "neutral", "resistant"];

export const LEVEL_LABEL: Record<Level, string> = { high: "High", medium: "Medium", low: "Low" };
export const GAP_STATUS_LABEL: Record<GapStatus, string> = { open: "Open", "in-progress": "In progress", closed: "Closed" };
export const ATTITUDE_LABEL: Record<StakeholderAttitude, string> = {
  champion: "Champion",
  supporter: "Supporter",
  neutral: "Neutral",
  resistant: "Resistant",
};

export const levelTone = (l: Level): Tone => (l === "high" ? "danger" : l === "medium" ? "warning" : "neutral");
export const gapStatusTone = (s: GapStatus): Tone => (s === "closed" ? "success" : s === "in-progress" ? "info" : "neutral");
export const attitudeTone = (a: StakeholderAttitude): Tone =>
  a === "champion" ? "success" : a === "supporter" ? "info" : a === "resistant" ? "danger" : "neutral";

export const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** Modal shell matching the Requirements module (backdrop click and Escape close it). */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 600,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: `${width}px` }}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {children}
        <div className="form-actions" style={{ marginTop: "20px" }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

export function ConfirmDelete({
  label,
  busy,
  onCancel,
  onConfirm,
}: {
  label: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="Delete?"
      subtitle={
        <>
          Delete <strong>{label}</strong>? This cannot be undone.
        </>
      }
      onClose={onCancel}
      width={440}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-danger-fill" disabled={busy} onClick={onConfirm}>
            {busy ? "Deleting…" : "Delete"}
          </button>
        </>
      }
    />
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="ba-alert" role="alert">
      {message}
    </div>
  );
}
