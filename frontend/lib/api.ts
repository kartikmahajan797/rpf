import type {
  Activity,
  AnalysisGap,
  AnalysisOverview,
  AnalysisState,
  AnalysisStateInput,
  AnalysisSuggestion,
  GapInput,
  ProcessMap,
  ProcessMapInput,
  Stakeholder,
  StakeholderInput,
  Approval,
  DeviceInfo,
  ComponentInput,
  DecisionInput,
  DesignDecision,
  Integration,
  IntegrationInput,
  SolutionComponent,
  SolutionDesign,
  SolutionDesignInput,
  SolutionOverview,
  SolutionSuggestion,
  Backlog,
  BacklogSuggestion,
  Epic,
  EpicInput,
  StoryInput,
  UserStory,
  DocumentKind,
  DocumentUpdateInput,
  ProjectDocument,
  ProjectDocumentSummary,
  Meeting,
  MeetingSummary,
  MeetingStartInput,
  NewProjectInput,
  Project,
  Requirement,
  RequirementCreateInput,
  RequirementExtracted,
  SourceDocument,
  SourcePreview,
  TeamMember,
} from "./types";

/** Backend origin, without the /api suffix. Set in frontend/.env.local. */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    // Let the browser set the multipart boundary for uploads.
    headers: isForm ? init.headers : { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") message = body.detail;
      else if (Array.isArray(body?.detail)) message = body.detail.map((d: { msg?: string }) => d.msg).join(", ");
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

export const api = {
  listProjects: (status?: string[], q?: string) => {
    const params = new URLSearchParams();
    status?.forEach((s) => params.append("status", s));
    if (q) params.set("q", q);
    const query = params.toString();
    return apiFetch<Project[]>(`/api/projects${query ? `?${query}` : ""}`);
  },
  getProject: (id: string) => apiFetch<Project>(`/api/projects/${id}`),
  createProject: (input: NewProjectInput) => apiFetch<Project>(`/api/projects`, { method: "POST", body: JSON.stringify(input) }),
  patchProject: (id: string, patch: Partial<Project>) => apiFetch<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteProject: (id: string) => apiFetch<void>(`/api/projects/${id}`, { method: "DELETE" }),
  listActivities: (projectId: string) => apiFetch<Activity[]>(`/api/projects/${projectId}/activities`),
  listSources: (projectId: string) => apiFetch<SourceDocument[]>(`/api/projects/${projectId}/sources`),
  downloadSourceUrl: (projectId: string, sourceId: string) =>
    `${API_BASE_URL}/api/projects/${projectId}/sources/${sourceId}/download`,
  previewSource: (projectId: string, sourceId: string) =>
    apiFetch<SourcePreview>(`/api/projects/${projectId}/sources/${sourceId}/preview`),
  uploadSource: (projectId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiFetch<SourceDocument>(`/api/projects/${projectId}/sources`, { method: "POST", body });
  },
  deleteSource: (projectId: string, sourceId: string) =>
    apiFetch<void>(`/api/projects/${projectId}/sources/${sourceId}`, { method: "DELETE" }),
  listMeetings: (projectId?: string) =>
    apiFetch<Meeting[]>(`/api/meetings${projectId ? `?projectId=${projectId}` : ""}`),
  listProjectMeetings: (projectId: string) =>
    apiFetch<Meeting[]>(`/api/projects/${projectId}/meetings`),
  listUnassignedMeetings: () => apiFetch<Meeting[]>(`/api/meetings/unassigned`),
  startMeeting: (input: MeetingStartInput) =>
    apiFetch<{ status: string; projectId?: string; title?: string }>(`/api/meetings/start`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  stopMeeting: () =>
    apiFetch<{ status: string; transcript: string; transcriptPath?: string; meetingId?: string }>(`/api/meetings/stop`, {
      method: "POST",
    }),
  getMeetingStatus: () =>
    apiFetch<{ recording: boolean; projectId?: string; title?: string; startedAt?: string }>(`/api/meetings/status`),
  listDevices: () =>
    apiFetch<{ inputs: DeviceInfo[]; defaultInput: number }>(`/api/devices`),
  attachMeetingToProject: (meetingId: string, projectId: string) =>
    apiFetch<Meeting>(`/api/meetings/${meetingId}`, {
      method: "PATCH",
      body: JSON.stringify({ projectId }),
    }),
  listRequirements: (projectId: string, filters?: { type?: string; priority?: string; status?: string; q?: string }) => {
    const params = new URLSearchParams();
    if (filters?.type) params.set("type", filters.type);
    if (filters?.priority) params.set("priority", filters.priority);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.q) params.set("q", filters.q);
    const query = params.toString();
    return apiFetch<Requirement[]>(`/api/projects/${projectId}/requirements${query ? `?${query}` : ""}`);
  },
  getRequirement: (projectId: string, reqId: string) =>
    apiFetch<Requirement>(`/api/projects/${projectId}/requirements/${reqId}`),
  createRequirement: (projectId: string, input: RequirementCreateInput) =>
    apiFetch<Requirement>(`/api/projects/${projectId}/requirements`, { method: "POST", body: JSON.stringify(input) }),
  patchRequirement: (projectId: string, reqId: string, patch: Partial<RequirementCreateInput>) =>
    apiFetch<Requirement>(`/api/projects/${projectId}/requirements/${reqId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteRequirement: (projectId: string, reqId: string) =>
    apiFetch<void>(`/api/projects/${projectId}/requirements/${reqId}`, { method: "DELETE" }),
  approveRequirement: (projectId: string, reqId: string) =>
    apiFetch<Requirement>(`/api/projects/${projectId}/requirements/${reqId}/approve`, { method: "POST" }),
  validateRequirement: (projectId: string, reqId: string) =>
    apiFetch<Requirement>(`/api/projects/${projectId}/requirements/${reqId}/validate`, { method: "POST" }),
  bulkCreateRequirements: (projectId: string, items: RequirementCreateInput[]) =>
    apiFetch<Requirement[]>(`/api/projects/${projectId}/requirements/bulk`, { method: "POST", body: JSON.stringify(items) }),
  extractRequirements: (projectId: string, sourceId: string) =>
    apiFetch<RequirementExtracted[]>(`/api/projects/${projectId}/sources/${sourceId}/extract-requirements`, { method: "POST" }),
  extractRequirementsFromMeeting: (meetingId: string) =>
    apiFetch<RequirementExtracted[]>(`/api/meetings/${meetingId}/extract-requirements`, { method: "POST" }),
  aiStatus: () => apiFetch<{ enabled: boolean; provider: string | null; model: string | null }>(`/api/ai/status`),
  summarizeMeeting: (meetingId: string) =>
    apiFetch<MeetingSummary>(`/api/meetings/${meetingId}/summarize`, { method: "POST" }),
  // Business Analysis
  getAnalysis: (projectId: string) => apiFetch<AnalysisOverview>(`/api/projects/${projectId}/analysis`),
  saveAnalysisState: (projectId: string, input: AnalysisStateInput) =>
    apiFetch<AnalysisState>(`/api/projects/${projectId}/analysis/state`, { method: "PUT", body: JSON.stringify(input) }),
  suggestAnalysis: (projectId: string) =>
    apiFetch<AnalysisSuggestion>(`/api/projects/${projectId}/analysis/suggest`, { method: "POST" }),
  createGap: (projectId: string, input: GapInput) =>
    apiFetch<AnalysisGap>(`/api/projects/${projectId}/analysis/gaps`, { method: "POST", body: JSON.stringify(input) }),
  bulkCreateGaps: (projectId: string, items: GapInput[]) =>
    apiFetch<AnalysisGap[]>(`/api/projects/${projectId}/analysis/gaps/bulk`, { method: "POST", body: JSON.stringify(items) }),
  patchGap: (projectId: string, gapId: string, patch: Partial<GapInput>) =>
    apiFetch<AnalysisGap>(`/api/projects/${projectId}/analysis/gaps/${gapId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteGap: (projectId: string, gapId: string) =>
    apiFetch<void>(`/api/projects/${projectId}/analysis/gaps/${gapId}`, { method: "DELETE" }),
  createStakeholder: (projectId: string, input: StakeholderInput) =>
    apiFetch<Stakeholder>(`/api/projects/${projectId}/analysis/stakeholders`, { method: "POST", body: JSON.stringify(input) }),
  patchStakeholder: (projectId: string, id: string, patch: Partial<StakeholderInput>) =>
    apiFetch<Stakeholder>(`/api/projects/${projectId}/analysis/stakeholders/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteStakeholder: (projectId: string, id: string) =>
    apiFetch<void>(`/api/projects/${projectId}/analysis/stakeholders/${id}`, { method: "DELETE" }),
  createProcess: (projectId: string, input: ProcessMapInput) =>
    apiFetch<ProcessMap>(`/api/projects/${projectId}/analysis/processes`, { method: "POST", body: JSON.stringify(input) }),
  patchProcess: (projectId: string, id: string, patch: Partial<ProcessMapInput>) =>
    apiFetch<ProcessMap>(`/api/projects/${projectId}/analysis/processes/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteProcess: (projectId: string, id: string) =>
    apiFetch<void>(`/api/projects/${projectId}/analysis/processes/${id}`, { method: "DELETE" }),
  // BRD / FRD documents
  listDocuments: (projectId: string) => apiFetch<ProjectDocumentSummary[]>(`/api/projects/${projectId}/documents`),
  getDocument: (projectId: string, docId: string) => apiFetch<ProjectDocument>(`/api/projects/${projectId}/documents/${docId}`),
  createDocument: (projectId: string, input: { kind: DocumentKind; title?: string }) =>
    apiFetch<ProjectDocument>(`/api/projects/${projectId}/documents`, { method: "POST", body: JSON.stringify(input) }),
  patchDocument: (projectId: string, docId: string, patch: DocumentUpdateInput) =>
    apiFetch<ProjectDocument>(`/api/projects/${projectId}/documents/${docId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteDocument: (projectId: string, docId: string) =>
    apiFetch<void>(`/api/projects/${projectId}/documents/${docId}`, { method: "DELETE" }),
  refreshDocumentSection: (projectId: string, docId: string, key: string) =>
    apiFetch<ProjectDocument>(`/api/projects/${projectId}/documents/${docId}/sections/${encodeURIComponent(key)}/refresh`, { method: "POST" }),
  suggestDocumentSection: (projectId: string, docId: string, key: string) =>
    apiFetch<{ key: string; body: string }>(`/api/projects/${projectId}/documents/${docId}/sections/${encodeURIComponent(key)}/suggest`, {
      method: "POST",
    }),
  documentAction: (projectId: string, docId: string, action: "submit" | "approve" | "request-changes") =>
    apiFetch<ProjectDocument>(`/api/projects/${projectId}/documents/${docId}/${action}`, { method: "POST" }),
  exportDocumentUrl: (projectId: string, docId: string) => `${API_BASE_URL}/api/projects/${projectId}/documents/${docId}/export`,
  // User stories
  getBacklog: (projectId: string) => apiFetch<Backlog>(`/api/projects/${projectId}/stories`),
  createEpic: (projectId: string, input: EpicInput) =>
    apiFetch<Epic>(`/api/projects/${projectId}/stories/epics`, { method: "POST", body: JSON.stringify(input) }),
  patchEpic: (projectId: string, id: string, patch: Partial<EpicInput>) =>
    apiFetch<Epic>(`/api/projects/${projectId}/stories/epics/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteEpic: (projectId: string, id: string) => apiFetch<void>(`/api/projects/${projectId}/stories/epics/${id}`, { method: "DELETE" }),
  createStory: (projectId: string, input: StoryInput) =>
    apiFetch<UserStory>(`/api/projects/${projectId}/stories`, { method: "POST", body: JSON.stringify(input) }),
  patchStory: (projectId: string, id: string, patch: Partial<StoryInput>) =>
    apiFetch<UserStory>(`/api/projects/${projectId}/stories/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteStory: (projectId: string, id: string) => apiFetch<void>(`/api/projects/${projectId}/stories/${id}`, { method: "DELETE" }),
  storiesFromRequirements: (projectId: string) =>
    apiFetch<Backlog>(`/api/projects/${projectId}/stories/from-requirements`, { method: "POST" }),
  bulkCreateStories: (projectId: string, groups: { title: string | null; description: string; stories: Partial<StoryInput>[] }[]) =>
    apiFetch<Backlog>(`/api/projects/${projectId}/stories/bulk`, { method: "POST", body: JSON.stringify({ groups }) }),
  suggestStories: (projectId: string) => apiFetch<BacklogSuggestion>(`/api/projects/${projectId}/stories/suggest`, { method: "POST" }),
  exportStoriesUrl: (projectId: string) => `${API_BASE_URL}/api/projects/${projectId}/stories/export`,
  // Solution design
  getSolution: (projectId: string) => apiFetch<SolutionOverview>(`/api/projects/${projectId}/solution`),
  saveSolutionDesign: (projectId: string, input: SolutionDesignInput) =>
    apiFetch<SolutionDesign>(`/api/projects/${projectId}/solution/design`, { method: "PUT", body: JSON.stringify(input) }),
  createComponent: (projectId: string, input: ComponentInput) =>
    apiFetch<SolutionComponent>(`/api/projects/${projectId}/solution/components`, { method: "POST", body: JSON.stringify(input) }),
  patchComponent: (projectId: string, id: string, patch: Partial<ComponentInput>) =>
    apiFetch<SolutionComponent>(`/api/projects/${projectId}/solution/components/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteComponent: (projectId: string, id: string) => apiFetch<void>(`/api/projects/${projectId}/solution/components/${id}`, { method: "DELETE" }),
  createIntegration: (projectId: string, input: IntegrationInput) =>
    apiFetch<Integration>(`/api/projects/${projectId}/solution/integrations`, { method: "POST", body: JSON.stringify(input) }),
  patchIntegration: (projectId: string, id: string, patch: Partial<IntegrationInput>) =>
    apiFetch<Integration>(`/api/projects/${projectId}/solution/integrations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteIntegration: (projectId: string, id: string) => apiFetch<void>(`/api/projects/${projectId}/solution/integrations/${id}`, { method: "DELETE" }),
  integrationsFromRequirements: (projectId: string) =>
    apiFetch<Integration[]>(`/api/projects/${projectId}/solution/integrations/from-requirements`, { method: "POST" }),
  createDecision: (projectId: string, input: DecisionInput) =>
    apiFetch<DesignDecision>(`/api/projects/${projectId}/solution/decisions`, { method: "POST", body: JSON.stringify(input) }),
  patchDecision: (projectId: string, id: string, patch: Partial<DecisionInput>) =>
    apiFetch<DesignDecision>(`/api/projects/${projectId}/solution/decisions/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteDecision: (projectId: string, id: string) => apiFetch<void>(`/api/projects/${projectId}/solution/decisions/${id}`, { method: "DELETE" }),
  bulkCreateSolution: (projectId: string, input: { components: ComponentInput[]; integrations: IntegrationInput[]; decisions: DecisionInput[] }) =>
    apiFetch<SolutionOverview>(`/api/projects/${projectId}/solution/bulk`, { method: "POST", body: JSON.stringify(input) }),
  suggestSolution: (projectId: string) => apiFetch<SolutionSuggestion>(`/api/projects/${projectId}/solution/suggest`, { method: "POST" }),
  exportSolutionUrl: (projectId: string) => `${API_BASE_URL}/api/projects/${projectId}/solution/export`,
  listApprovals: (projectId: string) => apiFetch<Approval[]>(`/api/projects/${projectId}/approvals`),
  listTeam: () => apiFetch<TeamMember[]>(`/api/team`),
  resetSampleData: () => apiFetch<Record<string, number>>(`/api/admin/reset-sample-data`, { method: "POST" }),
};

export default api;
