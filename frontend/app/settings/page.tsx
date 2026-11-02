"use client";

import { useState } from "react";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
import { Card } from "@/components/ui/primitives";
import { useProjects } from "@/lib/projects-store";

export default function SettingsPage() {
  const { projects, clearProjects, restoreSampleData } = useProjects();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = (action: () => Promise<void>, confirmText: string) => async () => {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlaceholderPage title="Settings" icon="settings" description="Workspace preferences. Most settings arrive in a later phase.">
      <Card title="Demo data">
        <p className="card-text">
          Projects are stored on the backend server. You can clear them to see the empty states, or reset the server to the sample projects.
          Currently {projects.length} project{projects.length === 1 ? "" : "s"} on the server.
        </p>
        <div className="form-actions start">
          <button type="button" className="btn btn-secondary" onClick={run(clearProjects, "Delete every project on the server? This cannot be undone.")} disabled={busy || projects.length === 0}>
            Clear all projects
          </button>
          <button type="button" className="btn btn-primary" onClick={run(restoreSampleData, "Replace ALL server data with the sample projects? Any projects you created will be deleted.")} disabled={busy}>
            Restore sample data
          </button>
        </div>
        {message ? <p className="field-error" role="alert">{message}</p> : null}
      </Card>
    </PlaceholderPage>
  );
}
