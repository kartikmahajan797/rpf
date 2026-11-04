import type { Tone } from "@/components/ui/StatusBadge";
import type { StoryPriority, StoryStatus } from "@/lib/types";

export const PRIORITIES: StoryPriority[] = ["must", "should", "could"];
export const STATUSES: StoryStatus[] = ["backlog", "ready", "in-progress", "done"];
export const POINTS = [1, 2, 3, 5, 8, 13, 21];

export const PRIORITY_LABEL: Record<StoryPriority, string> = { must: "Must", should: "Should", could: "Could" };
export const STATUS_LABEL: Record<StoryStatus, string> = { backlog: "Backlog", ready: "Ready", "in-progress": "In progress", done: "Done" };

export const priorityTone = (p: StoryPriority): Tone => (p === "must" ? "danger" : p === "should" ? "warning" : "neutral");
export const statusTone = (s: StoryStatus): Tone => (s === "done" ? "success" : s === "in-progress" ? "info" : s === "ready" ? "accent" : "neutral");
