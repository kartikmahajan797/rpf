import { STATUS_META } from "@/lib/constants";
import type { ProjectStatus } from "@/lib/types";

export type Tone = "neutral" | "info" | "accent" | "warning" | "success" | "danger";

export function Badge({ tone = "neutral", children, dot = false }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}
