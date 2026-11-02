"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { CreateProjectForm } from "./CreateProjectForm";

export function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("input")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-project-title" ref={dialogRef}>
        <div className="modal-head">
          <div>
            <h2 id="create-project-title">Create project</h2>
            <p>Set up a new client engagement. You can add sources and documents next.</p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <CreateProjectForm
          idPrefix="modal"
          onCancel={onClose}
          onCreated={(p) => {
            onClose();
            router.push(`/projects/${p.id}`);
          }}
        />
      </div>
    </div>
  );
}
