import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Avatar, EmptyState, RelativeTime } from "@/components/ui/primitives";
import { getMember } from "@/lib/format";
import type { Activity, ActivityKind, Project } from "@/lib/types";

const KIND_ICON: Record<ActivityKind, IconName> = {
  upload: "upload",
  requirement: "list-checks",
  review: "check-circle",
  document: "file-text",
  comment: "message",
  status: "activity",
  project: "plus-square",
  analysis: "chart",
};

export function RecentActivity({
  activities,
  projects,
  showProject = true,
  limit = 6,
}: {
  activities: Activity[];
  projects: Project[];
  showProject?: boolean;
  limit?: number;
}) {
  const items = [...activities].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
  if (items.length === 0) {
    return <EmptyState compact icon="activity" title="No activity yet" description="Updates from your team will appear here." />;
  }
  return (
    <ul className="activity-list">
      {items.map((a) => {
        const project = projects.find((p) => p.id === a.projectId);
        return (
          <li key={a.id}>
            <Avatar userId={a.actorId} size="sm" />
            <div className="activity-body">
              <p>
                <strong>{getMember(a.actorId).name}</strong> {a.message}
                {showProject && project && (
                  <>
                    {" "}
                    in <Link href={`/projects/${project.id}`}>{project.name}</Link>
                  </>
                )}
              </p>
              <span className="activity-meta">
                <Icon name={KIND_ICON[a.kind]} size={13} />
                <RelativeTime iso={a.timestamp} />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
