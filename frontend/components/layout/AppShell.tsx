"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ProjectsProvider, useProjects } from "@/lib/projects-store";
import { API_BASE_URL } from "@/lib/api";
import { cx } from "@/lib/format";
import { ShellContext } from "./shell-context";
import { Sidebar } from "./Sidebar";
import { TopNavbar } from "./TopNavbar";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";

const COLLAPSE_KEY = "practice-project:sidebar-collapsed";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  }, []);

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, mobileOpen, setMobileOpen, openCreateProject: () => setCreateOpen(true) }),
    [collapsed, toggleCollapsed, mobileOpen],
  );

  return (
    <ProjectsProvider>
      <ShellContext.Provider value={value}>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className={cx("shell", collapsed && "shell-collapsed", mobileOpen && "shell-mobile-open")}>
          <Sidebar />
          <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className="shell-main">
            <TopNavbar />
            <main id="main" className="content">
              <BackendStatus />
              {children}
            </main>
          </div>
        </div>
        <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
      </ShellContext.Provider>
    </ProjectsProvider>
  );
}

function BackendStatus() {
  const { error, reload } = useProjects();
  if (!error) return null;
  return (
    <div className="backend-banner" role="alert">
      <span>
        Can&apos;t load data from the backend at <code>{API_BASE_URL}</code> ({error}). Is <code>uvicorn</code> running?
      </span>
      <button type="button" className="btn btn-secondary" onClick={() => void reload()}>
        Retry
      </button>
    </div>
  );
}
