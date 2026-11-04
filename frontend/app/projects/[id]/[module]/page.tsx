"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AnalysisModule } from "@/components/analysis/AnalysisModule";
import { DocumentsModule } from "@/components/documents/DocumentsModule";
import { SolutionModule } from "@/components/solution/SolutionModule";
import { StoriesModule } from "@/components/stories/StoriesModule";
import { MeetingsModule } from "@/components/meetings/MeetingsModule";
import { RequirementsModule } from "@/components/requirements/RequirementsModule";
import { SourcesModule } from "@/components/sources/SourcesModule";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { WORKFLOW_BY_KEY } from "@/lib/constants";
import { useProjects } from "@/lib/projects-store";
import type { WorkflowModuleKey } from "@/lib/types";

export default function WorkflowModulePage() {
  const { id, module } = useParams<{ id: string; module: string }>();
  const { projects, hydrated } = useProjects();
  const project = projects.find((p) => p.id === id);
  const m = WORKFLOW_BY_KEY[module as WorkflowModuleKey];

  if (!project || !m) {
    if (!hydrated) return null;
    return (
      <Card>
        <EmptyState
          icon="folder"
          title="Page not found"
          action={
            <Link href="/projects" className="btn btn-secondary">
              Back to all projects
            </Link>
          }
        />
      </Card>
    );
  }

  const renderModuleContent = () => {
    switch (module) {
      case "sources":
        return <SourcesModule project={project} />;
      case "meetings":
        return <MeetingsModule project={project} />;
      case "requirements":
        return <RequirementsModule project={project} />;
      case "analysis":
        return <AnalysisModule project={project} />;
      case "documents":
        return <DocumentsModule project={project} />;
      case "user-stories":
        return <StoriesModule project={project} />;
      case "solution":
        return <SolutionModule project={project} />;
      default:
        return (
          <Card>
            <EmptyState
              icon={m.icon}
              title={`${m.label} isn't built yet`}
              description="This module is part of the planned workflow. Its screens and processing will be added in a later phase, so nothing is generated or stored here today."
              action={
                <Link href={`/projects/${project.id}`} className="btn btn-secondary">
                  Back to project overview
                </Link>
              }
            />
          </Card>
        );
    }
  };

  const isImplemented = ["sources", "meetings", "requirements", "analysis", "documents", "user-stories", "solution"].includes(module);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "All projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          { label: m.label },
        ]}
        title={m.label}
        description={m.description}
        actions={
          isImplemented ? (
            <Badge tone="success">Active module</Badge>
          ) : (
            <Badge tone="neutral">Coming in a later phase</Badge>
          )
        }
      />
      {renderModuleContent()}
    </>
  );
}
