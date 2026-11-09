import type { Tone } from "@/components/ui/StatusBadge";
import type { DocumentKind, DocumentStatus } from "@/lib/types";

export const KIND_LABEL: Record<DocumentKind, string> = { brd: "BRD", frd: "FRD", proposal: "Proposal", deck: "Deck" };
export const KIND_LONG: Record<DocumentKind, string> = {
  brd: "Business Requirements Document",
  frd: "Functional Requirements Document",
  proposal: "Client Proposal",
  deck: "Presentation",
};
export const KIND_HINT: Record<DocumentKind, string> = {
  brd: "Why and what: objectives, current / future state, scope, stakeholders, business requirements, gaps and sign-off.",
  frd: "How: processes, functional, non-functional, integration and compliance requirements, traceability and open questions.",
  proposal: "Client-ready: scope, solution, delivery approach, team and commercials.",
  deck: "Short slides summarising the engagement.",
};

export const STATUS_LABEL: Record<DocumentStatus, string> = { draft: "Draft", "in-review": "In review", approved: "Approved" };
export const statusTone = (s: DocumentStatus): Tone => (s === "approved" ? "success" : s === "in-review" ? "warning" : "neutral");

/** Sections the backend can rebuild from project data (must match backend/app/services/document_builder.py). */
export const TEMPLATE_KEYS: Record<DocumentKind, string[]> = {
  brd: ["summary", "objectives", "current-state", "future-state", "scope", "stakeholders", "requirements", "gaps", "decisions", "assumptions", "sign-off"],
  frd: ["introduction", "processes", "functional", "non-functional", "integration", "compliance", "traceability", "open-questions", "assumptions"],
  proposal: ["summary", "understanding", "scope", "solution", "approach", "team", "commercials", "assumptions", "next-steps"],
  deck: ["overview", "challenge", "objectives", "solution", "scope", "timeline", "investment", "next-steps"],
};
