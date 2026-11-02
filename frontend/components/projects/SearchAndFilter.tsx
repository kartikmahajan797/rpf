"use client";

import { Icon } from "@/components/ui/Icon";
import { PROJECT_STATUSES, STATUS_META } from "@/lib/constants";
import { cx } from "@/lib/format";
import type { ProjectStatus } from "@/lib/types";

export type ViewMode = "list" | "grid";
export type SortKey = "updated" | "name" | "progress";

export interface ProjectFilters {
  query: string;
  status: ProjectStatus | "all";
  client: string;
  sort: SortKey;
}

export function SearchAndFilter({
  filters,
  onChange,
  clients,
  view,
  onViewChange,
}: {
  filters: ProjectFilters;
  onChange: (f: ProjectFilters) => void;
  clients: string[];
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
}) {
  const set = <K extends keyof ProjectFilters>(k: K, v: ProjectFilters[K]) => onChange({ ...filters, [k]: v });
  const active = filters.query || filters.status !== "all" || filters.client !== "all";

  return (
    <div className="filter-bar">
      <div className="input-icon filter-search">
        <Icon name="search" size={16} />
        <label htmlFor="project-search" className="sr-only">
          Search projects
        </label>
        <input
          id="project-search"
          type="search"
          placeholder="Search by project, client or owner"
          value={filters.query}
          onChange={(e) => set("query", e.target.value)}
        />
      </div>

      <label className="sr-only" htmlFor="filter-status">
        Status
      </label>
      <select id="filter-status" value={filters.status} onChange={(e) => set("status", e.target.value as ProjectFilters["status"])}>
        <option value="all">All statuses</option>
        {PROJECT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="filter-client">
        Client
      </label>
      <select id="filter-client" value={filters.client} onChange={(e) => set("client", e.target.value)}>
        <option value="all">All clients</option>
        {clients.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="filter-sort">
        Sort by
      </label>
      <select id="filter-sort" value={filters.sort} onChange={(e) => set("sort", e.target.value as SortKey)}>
        <option value="updated">Last updated</option>
        <option value="name">Name (A–Z)</option>
        <option value="progress">Progress</option>
      </select>

      {active && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...filters, query: "", status: "all", client: "all" })}>
          Clear filters
        </button>
      )}

      <div className="segmented" role="group" aria-label="View mode">
        <button type="button" className={cx(view === "list" && "on")} aria-pressed={view === "list"} onClick={() => onViewChange("list")} title="List view">
          <Icon name="list" size={16} />
          <span className="sr-only">List view</span>
        </button>
        <button type="button" className={cx(view === "grid" && "on")} aria-pressed={view === "grid"} onClick={() => onViewChange("grid")} title="Grid view">
          <Icon name="grid" size={16} />
          <span className="sr-only">Grid view</span>
        </button>
      </div>
    </div>
  );
}
