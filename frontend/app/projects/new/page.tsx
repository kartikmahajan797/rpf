"use client";

import { useRouter } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { CreateProjectForm } from "@/components/projects/CreateProjectForm";

const NEXT_STEPS = [
  { icon: "upload", title: "Add sources", text: "Upload meeting transcripts, RFPs, notes and client documents." },
  { icon: "list-checks", title: "Shape requirements", text: "Review and validate requirements extracted from your sources." },
  { icon: "file-text", title: "Produce deliverables", text: "Move through BRD/FRD, user stories, solution design and estimates." },
] as const;

export default function CreateProjectPage() {
  const router = useRouter();
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "All projects", href: "/projects" }, { label: "Create project" }]}
        title="Create project"
        description="Set up a new client engagement. Fields marked * are required."
      />
      <div className="form-layout">
        <Card>
          <CreateProjectForm onCancel={() => router.push("/projects")} onCreated={(p) => router.push(`/projects/${p.id}`)} />
        </Card>
        <Card title="What happens next" className="aside-card">
          <ol className="next-steps">
            {NEXT_STEPS.map((s) => (
              <li key={s.title}>
                <span className="next-step-icon">
                  <Icon name={s.icon} size={16} />
                </span>
                <div>
                  <strong>{s.title}</strong>
                  <p>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="note">
            Projects are saved to the workspace server and are visible after a refresh.
          </p>
        </Card>
      </div>
    </>
  );
}
