/**
 * Mock data for the Phase 1 UI. Nothing here is fetched from a server.
 * Replace these exports with API calls (see lib/projects-store.tsx) when the backend exists.
 */
import type {
  Activity,
  Approval,
  Project,
  Requirement,
  SourceDocument,
  TeamMember,
  WorkflowModuleKey,
  WorkflowStage,
} from "./types";
import { WORKFLOW_MODULES } from "./constants";

export const CURRENT_USER_ID = "u1";

export const TEAM: TeamMember[] = [
  { id: "u1", name: "Priya Sharma", role: "Lead Business Analyst", initials: "PS" },
  { id: "u2", name: "Daniel Okafor", role: "Solution Architect", initials: "DO" },
  { id: "u3", name: "Meera Iyer", role: "Presales Consultant", initials: "MI" },
  { id: "u4", name: "Lucas Martin", role: "Delivery Manager", initials: "LM" },
  { id: "u5", name: "Aisha Rahman", role: "Business Analyst", initials: "AR" },
];

/** Builds a stage list where every stage before `currentKey` is complete. */
export function buildStages(currentKey: WorkflowModuleKey | "done"): WorkflowStage[] {
  const idx = currentKey === "done" ? WORKFLOW_MODULES.length : WORKFLOW_MODULES.findIndex((m) => m.key === currentKey);
  return WORKFLOW_MODULES.map((m, i) => ({
    key: m.key,
    state: i < idx ? "complete" : i === idx ? "current" : "upcoming",
  }));
}

export const PROJECTS: Project[] = [
  {
    id: "p-1001",
    name: "Core Banking Modernization",
    description:
      "Discovery and requirements definition for migrating retail lending and deposit products from a legacy mainframe to a cloud-native core banking platform.",
    client: {
      name: "Northwind Bank",
      industry: "Banking & Financial Services",
      contactName: "Helen Carter",
      contactRole: "VP, Digital Transformation",
      contactEmail: "h.carter@northwindbank.example",
      region: "North America",
    },
    ownerId: "u1",
    status: "in-progress",
    progress: 58,
    createdAt: "2026-08-04T09:00:00Z",
    updatedAt: "2026-10-29T14:20:00Z",
    dueDate: "2026-12-12",
    stages: buildStages("user-stories"),
    counts: { sources: 24, requirements: 136, userStories: 48, openReviews: 3 },
  },
  {
    id: "p-1002",
    name: "Patient Intake Portal",
    description: "Self-service patient registration, insurance verification and appointment scheduling across 14 clinics.",
    client: {
      name: "Meridian Health",
      industry: "Healthcare",
      contactName: "Dr. Samuel Reyes",
      contactRole: "Chief Medical Information Officer",
      contactEmail: "sreyes@meridianhealth.example",
      region: "North America",
    },
    ownerId: "u5",
    status: "in-review",
    progress: 74,
    createdAt: "2026-07-15T09:00:00Z",
    updatedAt: "2026-10-29T10:05:00Z",
    dueDate: "2026-11-20",
    stages: buildStages("estimation"),
    counts: { sources: 17, requirements: 92, userStories: 64, openReviews: 2 },
  },
  {
    id: "p-1003",
    name: "Omnichannel Order Management",
    description: "RFP response for a unified order management system spanning stores, web and marketplace channels.",
    client: {
      name: "Halcyon Retail Group",
      industry: "Retail & E-commerce",
      contactName: "Grace Liu",
      contactRole: "Director of IT Procurement",
      contactEmail: "grace.liu@halcyonretail.example",
      region: "APAC",
    },
    ownerId: "u3",
    status: "discovery",
    progress: 22,
    createdAt: "2026-10-01T09:00:00Z",
    updatedAt: "2026-10-28T16:40:00Z",
    dueDate: "2026-11-15",
    stages: buildStages("requirements"),
    counts: { sources: 9, requirements: 31, userStories: 0, openReviews: 1 },
  },
  {
    id: "p-1004",
    name: "Claims Automation Assessment",
    description: "Current-state assessment and automation roadmap for property & casualty claims processing.",
    client: {
      name: "Atlas Mutual Insurance",
      industry: "Insurance",
      contactName: "Robert Novak",
      contactRole: "Head of Claims Operations",
      contactEmail: "rnovak@atlasmutual.example",
      region: "Europe",
    },
    ownerId: "u1",
    status: "completed",
    progress: 100,
    createdAt: "2026-05-11T09:00:00Z",
    updatedAt: "2026-10-22T11:15:00Z",
    stages: buildStages("done"),
    counts: { sources: 31, requirements: 118, userStories: 87, openReviews: 0 },
  },
  {
    id: "p-1005",
    name: "Warehouse Visibility Platform",
    description: "Real-time inventory and dock scheduling visibility across 6 regional distribution centers.",
    client: {
      name: "Corvid Logistics",
      industry: "Logistics",
      contactName: "Anil Mehta",
      contactRole: "COO",
      contactEmail: "anil.mehta@corvid.example",
      region: "India",
    },
    ownerId: "u2",
    status: "in-progress",
    progress: 41,
    createdAt: "2026-09-02T09:00:00Z",
    updatedAt: "2026-10-27T13:30:00Z",
    dueDate: "2027-01-30",
    stages: buildStages("analysis"),
    counts: { sources: 14, requirements: 57, userStories: 12, openReviews: 2 },
  },
  {
    id: "p-1006",
    name: "Citizen Services Digital Front Door",
    description: "Requirements and proposal for a unified citizen portal for permits, licensing and payments.",
    client: {
      name: "City of Brookfield",
      industry: "Public Sector",
      contactName: "Maria Gonzalez",
      contactRole: "Chief Digital Officer",
      contactEmail: "mgonzalez@brookfield.example",
      region: "North America",
    },
    ownerId: "u3",
    status: "on-hold",
    progress: 33,
    createdAt: "2026-06-20T09:00:00Z",
    updatedAt: "2026-10-10T09:45:00Z",
    stages: buildStages("documents"),
    counts: { sources: 11, requirements: 74, userStories: 0, openReviews: 0 },
  },
  {
    id: "p-1007",
    name: "Predictive Maintenance Pilot",
    description: "Scoping a sensor-data pilot for predictive maintenance on two production lines.",
    client: {
      name: "Kestrel Manufacturing",
      industry: "Manufacturing",
      contactName: "Thomas Becker",
      contactRole: "Plant Engineering Lead",
      contactEmail: "t.becker@kestrel.example",
      region: "Europe",
    },
    ownerId: "u4",
    status: "draft",
    progress: 6,
    createdAt: "2026-10-26T09:00:00Z",
    updatedAt: "2026-10-26T09:00:00Z",
    stages: buildStages("sources"),
    counts: { sources: 2, requirements: 0, userStories: 0, openReviews: 0 },
  },
];

export const ACTIVITIES: Activity[] = [
  { id: "a1", projectId: "p-1001", actorId: "u1", kind: "requirement", message: "validated 12 requirements in Loan Origination", timestamp: "2026-10-29T14:20:00Z" },
  { id: "a2", projectId: "p-1002", actorId: "u5", kind: "review", message: "submitted FRD v2.1 for client review", timestamp: "2026-10-29T10:05:00Z" },
  { id: "a3", projectId: "p-1003", actorId: "u3", kind: "upload", message: "uploaded RFP_Halcyon_OMS_v3.pdf", timestamp: "2026-10-28T16:40:00Z" },
  { id: "a4", projectId: "p-1001", actorId: "u2", kind: "comment", message: "commented on the integration approach for card services", timestamp: "2026-10-28T12:10:00Z" },
  { id: "a5", projectId: "p-1005", actorId: "u2", kind: "document", message: "drafted the current-state process map", timestamp: "2026-10-27T13:30:00Z" },
  { id: "a6", projectId: "p-1001", actorId: "u4", kind: "upload", message: "added the 27 Oct steering committee transcript", timestamp: "2026-10-27T09:15:00Z" },
  { id: "a7", projectId: "p-1007", actorId: "u4", kind: "project", message: "created the project", timestamp: "2026-10-26T09:00:00Z" },
  { id: "a8", projectId: "p-1004", actorId: "u1", kind: "status", message: "marked the engagement as completed", timestamp: "2026-10-22T11:15:00Z" },
  { id: "a9", projectId: "p-1001", actorId: "u5", kind: "requirement", message: "flagged 3 conflicting requirements for clarification", timestamp: "2026-10-24T15:00:00Z" },
];

export const SOURCES: SourceDocument[] = [
  { id: "s1", projectId: "p-1001", name: "Steering committee – 27 Oct.txt", type: "transcript", sizeKb: 84, uploadedBy: "u4", uploadedAt: "2026-10-27T09:15:00Z" },
  { id: "s2", projectId: "p-1001", name: "Lending product catalogue.xlsx", type: "spreadsheet", sizeKb: 412, uploadedBy: "u1", uploadedAt: "2026-10-23T11:00:00Z" },
  { id: "s3", projectId: "p-1001", name: "Workshop notes – Deposits.docx", type: "notes", sizeKb: 56, uploadedBy: "u5", uploadedAt: "2026-10-21T16:30:00Z" },
  { id: "s4", projectId: "p-1001", name: "Northwind RFP – Core Banking.pdf", type: "rfp", sizeKb: 2310, uploadedBy: "u3", uploadedAt: "2026-08-04T09:30:00Z" },
  { id: "s5", projectId: "p-1002", name: "Clinic workflow interviews.txt", type: "transcript", sizeKb: 132, uploadedBy: "u5", uploadedAt: "2026-10-20T10:00:00Z" },
  { id: "s6", projectId: "p-1003", name: "RFP_Halcyon_OMS_v3.pdf", type: "rfp", sizeKb: 1840, uploadedBy: "u3", uploadedAt: "2026-10-28T16:40:00Z" },
  { id: "s7", projectId: "p-1005", name: "DC site visit notes.docx", type: "notes", sizeKb: 48, uploadedBy: "u2", uploadedAt: "2026-10-18T09:00:00Z" },
];

export const APPROVALS: Approval[] = [
  { id: "ap1", projectId: "p-1001", title: "Loan Origination requirements", artifact: "Requirements set", requestedBy: "u5", assigneeId: "u1", dueDate: "2026-10-31", state: "pending" },
  { id: "ap2", projectId: "p-1001", title: "BRD v1.4 – Deposits", artifact: "BRD", requestedBy: "u1", assigneeId: "u4", dueDate: "2026-11-03", state: "pending" },
  { id: "ap3", projectId: "p-1001", title: "Card services integration notes", artifact: "Solution design", requestedBy: "u2", assigneeId: "u1", dueDate: "2026-11-05", state: "changes-requested" },
  { id: "ap4", projectId: "p-1002", title: "FRD v2.1", artifact: "FRD", requestedBy: "u5", assigneeId: "u4", dueDate: "2026-11-01", state: "pending" },
  { id: "ap5", projectId: "p-1002", title: "Effort estimate – Phase 1", artifact: "Estimate", requestedBy: "u2", assigneeId: "u3", dueDate: "2026-11-04", state: "pending" },
  { id: "ap6", projectId: "p-1003", title: "RFP compliance matrix", artifact: "Requirements set", requestedBy: "u3", assigneeId: "u1", dueDate: "2026-11-02", state: "pending" },
  { id: "ap7", projectId: "p-1005", title: "Current-state process map", artifact: "Business analysis", requestedBy: "u2", assigneeId: "u5", dueDate: "2026-11-06", state: "pending" },
  { id: "ap8", projectId: "p-1005", title: "Stakeholder register", artifact: "Business analysis", requestedBy: "u5", assigneeId: "u2", dueDate: "2026-11-08", state: "changes-requested" },
];

export const REQUIREMENTS: Requirement[] = [
  { id: "r1", projectId: "p-1001", code: "REQ-LO-014", title: "Support joint applicants with independent credit checks", type: "functional", priority: "must", status: "approved" },
  { id: "r2", projectId: "p-1001", code: "REQ-LO-021", title: "Auto-decision loans under $25k within 60 seconds", type: "non-functional", priority: "must", status: "validated" },
  { id: "r3", projectId: "p-1001", code: "REQ-DP-007", title: "Migrate 2.1M deposit accounts with zero balance variance", type: "compliance", priority: "must", status: "validated" },
  { id: "r4", projectId: "p-1001", code: "REQ-INT-003", title: "Real-time sync with card processor via ISO 20022", type: "integration", priority: "should", status: "draft" },
  { id: "r5", projectId: "p-1001", code: "REQ-LO-030", title: "Configurable document checklist per loan product", type: "functional", priority: "could", status: "draft" },
  { id: "r6", projectId: "p-1002", code: "REQ-PI-002", title: "Verify insurance eligibility before appointment confirmation", type: "integration", priority: "must", status: "approved" },
  { id: "r7", projectId: "p-1002", code: "REQ-PI-011", title: "WCAG 2.2 AA compliance for all patient-facing screens", type: "compliance", priority: "must", status: "validated" },
  { id: "r8", projectId: "p-1003", code: "REQ-OMS-004", title: "Buy online, pick up in store with 2-hour SLA", type: "functional", priority: "must", status: "draft" },
  { id: "r9", projectId: "p-1005", code: "REQ-WV-001", title: "Inventory position refreshed at most every 5 minutes", type: "non-functional", priority: "must", status: "validated" },
];
