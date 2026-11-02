export type ProjectStatus = "draft" | "discovery" | "in-progress" | "in-review" | "completed" | "on-hold";

export type Industry =
  | "Banking & Financial Services"
  | "Healthcare"
  | "Retail & E-commerce"
  | "Manufacturing"
  | "Logistics"
  | "Insurance"
  | "Public Sector"
  | "Telecommunications";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  initials: string;
}

export interface Client {
  name: string;
  industry: Industry;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  region: string;
}

export type StageState = "complete" | "current" | "upcoming";

export interface WorkflowStage {
  key: WorkflowModuleKey;
  state: StageState;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  client: Client;
  ownerId: string;
  status: ProjectStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  stages: WorkflowStage[];
  counts: {
    sources: number;
    requirements: number;
    userStories: number;
    openReviews: number;
  };
}

export type ActivityKind = "upload" | "requirement" | "review" | "document" | "comment" | "status" | "project";

export interface Activity {
  id: string;
  projectId: string;
  actorId: string;
  kind: ActivityKind;
  message: string;
  timestamp: string;
}

export type SourceType = "transcript" | "rfp" | "notes" | "document" | "spreadsheet";

export interface SourceDocument {
  id: string;
  projectId: string;
  name: string;
  type: SourceType;
  sizeKb: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface SourcePreview {
  id: string;
  name: string;
  type: SourceType;
  content: string;
  sizeKb: number;
}

export interface Meeting {
  id: string;
  projectId?: string | null;
  title: string;
  startedAt: string;
  durationSec: number;
  transcript: string;
  audioPaths: string[];
  status: string;
  summary?: MeetingSummary | null;
}

export interface MeetingSummary {
  decisions: string[];
  action_items: string[];
  open_questions: string[];
}

export interface DeviceInfo {
  index: number;
  name: string;
}

export interface MeetingStartInput {
  projectId?: string | null;
  title?: string;
  model?: string;
  micDevice?: number | string | null;
  systemDevice?: number | string | null;
  duration?: number | null;
  language?: string | null;
  prompt?: string | null;
}

export type ApprovalState = "pending" | "changes-requested";

export interface Approval {
  id: string;
  projectId: string;
  title: string;
  artifact: string;
  requestedBy: string;
  assigneeId: string;
  dueDate: string;
  state: ApprovalState;
}

export type RequirementPriority = "must" | "should" | "could";
export type RequirementType = "functional" | "non-functional" | "integration" | "compliance";

export interface Requirement {
  id: string;
  projectId: string;
  code: string;
  title: string;
  type: RequirementType;
  priority: RequirementPriority;
  status: "draft" | "validated" | "approved";
  description?: string;
  rationale?: string;
  sourceIds?: string[];
  notes?: string;
}

export interface RequirementExtracted {
  title: string;
  type: RequirementType;
  priority: RequirementPriority;
  rationale: string;
  quote: string;
  selected: boolean;
}

export interface RequirementCreateInput {
  title: string;
  type: RequirementType;
  priority: RequirementPriority;
  status: "draft" | "validated" | "approved";
  description?: string;
  rationale?: string;
  sourceIds?: string[];
  notes?: string;
}

export type WorkflowModuleKey =
  | "sources"
  | "meetings"
  | "requirements"
  | "analysis"
  | "documents"
  | "user-stories"
  | "solution"
  | "estimation"
  | "proposals"
  | "presentations"
  | "handoff"
  | "traceability";

export interface NewProjectInput {
  name: string;
  clientName: string;
  industry: Industry | "";
  ownerId: string;
  description: string;
  status: ProjectStatus;
}
