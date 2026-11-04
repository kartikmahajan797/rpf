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

export type ActivityKind = "upload" | "requirement" | "review" | "document" | "comment" | "status" | "project" | "analysis" | "story";

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

// ─── Business Analysis ───────────────────────────────────────────────────────

export type Level = "high" | "medium" | "low";
export type GapStatus = "open" | "in-progress" | "closed";
export type StakeholderAttitude = "champion" | "supporter" | "neutral" | "resistant";
export type ProcessKind = "as-is" | "to-be";

export interface AnalysisState {
  projectId: string;
  currentState: string;
  futureState: string;
  objectives: string;
  updatedAt: string | null;
}

export type AnalysisStateInput = Partial<Pick<AnalysisState, "currentState" | "futureState" | "objectives">>;

export interface AnalysisGap {
  id: string;
  projectId: string;
  code: string;
  area: string;
  current: string;
  target: string;
  description: string;
  impact: Level;
  status: GapStatus;
  requirementIds: string[];
}

export type GapInput = Omit<AnalysisGap, "id" | "projectId" | "code">;

export interface Stakeholder {
  id: string;
  projectId: string;
  name: string;
  role: string;
  organization: string;
  influence: Level;
  interest: Level;
  attitude: StakeholderAttitude;
  notes: string;
}

export type StakeholderInput = Omit<Stakeholder, "id" | "projectId">;

export interface ProcessStep {
  actor: string;
  action: string;
  painPoint: string;
}

export interface ProcessMap {
  id: string;
  projectId: string;
  name: string;
  kind: ProcessKind;
  steps: ProcessStep[];
  notes: string;
  updatedAt: string;
}

export type ProcessMapInput = Omit<ProcessMap, "id" | "projectId" | "updatedAt">;

export interface AnalysisOverview {
  state: AnalysisState;
  gaps: AnalysisGap[];
  stakeholders: Stakeholder[];
  processMaps: ProcessMap[];
}

export interface AnalysisSuggestion {
  currentState: string;
  futureState: string;
  objectives: string;
  gaps: Pick<AnalysisGap, "area" | "current" | "target" | "description" | "impact">[];
}

// ─── BRD / FRD documents ─────────────────────────────────────────────────────

export type DocumentKind = "brd" | "frd";
export type DocumentStatus = "draft" | "in-review" | "approved";

export interface DocumentSection {
  key: string;
  title: string;
  /** Markdown. */
  body: string;
}

export interface ProjectDocumentSummary {
  id: string;
  projectId: string;
  kind: DocumentKind;
  title: string;
  version: number;
  status: DocumentStatus;
  sectionCount: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

export interface ProjectDocument extends ProjectDocumentSummary {
  sections: DocumentSection[];
}

export interface DocumentUpdateInput {
  title?: string;
  sections?: DocumentSection[];
}

// ─── User stories ────────────────────────────────────────────────────────────

export type StoryPriority = "must" | "should" | "could";
export type StoryStatus = "backlog" | "ready" | "in-progress" | "done";

export interface Epic {
  id: string;
  projectId: string;
  code: string;
  title: string;
  description: string;
}

export type EpicInput = Pick<Epic, "title" | "description">;

export interface UserStory {
  id: string;
  projectId: string;
  epicId: string | null;
  code: string;
  title: string;
  persona: string;
  goal: string;
  benefit: string;
  acceptanceCriteria: string[];
  priority: StoryPriority;
  storyPoints: number | null;
  status: StoryStatus;
  requirementIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type StoryInput = Omit<UserStory, "id" | "projectId" | "code" | "createdAt" | "updatedAt">;

export interface Backlog {
  epics: Epic[];
  stories: UserStory[];
}

export type StorySuggestion = Omit<StoryInput, "epicId" | "status">;

export interface BacklogSuggestion {
  epics: { title: string; description: string; stories: StorySuggestion[] }[];
}

// ─── Solution design ─────────────────────────────────────────────────────────

export type Hosting = "cloud" | "on-premise" | "hybrid" | "saas" | "tbd";
export type ComponentLayer = "channel" | "service" | "data" | "platform";
export type IntegrationDirection = "inbound" | "outbound" | "both";
export type IntegrationProtocol = "rest" | "soap" | "event" | "file" | "database" | "other";
export type IntegrationFrequency = "real-time" | "batch" | "on-demand";
export type IntegrationStatus = "proposed" | "agreed";
export type DecisionStatus = "proposed" | "accepted" | "rejected" | "superseded";

export interface SolutionDesign {
  projectId: string;
  overview: string;
  hosting: Hosting;
  architectureStyle: string;
  technicalApproach: string;
  nfrApproach: string;
  updatedAt: string | null;
}

export type SolutionDesignInput = Partial<Omit<SolutionDesign, "projectId" | "updatedAt">>;

export interface SolutionComponent {
  id: string;
  projectId: string;
  name: string;
  layer: ComponentLayer;
  technology: string;
  description: string;
  isNew: boolean;
  requirementIds: string[];
}

export type ComponentInput = Omit<SolutionComponent, "id" | "projectId">;

export interface Integration {
  id: string;
  projectId: string;
  name: string;
  externalSystem: string;
  direction: IntegrationDirection;
  protocol: IntegrationProtocol;
  frequency: IntegrationFrequency;
  data: string;
  status: IntegrationStatus;
  requirementIds: string[];
}

export type IntegrationInput = Omit<Integration, "id" | "projectId">;

export interface DesignDecision {
  id: string;
  projectId: string;
  code: string;
  title: string;
  context: string;
  decision: string;
  alternatives: string;
  consequences: string;
  status: DecisionStatus;
  updatedAt: string;
}

export type DecisionInput = Omit<DesignDecision, "id" | "projectId" | "code" | "updatedAt">;

export interface SolutionOverview {
  design: SolutionDesign;
  components: SolutionComponent[];
  integrations: Integration[];
  decisions: DesignDecision[];
}

export interface SolutionSuggestion extends Omit<SolutionDesign, "projectId" | "updatedAt"> {
  components: ComponentInput[];
  integrations: IntegrationInput[];
  decisions: DecisionInput[];
}
