"use client";

import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
import { Avatar, Card } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { useProjects } from "@/lib/projects-store";

export default function TeamPage() {
  const { team } = useProjects();
  return (
    <PlaceholderPage title="Team & Permissions" icon="users" description="Who has access to this workspace. Invitations and role management come in a later phase.">
      <Card title="Members" action={<Badge>{team.length}</Badge>} flush>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Access</th>
              </tr>
            </thead>
            <tbody>
              {team.map((m, i) => (
                <tr key={m.id}>
                  <td>
                    <Avatar userId={m.id} size="sm" showName />
                  </td>
                  <td className="cell-muted">{m.role}</td>
                  <td>
                    <Badge tone={i === 0 ? "accent" : "neutral"}>{i === 0 ? "Admin" : "Member"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PlaceholderPage>
  );
}
