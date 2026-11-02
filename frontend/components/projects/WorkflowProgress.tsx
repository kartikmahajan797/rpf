import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { WORKFLOW_BY_KEY } from "@/lib/constants";
import { cx } from "@/lib/format";
import type { Project } from "@/lib/types";

/** Stepper showing every workflow stage of a project; each stage links to its module. */
export function WorkflowProgress({ project }: { project: Project }) {
  const done = project.stages.filter((s) => s.state === "complete").length;
  return (
    <div className="workflow">
      <p className="workflow-summary">
        <strong>{done}</strong> of {project.stages.length} stages complete
      </p>
      <ol className="workflow-steps">
        {project.stages.map((s, i) => {
          const m = WORKFLOW_BY_KEY[s.key];
          return (
            <li key={s.key} className={cx("workflow-step", `step-${s.state}`)}>
              <Link href={`/projects/${project.id}/${s.key}`}>
                <span className="step-marker" aria-hidden="true">
                  {s.state === "complete" ? <Icon name="check" size={13} /> : i + 1}
                </span>
                <span className="step-label">{m.label}</span>
                <span className="sr-only">
                  {s.state === "complete" ? "(complete)" : s.state === "current" ? "(in progress)" : "(not started)"}
                </span>
                {s.state === "current" && <span className="step-tag">Current</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
