"use client";

/**
 * Project store backed by the FastAPI backend (see lib/api.ts).
 * Pages read from this context; every write goes to the server first.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { TEAM as FALLBACK_TEAM } from "./mock-data";
import type { Activity, Approval, NewProjectInput, Project, Requirement, SourceDocument, TeamMember } from "./types";

interface StoreData {
  projects: Project[];
  activities: Activity[];
  sources: SourceDocument[];
  approvals: Approval[];
  requirements: Requirement[];
  team: TeamMember[];
}

interface ProjectsContextValue extends StoreData {
  hydrated: boolean;
  /** Set when the backend could not be reached or returned an error. */
  error: string | null;
  reload: () => Promise<void>;
  /** Resolves with the saved project (real server id) or rejects with the server's error. */
  createProject: (input: NewProjectInput) => Promise<Project>;
  clearProjects: () => Promise<void>;
  restoreSampleData: () => Promise<void>;
}

const EMPTY: StoreData = { projects: [], activities: [], sources: [], approvals: [], requirements: [], team: FALLBACK_TEAM };

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

const byNewest = <T,>(key: keyof T) => (a: T, b: T) => String(b[key]).localeCompare(String(a[key]));

async function fetchAll(): Promise<StoreData> {
  const [projects, team] = await Promise.all([api.listProjects(), api.listTeam()]);
  const perProject = <T,>(fn: (id: string) => Promise<T[]>) => Promise.all(projects.map((p) => fn(p.id))).then((r) => r.flat());
  const [activities, sources, approvals, requirements] = await Promise.all([
    perProject(api.listActivities),
    perProject(api.listSources),
    perProject(api.listApprovals),
    perProject(api.listRequirements),
  ]);
  return {
    projects,
    team: team.length ? team : FALLBACK_TEAM,
    activities: activities.sort(byNewest<Activity>("timestamp")),
    sources,
    approvals,
    requirements,
  };
}

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoreData>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await fetchAll());
      setError(null);
    } catch (e) {
      console.error("Failed to load data from the API", e);
      setError(e instanceof Error ? e.message : "Could not reach the backend.");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createProject = useCallback(async (input: NewProjectInput): Promise<Project> => {
    const project = await api.createProject(input);
    // Pull the server-written activity too, so the feed stays accurate.
    const activities = await api.listActivities(project.id).catch(() => [] as Activity[]);
    setData((d) => ({
      ...d,
      projects: [project, ...d.projects],
      activities: [...activities, ...d.activities].sort(byNewest<Activity>("timestamp")),
    }));
    return project;
  }, []);

  const clearProjects = useCallback(async () => {
    await Promise.allSettled(data.projects.map((p) => api.deleteProject(p.id)));
    await reload();
  }, [data.projects, reload]);

  const restoreSampleData = useCallback(async () => {
    await api.resetSampleData();
    await reload();
  }, [reload]);

  const value = useMemo<ProjectsContextValue>(
    () => ({ ...data, hydrated, error, reload, createProject, clearProjects, restoreSampleData }),
    [data, hydrated, error, reload, createProject, clearProjects, restoreSampleData],
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used inside <ProjectsProvider>");
  return ctx;
}
