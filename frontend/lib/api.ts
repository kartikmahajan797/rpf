import type {
  Activity,
  Approval,
  DeviceInfo,
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
  listApprovals: (projectId: string) => apiFetch<Approval[]>(`/api/projects/${projectId}/approvals`),
  listTeam: () => apiFetch<TeamMember[]>(`/api/team`),
  resetSampleData: () => apiFetch<Record<string, number>>(`/api/admin/reset-sample-data`, { method: "POST" }),
};

export default api;
