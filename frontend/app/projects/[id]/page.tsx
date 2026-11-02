"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Avatar, Card, EmptyState, PageHeader, ProgressBar, RelativeTime, Tabs } from "@/components/ui/primitives";
import { Badge, StatusBadge } from "@/components/ui/StatusBadge";
import { RecentActivity } from "@/components/projects/RecentActivity";
import { WorkflowProgress } from "@/components/projects/WorkflowProgress";
import { WORKFLOW_BY_KEY, WORKFLOW_MODULES } from "@/lib/constants";
import { formatDate, formatSize, getMember } from "@/lib/format";
import { useProjects } from "@/lib/projects-store";
import type { RequirementPriority, SourceType } from "@/lib/types";

const SOURCE_LABEL: Record<SourceType, string> = {
  transcript: "Transcript",
  rfp: "RFP",
  notes: "Notes",
  document: "Document",
  spreadsheet: "Spreadsheet",
};

const PRIORITY_TONE: Record<RequirementPriority, "danger" | "warning" | "neutral"> = {
  must: "danger",
  should: "warning",
  could: "neutral",
};

type Tab = "overview" | "modules";

export default function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const { projects, activities, sources, approvals, requirements, hydrated } = useProjects();
  const [tab, setTab] = useState<Tab>("overview");
  const project = projects.find((p) => p.id === id);

  if (!project) {
    if (!hydrated) return null;
    return (
      <Card>
        <EmptyState
          icon="folder"
          title="Project not found"
          description="It may have been removed, or the link is incorrect."
          action={
            <Link href="/projects" className="btn btn-secondary">
              Back to all projects
            </Link>
          }
        />
      </Card>
    );
  }

  const owner = getMember(project.ownerId);
  const current = project.stages.find((s) => s.state === "current");
  const projSources = sources.filter((s) => s.projectId === project.id);
  const projApprovals = approvals.filter((a) => a.projectId === project.id);
  const projReqs = requirements.filter((r) => r.projectId === project.id);
  const projActivity = activities.filter((a) => a.projectId === project.id);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "All projects", href: "/projects" }, { label: project.name }]}
        title={
          <span className="title-with-badge">
            {project.name} <StatusBadge status={project.status} />
          </span>
        }
        description={project.description || "No description yet."}
        actions={
          <>
            <Link href={`/projects/${project.id}/sources`} className="btn btn-secondary">
              <Icon name="upload" size={16} /> Add sources
            </Link>
            {current && (
              <Link href={`/projects/${project.id}/${current.key}`} className="btn btn-primary">
                Continue: {WORKFLOW_BY_KEY[current.key].shortLabel} <Icon name="arrow-right" size={16} />
              </Link>
            )}
          </>
        }
      />

      <div className="summary-strip">
        <div>
          <span>Owner</span>
          <strong className="owner-cell">
            <Avatar userId={owner.id} size="sm" /> {owner.name}
          </strong>
        </div>
        <div>
          <span>Current stage</span>
          <strong>{current ? WORKFLOW_BY_KEY[current.key].label : "All stages complete"}</strong>
        </div>
        <div>
          <span>Due date</span>
          <strong>{project.dueDate ? formatDate(project.dueDate) : "Not set"}</strong>
        </div>
        <div className="summary-progress">
          <span>Overall progress</span>
          <ProgressBar value={project.progress} />
        </div>
      </div>

      <Tabs<Tab>
        label="Project sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "modules", label: "Workflow modules", count: WORKFLOW_MODULES.length },
        ]}
      />

      {tab === "modules" ? (
        <div className="module-grid">
          {project.stages.map((s) => {
            const m = WORKFLOW_BY_KEY[s.key];
            return (
              <Link key={m.key} href={`/projects/${project.id}/${m.key}`} className="module-card">
                <span className="module-icon">
                  <Icon name={m.icon} size={18} />
                </span>
                <div>
                  <h3>{m.label}</h3>
                  <p>{m.description}</p>
                </div>
                <Badge tone={s.state === "complete" ? "success" : s.state === "current" ? "info" : "neutral"}>
                  {s.state === "complete" ? "Complete" : s.state === "current" ? "In progress" : "Not started"}
                </Badge>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="overview-grid">
          <div className="stack">
            <div className="mini-stats">
              <div>
                <strong>{project.counts.sources}</strong>
                <span>Sources</span>
              </div>
              <div>
                <strong>{project.counts.requirements}</strong>
                <span>Requirements</span>
              </div>
              <div>
                <strong>{project.counts.userStories}</strong>
                <span>User stories</span>
              </div>
              <div>
                <strong>{projApprovals.length}</strong>
                <span>Open reviews</span>
              </div>
            </div>

            <Card
              title="Recent sources & documents"
              action={
                <Link href={`/projects/${project.id}/sources`} className="link-more">
                  View all <Icon name="arrow-right" size={14} />
                </Link>
              }
              flush
            >
              {projSources.length === 0 ? (
                <EmptyState
                  compact
                  icon="upload"
                  title="No sources yet"
                  description="Add meeting transcripts, RFPs or notes to start the analysis."
                />
              ) : (
                <ul className="file-list">
                  {projSources.map((s) => (
                    <li key={s.id}>
                      <span className="file-icon">
                        <Icon name={s.type === "transcript" ? "mic" : "file-text"} size={16} />
                      </span>
                      <div className="file-body">
                        <span className="file-name">{s.name}</span>
                        <span className="cell-sub">
                          {getMember(s.uploadedBy).name} · {formatSize(s.sizeKb)} · <RelativeTime iso={s.uploadedAt} />
                        </span>
                      </div>
                      <Badge>{SOURCE_LABEL[s.type]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title="Key requirements"
              action={
                <Link href={`/projects/${project.id}/requirements`} className="link-more">
                  View all <Icon name="arrow-right" size={14} />
                </Link>
              }
              flush
            >
              {projReqs.length === 0 ? (
                <EmptyState compact icon="list-checks" title="No requirements yet" description="Requirements will appear here once they are captured." />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">ID</th>
                        <th scope="col">Requirement</th>
                        <th scope="col">Priority</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projReqs.map((r) => (
                        <tr key={r.id}>
                          <td className="mono nowrap">{r.code}</td>
                          <td>
                            <span className="cell-title">{r.title}</span>
                            <span className="cell-sub cap">{r.type.replace("-", " ")}</span>
                          </td>
                          <td>
                            <Badge tone={PRIORITY_TONE[r.priority]}>{r.priority}</Badge>
                          </td>
                          <td>
                            <Badge tone={r.status === "approved" ? "success" : r.status === "validated" ? "info" : "neutral"}>{r.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Recent activity">
              <RecentActivity activities={projActivity} projects={projects} showProject={false} />
            </Card>
          </div>

          <div className="stack">
            <Card title="Workflow progress">
              <WorkflowProgress project={project} />
            </Card>

            <Card title="Pending approvals" action={<Badge tone="warning">{projApprovals.length}</Badge>}>
              {projApprovals.length === 0 ? (
                <EmptyState compact icon="check-circle" title="No pending approvals" />
              ) : (
                <ul className="simple-list">
                  {projApprovals.map((a) => (
                    <li key={a.id}>
                      <div>
                        <span className="simple-list-title">{a.title}</span>
                        <span className="simple-list-sub">
                          {a.artifact} · {getMember(a.assigneeId).name} · Due {formatDate(a.dueDate)}
                        </span>
                      </div>
                      <Badge tone={a.state === "pending" ? "warning" : "danger"}>{a.state === "pending" ? "Pending" : "Changes"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Client details">
              <dl className="detail-list">
                <div>
                  <dt>
                    <Icon name="building" size={15} /> Client
                  </dt>
                  <dd>{project.client.name}</dd>
                </div>
                <div>
                  <dt>
                    <Icon name="layers" size={15} /> Industry
                  </dt>
                  <dd>{project.client.industry}</dd>
                </div>
                <div>
                  <dt>
                    <Icon name="user" size={15} /> Primary contact
                  </dt>
                  <dd>
                    {project.client.contactName}
                    <small>{project.client.contactRole}</small>
                  </dd>
                </div>
                <div>
                  <dt>
                    <Icon name="mail" size={15} /> Email
                  </dt>
                  <dd className="break">{project.client.contactEmail}</dd>
                </div>
                <div>
                  <dt>
                    <Icon name="globe" size={15} /> Region
                  </dt>
                  <dd>{project.client.region}</dd>
                </div>
                <div>
                  <dt>
                    <Icon name="calendar" size={15} /> Started
                  </dt>
                  <dd>{formatDate(project.createdAt)}</dd>
                </div>
              </dl>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
