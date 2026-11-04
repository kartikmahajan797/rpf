"use client";

import type { Tone } from "@/components/ui/StatusBadge";
import type {
  ComponentLayer,
  DecisionStatus,
  Hosting,
  IntegrationDirection,
  IntegrationFrequency,
  IntegrationProtocol,
  IntegrationStatus,
  Requirement,
} from "@/lib/types";

export const HOSTING_LABEL: Record<Hosting, string> = { cloud: "Cloud", "on-premise": "On-premise", hybrid: "Hybrid", saas: "SaaS", tbd: "To be decided" };
export const LAYERS: ComponentLayer[] = ["channel", "service", "data", "platform"];
export const LAYER_LABEL: Record<ComponentLayer, string> = {
  channel: "Channels & front-ends",
  service: "Application services",
  data: "Data",
  platform: "Platform & infrastructure",
};
export const DIRECTION_LABEL: Record<IntegrationDirection, string> = { inbound: "Inbound ←", outbound: "Outbound →", both: "Both ⇄" };
export const PROTOCOL_LABEL: Record<IntegrationProtocol, string> = { rest: "REST", soap: "SOAP", event: "Events", file: "File", database: "Database", other: "Other" };
export const FREQUENCY_LABEL: Record<IntegrationFrequency, string> = { "real-time": "Real-time", batch: "Batch", "on-demand": "On demand" };
export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = { proposed: "Proposed", agreed: "Agreed" };
export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = { proposed: "Proposed", accepted: "Accepted", rejected: "Rejected", superseded: "Superseded" };

export const decisionTone = (s: DecisionStatus): Tone => (s === "accepted" ? "success" : s === "rejected" ? "danger" : s === "superseded" ? "neutral" : "warning");

export const keys = <T extends string>(o: Record<T, string>) => Object.keys(o) as T[];

/** Checkbox list of the project's requirements (shared by component and integration forms). */
export function RequirementPicker({ requirements, value, onChange }: { requirements: Requirement[]; value: string[]; onChange: (ids: string[]) => void }) {
  if (requirements.length === 0) return <span className="field-help">This project has no requirements yet.</span>;
  return (
    <div className="source-checkbox-list">
      {requirements.map((r) => (
        <label key={r.id} className="source-checkbox-item">
          <input
            type="checkbox"
            checked={value.includes(r.id)}
            onChange={() => onChange(value.includes(r.id) ? value.filter((v) => v !== r.id) : [...value, r.id])}
          />
          <span>
            <code className="ba-code">{r.code}</code> {r.title}
          </span>
        </label>
      ))}
    </div>
  );
}

export function ReqChips({ ids, byId }: { ids: string[]; byId: Map<string, Requirement> }) {
  if (!ids.length) return <span className="cell-muted">—</span>;
  return (
    <div className="ba-chips">
      {ids.map((id) => {
        const r = byId.get(id);
        return r ? (
          <span key={id} className="ba-chip" title={r.title}>
            {r.code}
          </span>
        ) : null;
      })}
    </div>
  );
}
