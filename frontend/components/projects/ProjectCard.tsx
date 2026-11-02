import Link from "next/link";
import { Avatar, ProgressBar, RelativeTime } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WORKFLOW_BY_KEY } from "@/lib/constants";
import type { Project } from "@/lib/types";

export function ProjectCard({ project }: { project: Project }) {
  const current = project.stages.find((s) => s.state === "current");
  return (
    <Link href={`/projects/${project.id}`} className="project-card">
      <div className="project-card-head">
        <div>
          <h3>{project.name}</h3>
          <p>{project.client.name}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <p className="project-card-desc">{project.description || "No description yet."}</p>
      <div className="project-card-stage">
        <span>Current stage</span>
        <strong>{current ? WORKFLOW_BY_KEY[current.key].label : "All stages complete"}</strong>
      </div>
      <ProgressBar value={project.progress} />
      <div className="project-card-foot">
        <Avatar userId={project.ownerId} size="sm" showName />
        <span className="cell-muted">
          Updated <RelativeTime iso={project.updatedAt} />
        </span>
      </div>
    </Link>
  );
}
