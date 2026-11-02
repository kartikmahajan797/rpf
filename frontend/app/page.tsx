"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Card, EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { useShell } from "@/components/layout/shell-context";
import { ProjectTable } from "@/components/projects/ProjectTable";
import { RecentActivity } from "@/components/projects/RecentActivity";
import { CURRENT_USER_ID } from "@/lib/mock-data";
import { formatDate, getMember } from "@/lib/format";
import { useProjects } from "@/lib/projects-store";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { projects, activities, approvals, hydrated } = useProjects();
  const { openCreateProject } = useShell();
  const [hello, setHello] = useState("Welcome back");
  const me = getMember(CURRENT_USER_ID);

  useEffect(() => setHello(greeting(new Date().getHours())), []);

  const active = projects.filter((p) => ["discovery", "in-progress", "in-review"].includes(p.status));
  const completedDeliverables = projects.reduce((n, p) => n + p.stages.filter((s) => s.state === "complete").length, 0);
  const recent = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const myApprovals = approvals.filter((a) => a.assigneeId === CURRENT_USER_ID);
  const uploadTarget = recent[0];

  const header = (
    <PageHeader
      title={`${hello}, ${me.name.split(" ")[0]}`}
      description="Here's where your client engagements stand today."
      actions={
        <>
          {uploadTarget && (
            <Link href={`/projects/${uploadTarget.id}/sources`} className="btn btn-secondary">
              <Icon name="upload" size={16} /> Upload document
            </Link>
          )}
          <button type="button" className="btn btn-primary" onClick={openCreateProject}>
            <Icon name="plus" size={16} /> Create project
          </button>
        </>
      }
    />
  );

  if (!hydrated) {
    return (
      <>
        {header}
        <div className="stats-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="stat-card" key={i}>
              <Skeleton width="50%" />
              <Skeleton height={28} width="30%" />
            </div>
          ))}
        </div>
        <Card title="Recent projects">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ padding: "10px 0" }}>
              <Skeleton />
            </div>
          ))}
        </Card>
      </>
    );
  }

  if (projects.length === 0) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon="projects"
            title="No projects yet"
            description="Create your first client engagement to start collecting transcripts, RFPs and notes, and turn them into requirements and deliverables."
            action={
              <button type="button" className="btn btn-primary" onClick={openCreateProject}>
                <Icon name="plus" size={16} /> Create your first project
              </button>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {header}

      <div className="stats-grid">
        <StatCard label="Total projects" value={projects.length} icon="projects" hint={`${projects.filter((p) => p.status === "draft").length} in draft`} />
        <StatCard label="Active projects" value={active.length} icon="activity" hint="Discovery, in progress or in review" />
        <StatCard label="Pending reviews" value={approvals.length} icon="clock" hint={`${myApprovals.length} assigned to you`} />
        <StatCard label="Completed deliverables" value={completedDeliverables} icon="check-circle" hint="Workflow stages signed off" />
      </div>

      <div className="dash-grid">
        <Card
          title="Recent projects"
          action={
            <Link href="/projects" className="link-more">
              View all <Icon name="arrow-right" size={14} />
            </Link>
          }
          flush
        >
          <ProjectTable projects={recent} compact />
        </Card>

        <div className="stack">
          <Card title="Your reviews" action={<Badge tone="warning">{myApprovals.length}</Badge>}>
            {myApprovals.length === 0 ? (
              <EmptyState compact icon="check-circle" title="Nothing to review" description="You're all caught up." />
            ) : (
              <ul className="simple-list">
                {myApprovals.map((a) => (
                  <li key={a.id}>
                    <Link href={`/projects/${a.projectId}`}>
                      <span className="simple-list-title">{a.title}</span>
                      <span className="simple-list-sub">
                        {projects.find((p) => p.id === a.projectId)?.name} · Due {formatDate(a.dueDate)}
                      </span>
                    </Link>
                    {a.state === "changes-requested" && <Badge tone="danger">Changes</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent activity">
            <RecentActivity activities={activities} projects={projects} limit={5} />
          </Card>
        </div>
      </div>
    </>
  );
}
