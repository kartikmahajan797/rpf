import type { Tone } from "@/components/ui/StatusBadge";
import type { DocumentKind, DocumentStatus } from "@/lib/types";

export const KIND_LABEL: Record<DocumentKind, string> = { brd: "BRD", frd: "FRD" };
export const KIND_LONG: Record<DocumentKind, string> = {
  brd: "Business Requirements Document",
  frd: "Functional Requirements Document",
};
export const KIND_HINT: Record<DocumentKind, string> = {
  brd: "Why and what: objectives, current / future state, scope, stakeholders, business requirements, gaps and sign-off.",
  frd: "How: processes, functional, non-functional, integration and compliance requirements, traceability and open questions.",
};

export const STATUS_LABEL: Record<DocumentStatus, string> = { draft: "Draft", "in-review": "In review", approved: "Approved" };
export const statusTone = (s: DocumentStatus): Tone => (s === "approved" ? "success" : s === "in-review" ? "warning" : "neutral");

/** Sections the backend can rebuild from project data (must match backend/app/services/document_builder.py). */
export const TEMPLATE_KEYS: Record<DocumentKind, string[]> = {
  brd: ["summary", "objectives", "current-state", "future-state", "scope", "stakeholders", "requirements", "gaps", "decisions", "assumptions", "sign-off"],
  frd: ["introduction", "processes", "functional", "non-functional", "integration", "compliance", "traceability", "open-questions", "assumptions"],
};
