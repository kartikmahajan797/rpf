import type { Industry, ProjectStatus, WorkflowModuleKey } from "./types";
import type { IconName } from "@/components/ui/Icon";

export const STATUS_META: Record<ProjectStatus, { label: string; tone: "neutral" | "info" | "accent" | "warning" | "success" | "danger" }> = {
  draft: { label: "Draft", tone: "neutral" },
  discovery: { label: "Discovery", tone: "accent" },
  "in-progress": { label: "In progress", tone: "info" },
  "in-review": { label: "In review", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  "on-hold": { label: "On hold", tone: "danger" },
};

export const PROJECT_STATUSES = Object.keys(STATUS_META) as ProjectStatus[];

export const INDUSTRIES: Industry[] = [
  "Banking & Financial Services",
  "Healthcare",
  "Retail & E-commerce",
  "Manufacturing",
  "Logistics",
  "Insurance",
  "Public Sector",
  "Telecommunications",
];

export interface WorkflowModule {
  key: WorkflowModuleKey;
  label: string;
  shortLabel: string;
  icon: IconName;
  description: string;
}

/** Ordered list of the engagement workflow. Order matters: it drives progress display. */
export const WORKFLOW_MODULES: WorkflowModule[] = [
  { key: "sources", label: "Sources & Documents", shortLabel: "Sources", icon: "folder", description: "Transcripts, RFPs, notes and client documents that feed the engagement." },
  { key: "meetings", label: "Meeting Intelligence", shortLabel: "Meetings", icon: "mic", description: "Decisions, action items and open questions captured from client meetings." },
  { key: "requirements", label: "Requirements", shortLabel: "Requirements", icon: "list-checks", description: "Structured functional and non-functional requirements with priority and status." },
  { key: "analysis", label: "Business Analysis", shortLabel: "Analysis", icon: "chart", description: "Current/future state, gap analysis, stakeholders and process maps." },
  { key: "documents", label: "BRD / FRD Documents", shortLabel: "BRD / FRD", icon: "file-text", description: "Business and functional requirement documents for client sign-off." },
  { key: "user-stories", label: "User Stories", shortLabel: "Stories", icon: "book", description: "Epics, user stories and acceptance criteria ready for backlog grooming." },
  { key: "solution", label: "Solution Design", shortLabel: "Solution", icon: "layers", description: "Architecture, integrations and technical approach." },
  { key: "estimation", label: "Estimation & Pricing", shortLabel: "Estimation", icon: "calculator", description: "Effort estimates, team composition and commercial model." },
  { key: "proposals", label: "Proposals", shortLabel: "Proposals", icon: "send", description: "Client-ready proposals assembled from analysis, solution and pricing." },
  { key: "presentations", label: "Presentations", shortLabel: "Decks", icon: "presentation", description: "Executive summaries and solution walkthrough decks." },
  { key: "handoff", label: "Delivery Handoff", shortLabel: "Handoff", icon: "handshake", description: "Packaged scope, backlog and context for the delivery team." },
  { key: "traceability", label: "Traceability & Change Impact", shortLabel: "Traceability", icon: "git-branch", description: "Trace requirements to stories, design and estimates; assess change impact." },
];

export const WORKFLOW_BY_KEY = Object.fromEntries(WORKFLOW_MODULES.map((m) => [m.key, m])) as Record<WorkflowModuleKey, WorkflowModule>;
