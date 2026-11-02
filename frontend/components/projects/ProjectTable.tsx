"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, ProgressBar, RelativeTime } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getMember } from "@/lib/format";
import type { Project } from "@/lib/types";

export function ProjectTable({ projects, compact = false }: { projects: Project[]; compact?: boolean }) {
  const router = useRouter();
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Project</th>
            {!compact && <th scope="col">Owner</th>}
            <th scope="col">Status</th>
            <th scope="col" className="col-progress">
              Progress
            </th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="row-link" onClick={() => router.push(`/projects/${p.id}`)}>
              <td>
                <Link href={`/projects/${p.id}`} className="cell-title" onClick={(e) => e.stopPropagation()}>
                  {p.name}
                </Link>
                <span className="cell-sub">{p.client.name}</span>
              </td>
              {!compact && (
                <td>
                  <span className="owner-cell">
                    <Avatar userId={p.ownerId} size="sm" />
                    <span>{getMember(p.ownerId).name}</span>
                  </span>
                </td>
              )}
              <td>
                <StatusBadge status={p.status} />
              </td>
              <td className="col-progress">
                <ProgressBar value={p.progress} />
              </td>
              <td className="cell-muted nowrap">
                <RelativeTime iso={p.updatedAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
