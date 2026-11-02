"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Dropdown } from "@/components/ui/Dropdown";
import { RelativeTime } from "@/components/ui/primitives";
import { CURRENT_USER_ID } from "@/lib/mock-data";
import { getMember } from "@/lib/format";
import { useProjects } from "@/lib/projects-store";
import { useShell } from "./shell-context";

export function TopNavbar() {
  const router = useRouter();
  const { setMobileOpen, openCreateProject } = useShell();
  const { approvals, projects } = useProjects();
  const [query, setQuery] = useState("");
  const me = getMember(CURRENT_USER_ID);

  const myReviews = approvals.filter((a) => a.assigneeId === CURRENT_USER_ID);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/projects?q=${encodeURIComponent(q)}` : "/projects");
  };

  return (
    <header className="topbar">
      <button type="button" className="icon-btn menu-btn" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
        <Icon name="menu" />
      </button>

      <form className="topbar-search" role="search" onSubmit={onSearch}>
        <Icon name="search" size={16} />
        <label htmlFor="global-search" className="sr-only">
          Search projects
        </label>
        <input
          id="global-search"
          type="search"
          placeholder="Search projects or clients…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>

      <div className="topbar-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={openCreateProject}>
          <Icon name="plus" size={16} />
          <span className="hide-sm">New project</span>
        </button>

        <Dropdown
          triggerLabel={`Notifications, ${myReviews.length} pending`}
          triggerClassName="icon-btn has-indicator"
          width={320}
          trigger={
            <>
              <Icon name="bell" />
              {myReviews.length > 0 && <span className="indicator" aria-hidden="true" />}
            </>
          }
        >
          {(close) => (
            <>
              <div className="dropdown-header">Assigned to you</div>
              {myReviews.length === 0 ? (
                <p className="dropdown-empty">You&apos;re all caught up.</p>
              ) : (
                myReviews.map((a) => {
                  const project = projects.find((p) => p.id === a.projectId);
                  return (
                    <Link key={a.id} href={`/projects/${a.projectId}`} role="menuitem" className="dropdown-item stacked" onClick={close}>
                      <span>Review: {a.title}</span>
                      <small>
                        {project?.name} · due <RelativeTime iso={`${a.dueDate}T17:00:00Z`} />
                      </small>
                    </Link>
                  );
                })
              )}
            </>
          )}
        </Dropdown>

        <Dropdown
          triggerLabel="Account menu"
          triggerClassName="user-trigger"
          trigger={
            <>
              <span className="avatar avatar-md" aria-hidden="true">
                {me.initials}
              </span>
              <span className="user-trigger-text hide-sm">
                <strong>{me.name}</strong>
                <small>{me.role}</small>
              </span>
              <Icon name="chevron-down" size={14} className="hide-sm" />
            </>
          }
        >
          {(close) => (
            <>
              <div className="dropdown-header">
                {me.name}
                <small>Demo account · sign-in not connected</small>
              </div>
              <Link href="/settings" role="menuitem" className="dropdown-item" onClick={close}>
                <Icon name="settings" size={16} /> Settings
              </Link>
              <Link href="/team" role="menuitem" className="dropdown-item" onClick={close}>
                <Icon name="users" size={16} /> Team &amp; Permissions
              </Link>
              <div className="dropdown-sep" />
              <button type="button" role="menuitem" className="dropdown-item" disabled title="Authentication is not implemented yet">
                <Icon name="logout" size={16} /> Sign out
              </button>
            </>
          )}
        </Dropdown>
      </div>
    </header>
  );
}
