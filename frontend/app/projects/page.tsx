"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Card, EmptyState, PageHeader, Tabs } from "@/components/ui/primitives";
import { ProjectTable } from "@/components/projects/ProjectTable";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { SearchAndFilter, type ProjectFilters, type ViewMode } from "@/components/projects/SearchAndFilter";
import { getMember } from "@/lib/format";
import { CURRENT_USER_ID } from "@/lib/mock-data";
import { useProjects } from "@/lib/projects-store";

type Scope = "all" | "mine" | "active" | "completed";

function ProjectsView() {
  const { projects } = useProjects();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ProjectFilters>({ query: searchParams.get("q") ?? "", status: "all", client: "all", sort: "updated" });
  const [view, setView] = useState<ViewMode>("list");
  const [scope, setScope] = useState<Scope>("all");

  // Keep the filter in sync when searching from the top bar while already on this page.
  useEffect(() => {
    setFilters((f) => ({ ...f, query: searchParams.get("q") ?? "" }));
  }, [searchParams]);

  const clients = useMemo(() => Array.from(new Set(projects.map((p) => p.client.name))).sort(), [projects]);

  const inScope = useMemo(
    () => ({
      all: projects,
      mine: projects.filter((p) => p.ownerId === CURRENT_USER_ID),
      active: projects.filter((p) => ["discovery", "in-progress", "in-review"].includes(p.status)),
      completed: projects.filter((p) => p.status === "completed"),
    }),
    [projects],
  );

  const visible = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const list = inScope[scope].filter(
      (p) =>
        (filters.status === "all" || p.status === filters.status) &&
        (filters.client === "all" || p.client.name === filters.client) &&
        (!q || [p.name, p.client.name, getMember(p.ownerId).name].some((s) => s.toLowerCase().includes(q))),
    );
    return list.sort((a, b) =>
      filters.sort === "name" ? a.name.localeCompare(b.name) : filters.sort === "progress" ? b.progress - a.progress : b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [inScope, scope, filters]);

  const createBtn = (
    <Link href="/projects/new" className="btn btn-primary">
      <Icon name="plus" size={16} /> Create project
    </Link>
  );

  return (
    <>
      <PageHeader title="All projects" description="Every client engagement across your workspace, from discovery to delivery handoff." actions={createBtn} />

      {projects.length === 0 ? (
        <Card>
          <EmptyState icon="projects" title="No projects yet" description="Projects you create or are invited to will appear here." action={createBtn} />
        </Card>
      ) : (
        <>
          <Tabs<Scope>
            label="Project scope"
            value={scope}
            onChange={setScope}
            tabs={[
              { value: "all", label: "All", count: inScope.all.length },
              { value: "mine", label: "Owned by me", count: inScope.mine.length },
              { value: "active", label: "Active", count: inScope.active.length },
              { value: "completed", label: "Completed", count: inScope.completed.length },
            ]}
          />
          <SearchAndFilter filters={filters} onChange={setFilters} clients={clients} view={view} onViewChange={setView} />

          <p className="result-count" aria-live="polite">
            Showing {visible.length} of {inScope[scope].length} projects
          </p>

          {visible.length === 0 ? (
            <Card>
              <EmptyState
                icon="search"
                title="No matching projects"
                description="Try a different search term or clear the filters."
                action={
                  <button type="button" className="btn btn-secondary" onClick={() => setFilters((f) => ({ ...f, query: "", status: "all", client: "all" }))}>
                    Clear filters
                  </button>
                }
              />
            </Card>
          ) : view === "list" ? (
            <Card flush>
              <ProjectTable projects={visible} />
            </Card>
          ) : (
            <div className="project-grid">
              {visible.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsView />
    </Suspense>
  );
}
