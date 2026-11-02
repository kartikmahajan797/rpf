"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cx, formatRelative, getMember } from "@/lib/format";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {breadcrumb && (
          <nav aria-label="Breadcrumb" className="breadcrumb">
            {breadcrumb.map((b, i) => (
              <span key={b.label}>
                {b.href ? <Link href={b.href}>{b.label}</Link> : <span aria-current="page">{b.label}</span>}
                {i < breadcrumb.length - 1 && <Icon name="chevron-right" size={14} />}
              </span>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  action,
  children,
  className,
  flush = false,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cx("card", className)}>
      {(title || action) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      <div className={cx("card-body", flush && "card-body-flush")}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: number | string;
  icon: IconName;
  hint?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">
          <Icon name={icon} size={16} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx("empty-state", compact && "empty-state-compact")}>
      <span className="empty-icon">
        <Icon name={icon} size={compact ? 18 : 22} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, label = true }: { value: number; label?: boolean }) {
  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${value}% complete`}
      >
        <div className="progress-fill" style={{ width: `${value}%` }} />
      </div>
      {label && <span className="progress-value">{value}%</span>}
    </div>
  );
}

export function Avatar({ userId, size = "md", showName = false }: { userId: string; size?: "sm" | "md"; showName?: boolean }) {
  const m = getMember(userId);
  return (
    <span className="avatar-wrap" title={showName ? undefined : m.name}>
      <span className={cx("avatar", `avatar-${size}`)} aria-hidden={showName}>
        {m.initials}
      </span>
      {showName && <span className="avatar-name">{m.name}</span>}
    </span>
  );
}

/** Renders a relative timestamp after mount to avoid server/client clock mismatches. */
export function RelativeTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => setText(formatRelative(iso)), [iso]);
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()}>
      {text ?? " "}
    </time>
  );
}

export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: number | string }) {
  return <span className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={cx("tab", value === t.value && "tab-active")}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
