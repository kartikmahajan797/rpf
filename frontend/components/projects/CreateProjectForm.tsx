"use client";

import { useState, type FormEvent } from "react";
import { INDUSTRIES, PROJECT_STATUSES, STATUS_META } from "@/lib/constants";
import { CURRENT_USER_ID } from "@/lib/mock-data";
import { useProjects } from "@/lib/projects-store";
import type { NewProjectInput, Project } from "@/lib/types";

type Errors = Partial<Record<keyof NewProjectInput, string>>;

const EMPTY: NewProjectInput = {
  name: "",
  clientName: "",
  industry: "",
  ownerId: CURRENT_USER_ID,
  description: "",
  status: "draft",
};

const DESCRIPTION_MAX = 600;

function validate(v: NewProjectInput, existingNames: string[]): Errors {
  const e: Errors = {};
  const name = v.name.trim();
  if (!name) e.name = "Project name is required.";
  else if (name.length < 3) e.name = "Use at least 3 characters.";
  else if (name.length > 80) e.name = "Keep it under 80 characters.";
  else if (existingNames.includes(name.toLowerCase())) e.name = "A project with this name already exists.";
  if (!v.clientName.trim()) e.clientName = "Client name is required.";
  if (!v.industry) e.industry = "Select an industry.";
  if (!v.ownerId) e.ownerId = "Select a project owner.";
  if (v.description.length > DESCRIPTION_MAX) e.description = `Keep the description under ${DESCRIPTION_MAX} characters.`;
  return e;
}

export function CreateProjectForm({
  onCreated,
  onCancel,
  idPrefix = "cp",
}: {
  onCreated: (p: Project) => void;
  onCancel: () => void;
  idPrefix?: string;
}) {
  const { projects, team, createProject } = useProjects();
  const [values, setValues] = useState<NewProjectInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<keyof NewProjectInput, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  const errors = validate(
    values,
    projects.map((p) => p.name.toLowerCase()),
  );
  const show = (k: keyof NewProjectInput) => (submitted || touched[k]) && errors[k];

  const set = <K extends keyof NewProjectInput>(k: K, v: NewProjectInput[K]) => setValues((s) => ({ ...s, [k]: v }));
  const blur = (k: keyof NewProjectInput) => () => setTouched((t) => ({ ...t, [k]: true }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (saving) return;
    if (Object.keys(errors).length > 0) {
      const first = Object.keys(errors)[0];
      document.getElementById(`${idPrefix}-${first}`)?.focus();
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      onCreated(await createProject(values));
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not create the project.");
      setSaving(false);
    }
  };

  const fieldProps = (k: keyof NewProjectInput) => ({
    id: `${idPrefix}-${k}`,
    "aria-invalid": Boolean(show(k)),
    "aria-describedby": show(k) ? `${idPrefix}-${k}-error` : undefined,
    onBlur: blur(k),
  });

  const err = (k: keyof NewProjectInput) =>
    show(k) ? (
      <p className="field-error" id={`${idPrefix}-${k}-error`}>
        {errors[k]}
      </p>
    ) : null;

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="form-grid">
        <div className="field span-2">
          <label htmlFor={`${idPrefix}-name`}>
            Project name <span className="req">*</span>
          </label>
          <input {...fieldProps("name")} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Core Banking Modernization" autoComplete="off" />
          {err("name")}
        </div>

        <div className="field">
          <label htmlFor={`${idPrefix}-clientName`}>
            Client name <span className="req">*</span>
          </label>
          <input {...fieldProps("clientName")} value={values.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder="e.g. Northwind Bank" autoComplete="organization" />
          {err("clientName")}
        </div>

        <div className="field">
          <label htmlFor={`${idPrefix}-industry`}>
            Industry <span className="req">*</span>
          </label>
          <select {...fieldProps("industry")} value={values.industry} onChange={(e) => set("industry", e.target.value as NewProjectInput["industry"])}>
            <option value="">Select industry</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          {err("industry")}
        </div>

        <div className="field">
          <label htmlFor={`${idPrefix}-ownerId`}>
            Project owner <span className="req">*</span>
          </label>
          <select {...fieldProps("ownerId")} value={values.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.role}
              </option>
            ))}
          </select>
          {err("ownerId")}
        </div>

        <div className="field">
          <label htmlFor={`${idPrefix}-status`}>Initial status</label>
          <select {...fieldProps("status")} value={values.status} onChange={(e) => set("status", e.target.value as NewProjectInput["status"])}>
            {PROJECT_STATUSES.filter((s) => s !== "completed").map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
        </div>

        <div className="field span-2">
          <label htmlFor={`${idPrefix}-description`}>Project description</label>
          <textarea
            {...fieldProps("description")}
            rows={4}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Engagement scope, objectives and key stakeholders."
          />
          <div className="field-foot">
            {err("description") ?? <span className="field-help">Optional. You can refine this later.</span>}
            <span className={values.description.length > DESCRIPTION_MAX ? "counter over" : "counter"}>
              {values.description.length}/{DESCRIPTION_MAX}
            </span>
          </div>
        </div>
      </div>

      {serverError ? (
        <p className="field-error" role="alert">
          Could not create the project: {serverError}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
          {saving ? "Creating…" : "Create project"}
        </button>
      </div>
    </form>
  );
}
