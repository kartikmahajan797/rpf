"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/format";

/** Accessible-enough popover menu: toggles on click, closes on outside click / Escape. */
export function Dropdown({
  trigger,
  triggerLabel,
  triggerClassName,
  align = "end",
  width = 240,
  children,
}: {
  trigger: ReactNode;
  triggerLabel: string;
  triggerClassName?: string;
  align?: "start" | "end";
  width?: number;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={ref}>
      <button
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div id={id} role="menu" className={cx("dropdown-menu", `dropdown-${align}`)} style={{ width }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
