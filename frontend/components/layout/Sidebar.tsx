"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { WORKFLOW_MODULES } from "@/lib/constants";
import { useProjects } from "@/lib/projects-store";
import { cx } from "@/lib/format";
import { useShell } from "./shell-context";

interface NavLink {
  label: string;
  href: string;
  icon: IconName;
  /** Match exactly instead of by prefix. */
  exact?: boolean;
}

const WORKSPACE_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/", icon: "dashboard", exact: true },
  { label: "All Projects", href: "/projects", icon: "projects", exact: true },
  { label: "Create Project", href: "/projects/new", icon: "plus-square", exact: true },
];

const CONFIG_LINKS: NavLink[] = [
  { label: "Templates", href: "/templates", icon: "template" },
  { label: "Team & Permissions", href: "/team", icon: "users" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

type GroupKey = "workspace" | "workflow" | "config";

function projectIdFromPath(pathname: string) {
  const m = pathname.match(/^\/projects\/([^/]+)/);
  return m && m[1] !== "new" ? m[1] : null;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggleCollapsed, setMobileOpen } = useShell();
  const { projects } = useProjects();
  const [open, setOpen] = useState<Record<GroupKey, boolean>>({ workspace: true, workflow: true, config: true });
  const [lastProjectId, setLastProjectId] = useState<string | null>(null);

  const routeProjectId = projectIdFromPath(pathname);
  useEffect(() => {
    if (routeProjectId) setLastProjectId(routeProjectId);
  }, [routeProjectId]);

  // Workflow links are contextual to a project: the one in the URL, the last one visited, or the most recent active one.
  const contextProject =
    projects.find((p) => p.id === (routeProjectId ?? lastProjectId)) ??
    projects.find((p) => p.status !== "completed") ??
    projects[0];

  const isActive = (link: NavLink) => (link.exact ? pathname === link.href : pathname.startsWith(link.href));

  const renderLink = (link: NavLink) => {
    const active = isActive(link);
    return (
      <li key={link.href}>
        <Link
          href={link.href}
          className={cx("nav-link", active && "nav-link-active")}
          aria-current={active ? "page" : undefined}
          title={collapsed ? link.label : undefined}
        >
          <Icon name={link.icon} size={17} />
          <span className="nav-label">{link.label}</span>
        </Link>
      </li>
    );
  };

  const groupHeader = (key: GroupKey, label: string) => (
    <button
      type="button"
      className="nav-group-toggle"
      aria-expanded={open[key]}
      onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
    >
      <span>{label}</span>
      <Icon name="chevron-down" size={14} className={cx("chevron", !open[key] && "chevron-closed")} />
    </button>
  );

  const workflowLinks: NavLink[] = contextProject
    ? [
        { label: "Project Overview", href: `/projects/${contextProject.id}`, icon: "activity", exact: true },
        ...WORKFLOW_MODULES.map((m) => ({ label: m.label, href: `/projects/${contextProject.id}/${m.key}`, icon: m.icon })),
      ]
    : [];

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-brand">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            PP
          </span>
          <span className="brand-text">
            <strong>Practice Project</strong>
            <small>Consulting workspace</small>
          </span>
        </Link>
        <button type="button" className="icon-btn sidebar-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
          <Icon name="x" />
        </button>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-group">
          {groupHeader("workspace", "Workspace")}
          {(open.workspace || collapsed) && <ul>{WORKSPACE_LINKS.map(renderLink)}</ul>}
        </div>

        <div className="nav-group">
          {groupHeader("workflow", "Project Workflow")}
          {(open.workflow || collapsed) &&
            (contextProject ? (
              <>
                <div className="project-switcher">
                  <label htmlFor="project-switcher" className="sr-only">
                    Current project
                  </label>
                  <Icon name="folder" size={15} />
                  <select
                    id="project-switcher"
                    value={contextProject.id}
                    onChange={(e) => {
                      setLastProjectId(e.target.value);
                      if (routeProjectId) router.push(pathname.replace(routeProjectId, e.target.value));
                    }}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <ul>{workflowLinks.map(renderLink)}</ul>
              </>
            ) : (
              <p className="nav-hint">Create a project to unlock its workflow modules.</p>
            ))}
        </div>

        <div className="nav-group">
          {groupHeader("config", "Configuration")}
          {(open.config || collapsed) && <ul>{CONFIG_LINKS.map(renderLink)}</ul>}
        </div>
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="nav-link collapse-btn"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : undefined}
        >
          <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={17} />
          <span className="nav-label">Collapse</span>
        </button>
      </div>
    </aside>
  );
}
