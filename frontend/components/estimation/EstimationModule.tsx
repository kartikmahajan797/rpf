"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDelete, FormError, errorText } from "@/components/analysis/shared";
import { Actions, EditModal, Select, useEditor } from "@/components/solution/ItemTabs";
import { RequirementPicker, ReqChips } from "@/components/solution/shared";
import { Icon } from "@/components/ui/Icon";
import { Card, EmptyState, StatCard, Tabs } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { useProjects } from "@/lib/projects-store";
import type {
  CommercialModel,
  Currency,
  EstimateItem,
  EstimatePhase,
  EstimateRole,
  EstimationOverview,
  EstimationSettings,
  Project,
  Requirement,
} from "@/lib/types";

type TabKey = "items" | "team" | "pricing";

const PHASE_LABEL: Record<EstimatePhase, string> = { discovery: "Discovery", design: "Design", build: "Build", test: "Test", deploy: "Deploy", support: "Support" };
const MODEL_LABEL: Record<CommercialModel, string> = { tbd: "To be decided", "fixed-price": "Fixed price", "time-and-materials": "Time & materials", milestone: "Milestone based" };
const CURRENCY_LABEL: Record<Currency, string> = { USD: "USD", EUR: "EUR", GBP: "GBP", INR: "INR", AUD: "AUD", CAD: "CAD" };

const days = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const moneyFormat = (currency: Currency) => {
  const f = new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
  return (n: number) => f.format(n);
};
const right = { textAlign: "right" as const };

export function EstimationModule({ project }: { project: Project }) {
  const { reload } = useProjects();
  const [data, setData] = useState<EstimationOverview | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("items");
  const [pricingDirty, setPricingDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const [overview, reqs] = await Promise.all([api.getEstimation(project.id), api.listRequirements(project.id)]);
      setData(overview);
      setRequirements(reqs);
      setError(null);
    } catch (err) {
      setError(errorText(err, "Failed to load the estimate"));
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onChanged = useCallback(async () => {
    await load();
    await reload();
  }, [load, reload]);

  if (!data) {
    return error ? (
      <FormError message={error} />
    ) : (
      <Card>
        <p className="cell-muted">Loading estimate…</p>
      </Card>
    );
  }

  const changeTab = (next: TabKey) => {
    if (tab === "pricing" && pricingDirty && !window.confirm("You have unsaved changes to the commercial terms. Leave without saving?")) return;
    setPricingDirty(false);
    setTab(next);
  };

  const { summary, settings } = data;
  const money = moneyFormat(settings.currency);

  return (
    <div className="stack">
      <FormError message={error} />

      <div className="stats-grid">
        <StatCard label="Total effort" value={`${days(summary.totalDays)} d`} icon="clock" hint={`${data.items.length} item${data.items.length === 1 ? "" : "s"}`} />
        <StatCard label="Team" value={data.roles.reduce((n, r) => n + r.headcount, 0)} icon="users" hint={`${data.roles.length} role${data.roles.length === 1 ? "" : "s"}`} />
        <StatCard label="Minimum duration" value={`${summary.durationWeeks} wk`} icon="calendar" hint="Busiest role, working in parallel" />
        <StatCard label="Total price" value={money(summary.total)} icon="calculator" hint={MODEL_LABEL[settings.commercialModel]} />
      </div>

      {summary.unassignedDays > 0 && (
        <div className="ba-alert ba-alert-warning">{days(summary.unassignedDays)} days have no role, so they are not included in the price. Assign a role to each item.</div>
      )}
      {summary.unestimatedItems > 0 && (
        <div className="ba-alert ba-alert-warning">
          {summary.unestimatedItems} item{summary.unestimatedItems === 1 ? " has" : "s have"} no effort entered yet.
        </div>
      )}

      <div className="ba-toolbar">
        <Tabs<TabKey>
          label="Estimation sections"
          value={tab}
          onChange={changeTab}
          tabs={[
            { value: "items", label: "Effort", count: data.items.length },
            { value: "team", label: "Team & rates", count: data.roles.length },
            { value: "pricing", label: "Pricing" },
          ]}
        />
        <div className="us-toolbar-actions">
          <a className="btn btn-secondary btn-sm" href={api.exportEstimationUrl(project.id)} title="Download the estimate as Markdown">
            <Icon name="download" size={14} /> Markdown
          </a>
        </div>
      </div>

      {tab === "items" && <ItemsTab projectId={project.id} data={data} requirements={requirements} money={money} onChanged={onChanged} />}
      {tab === "team" && <TeamTab projectId={project.id} data={data} money={money} onChanged={onChanged} />}
      {tab === "pricing" && (
        <PricingTab
          key={settings.updatedAt ?? "new"}
          projectId={project.id}
          data={data}
          money={money}
          onSaved={onChanged}
          onDirtyChange={setPricingDirty}
        />
      )}
    </div>
  );
}

// ─────────────────────────────── effort items ──────────────────────────────

type ItemForm = {
  title: string;
  phase: EstimatePhase;
  description: string;
  roleId: string;
  optimisticDays: string;
  likelyDays: string;
  pessimisticDays: string;
  requirementIds: string[];
};

const EMPTY_ITEM: ItemForm = { title: "", phase: "build", description: "", roleId: "", optimisticDays: "", likelyDays: "", pessimisticDays: "", requirementIds: [] };

const toNumber = (s: string) => (s.trim() === "" ? 0 : Number(s));

function validateItem(f: ItemForm): string | null {
  if (!f.title.trim()) return "Title is required";
  const [o, l, p] = [f.optimisticDays, f.likelyDays, f.pessimisticDays].map(toNumber);
  if (![o, l, p].every((n) => Number.isFinite(n) && n >= 0)) return "Days must be zero or more";
  if (!(o <= l && l <= p)) return "Days must go up: optimistic ≤ most likely ≤ pessimistic";
  return null;
}

function ItemsTab({ projectId, data, requirements, money, onChanged }: {
  projectId: string;
  data: EstimationOverview;
  requirements: Requirement[];
  money: (n: number) => string;
  onChanged: () => Promise<void>;
}) {
  const ed = useEditor<EstimateItem, ItemForm>(EMPTY_ITEM, (i) => ({
    title: i.title,
    phase: i.phase,
    description: i.description,
    roleId: i.roleId ?? "",
    optimisticDays: String(i.optimisticDays),
    likelyDays: String(i.likelyDays),
    pessimisticDays: String(i.pessimisticDays),
    requirementIds: i.requirementIds,
  }));
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const f = ed.form;
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const roleName = new Map(data.roles.map((r) => [r.id, r.name]));
  const roleOptions: Record<string, string> = { "": "Unassigned", ...Object.fromEntries(data.roles.map((r) => [r.id, r.name])) };

  const importStories = async () => {
    setBusy(true);
    setImportError(null);
    try {
      await api.estimateItemsFromStories(projectId);
      await onChanged();
    } catch (err) {
      setImportError(errorText(err, "Failed to add items from stories"));
    } finally {
      setBusy(false);
    }
  };

  const dayField = (key: "optimisticDays" | "likelyDays" | "pessimisticDays", label: string) =>
    f && (
      <div className="field">
        <label htmlFor={`ei-${key}`}>{label}</label>
        <input id={`ei-${key}`} type="number" min={0} step={0.5} value={f[key]} onChange={(e) => ed.setForm({ ...f, [key]: e.target.value })} />
      </div>
    );

  return (
    <>
      <FormError message={ed.listError ?? importError} />
      <Card
        flush
        title={`Effort items (${data.items.length})`}
        action={
          <div className="action-btn-group">
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} title="Add one item per user story that has no estimate, sized from its story points" onClick={() => void importStories()}>
              <Icon name="book" size={14} /> {busy ? "Adding…" : "From user stories"}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={ed.openAdd}>
              <Icon name="plus" size={14} /> Add item
            </button>
          </div>
        }
      >
        {data.items.length === 0 ? (
          <EmptyState icon="calculator" title="No effort items yet" description="Add the work to be delivered, or create items from your user stories. Each item takes optimistic, most likely and pessimistic days." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Phase</th>
                  <th scope="col">Role</th>
                  <th scope="col" style={right} title="Optimistic / most likely / pessimistic days">O / L / P</th>
                  <th scope="col" style={right}>Expected</th>
                  <th scope="col" style={right}>Cost</th>
                  <th scope="col">Requirements</th>
                  <th scope="col" style={right}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="cell-title">
                        <code className="ba-code">{i.code}</code> {i.title}
                      </div>
                      {i.description && <div className="cell-sub">{i.description}</div>}
                    </td>
                    <td>{PHASE_LABEL[i.phase]}</td>
                    <td>{i.roleId ? roleName.get(i.roleId) : <Badge tone="warning">Unassigned</Badge>}</td>
                    <td style={right}>
                      {i.pessimisticDays === 0 ? <Badge tone="warning">Not sized</Badge> : `${days(i.optimisticDays)} / ${days(i.likelyDays)} / ${days(i.pessimisticDays)}`}
                    </td>
                    <td style={right}>{days(i.expectedDays)} d</td>
                    <td style={right}>{money(i.cost)}</td>
                    <td>
                      <ReqChips ids={i.requirementIds} byId={byId} />
                    </td>
                    <td style={right}>
                      <Actions onEdit={() => ed.openEdit(i)} onDelete={() => ed.setToDelete(i)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {f && (
        <EditModal
          title={ed.editing ? `Edit ${ed.editing.code}` : "Add effort item"}
          subtitle="Expected days = (optimistic + 4 × most likely + pessimistic) ÷ 6."
          error={ed.error}
          saving={ed.saving}
          onClose={ed.close}
          onSave={() =>
            void ed.save(
              (form, editing) => {
                const input = {
                  title: form.title,
                  phase: form.phase,
                  description: form.description,
                  roleId: form.roleId || null,
                  optimisticDays: toNumber(form.optimisticDays),
                  likelyDays: toNumber(form.likelyDays),
                  pessimisticDays: toNumber(form.pessimisticDays),
                  requirementIds: form.requirementIds,
                };
                return editing ? api.patchEstimateItem(projectId, editing.id, input) : api.createEstimateItem(projectId, input);
              },
              validateItem,
              onChanged,
            )
          }
        >
          <div className="field span-2">
            <label htmlFor="ei-title">
              Title <span className="req">*</span>
            </label>
            <input id="ei-title" autoFocus value={f.title} placeholder="e.g. Payments API" onChange={(e) => ed.setForm({ ...f, title: e.target.value })} />
          </div>
          <Select id="ei-phase" label="Phase" value={f.phase} options={PHASE_LABEL} onChange={(phase) => ed.setForm({ ...f, phase })} />
          <Select id="ei-role" label="Role" value={f.roleId} options={roleOptions} onChange={(roleId) => ed.setForm({ ...f, roleId })} />
          {dayField("optimisticDays", "Optimistic days")}
          {dayField("likelyDays", "Most likely days")}
          {dayField("pessimisticDays", "Pessimistic days")}
          <div className="field span-2">
            <label htmlFor="ei-desc">Notes</label>
            <textarea id="ei-desc" rows={2} value={f.description} onChange={(e) => ed.setForm({ ...f, description: e.target.value })} />
          </div>
          <div className="field span-2">
            <label>Delivers requirements</label>
            <RequirementPicker requirements={requirements} value={f.requirementIds} onChange={(requirementIds) => ed.setForm({ ...f, requirementIds })} />
          </div>
        </EditModal>
      )}

      {ed.toDelete && (
        <ConfirmDelete
          label={`${ed.toDelete.code}: ${ed.toDelete.title}`}
          busy={ed.deleting}
          onCancel={() => ed.setToDelete(null)}
          onConfirm={() => void ed.remove((i) => api.deleteEstimateItem(projectId, i.id), onChanged)}
        />
      )}
    </>
  );
}

// ─────────────────────────────── team ──────────────────────────────────────

type RoleForm = { name: string; dayRate: string; headcount: string };
const EMPTY_ROLE: RoleForm = { name: "", dayRate: "", headcount: "1" };

function validateRole(f: RoleForm): string | null {
  if (!f.name.trim()) return "Role name is required";
  const rate = toNumber(f.dayRate);
  if (!Number.isFinite(rate) || rate < 0) return "Day rate must be zero or more";
  const count = Number(f.headcount);
  if (!Number.isInteger(count) || count < 1) return "Headcount must be a whole number, 1 or more";
  return null;
}

function TeamTab({ projectId, data, money, onChanged }: { projectId: string; data: EstimationOverview; money: (n: number) => string; onChanged: () => Promise<void> }) {
  const ed = useEditor<EstimateRole, RoleForm>(EMPTY_ROLE, (r) => ({ name: r.name, dayRate: String(r.dayRate), headcount: String(r.headcount) }));
  const f = ed.form;
  const totals = new Map(data.summary.byRole.map((t) => [t.roleId, t]));

  return (
    <>
      <FormError message={ed.listError} />
      <Card
        flush
        title={`Team & rates (${data.roles.length})`}
        action={
          <button type="button" className="btn btn-primary btn-sm" onClick={ed.openAdd}>
            <Icon name="plus" size={14} /> Add role
          </button>
        }
      >
        {data.roles.length === 0 ? (
          <EmptyState icon="users" title="No roles yet" description="Add the roles on the delivery team with their day rates. Effort items are priced at their role's rate." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col" style={right}>Headcount</th>
                  <th scope="col" style={right}>Day rate</th>
                  <th scope="col" style={right}>Days</th>
                  <th scope="col" style={right}>Weeks</th>
                  <th scope="col" style={right}>Cost</th>
                  <th scope="col" style={right}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.roles.map((r) => {
                  const t = totals.get(r.id);
                  return (
                    <tr key={r.id}>
                      <td className="cell-title">{r.name}</td>
                      <td style={right}>{r.headcount}</td>
                      <td style={right}>{money(r.dayRate)}</td>
                      <td style={right}>{days(t?.days ?? 0)}</td>
                      <td style={right}>{t?.weeks ?? 0}</td>
                      <td style={right}>{money(t?.cost ?? 0)}</td>
                      <td style={right}>
                        <Actions onEdit={() => ed.openEdit(r)} onDelete={() => ed.setToDelete(r)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {f && (
        <EditModal
          title={ed.editing ? `Edit ${ed.editing.name}` : "Add role"}
          subtitle="A role on the delivery team and what the client pays per day."
          error={ed.error}
          saving={ed.saving}
          onClose={ed.close}
          onSave={() =>
            void ed.save(
              (form, editing) => {
                const input = { name: form.name, dayRate: toNumber(form.dayRate), headcount: Number(form.headcount) };
                return editing ? api.patchEstimateRole(projectId, editing.id, input) : api.createEstimateRole(projectId, input);
              },
              validateRole,
              onChanged,
            )
          }
        >
          <div className="field span-2">
            <label htmlFor="er-name">
              Role <span className="req">*</span>
            </label>
            <input id="er-name" autoFocus value={f.name} placeholder="e.g. Senior developer" onChange={(e) => ed.setForm({ ...f, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="er-rate">Day rate ({data.settings.currency})</label>
            <input id="er-rate" type="number" min={0} value={f.dayRate} onChange={(e) => ed.setForm({ ...f, dayRate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="er-count">Headcount</label>
            <input id="er-count" type="number" min={1} step={1} value={f.headcount} onChange={(e) => ed.setForm({ ...f, headcount: e.target.value })} />
          </div>
        </EditModal>
      )}

      {ed.toDelete && (
        <ConfirmDelete
          label={ed.toDelete.name}
          busy={ed.deleting}
          onCancel={() => ed.setToDelete(null)}
          onConfirm={() => void ed.remove((r) => api.deleteEstimateRole(projectId, r.id), onChanged)}
        />
      )}
    </>
  );
}

// ─────────────────────────────── pricing ───────────────────────────────────

const settingsForm = (s: EstimationSettings) => ({
  currency: s.currency,
  commercialModel: s.commercialModel,
  contingencyPct: String(s.contingencyPct),
  discountPct: String(s.discountPct),
  daysPerPoint: String(s.daysPerPoint),
  assumptions: s.assumptions,
});

function PricingTab({ projectId, data, money, onSaved, onDirtyChange }: {
  projectId: string;
  data: EstimationOverview;
  money: (n: number) => string;
  onSaved: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { settings, summary } = data;
  const [form, setForm] = useState(() => settingsForm(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = settingsForm(settings);
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== initial[k]);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const save = async () => {
    const [contingency, discount, perPoint] = [form.contingencyPct, form.discountPct, form.daysPerPoint].map(toNumber);
    if (![contingency, discount].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) return setError("Contingency and discount must be between 0 and 100");
    if (!Number.isFinite(perPoint) || perPoint <= 0 || perPoint > 100) return setError("Days per story point must be above 0 and at most 100");
    setSaving(true);
    setError(null);
    try {
      await api.saveEstimationSettings(projectId, {
        currency: form.currency,
        commercialModel: form.commercialModel,
        contingencyPct: contingency,
        discountPct: discount,
        daysPerPoint: perPoint,
        assumptions: form.assumptions,
      });
      onDirtyChange(false);
      await onSaved();
    } catch (err) {
      setError(errorText(err, "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const row = (label: string, value: string, strong = false) => (
    <tr>
      <td className={strong ? "cell-title" : undefined}>{label}</td>
      <td style={right} className={strong ? "cell-title" : undefined}>{value}</td>
    </tr>
  );

  return (
    <div className="sd-grid">
      <Card title="Commercial terms">
        <FormError message={error} />
        <div className="form-grid">
          <Select id="ep-model" label="Commercial model" value={form.commercialModel} options={MODEL_LABEL} onChange={(commercialModel) => setForm({ ...form, commercialModel })} />
          <Select id="ep-currency" label="Currency" value={form.currency} options={CURRENCY_LABEL} onChange={(currency) => setForm({ ...form, currency })} />
          <div className="field">
            <label htmlFor="ep-cont">Contingency %</label>
            <input id="ep-cont" type="number" min={0} max={100} value={form.contingencyPct} onChange={(e) => setForm({ ...form, contingencyPct: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ep-disc">Discount %</label>
            <input id="ep-disc" type="number" min={0} max={100} value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ep-dpp">Days per story point</label>
            <input id="ep-dpp" type="number" min={0.1} step={0.1} value={form.daysPerPoint} onChange={(e) => setForm({ ...form, daysPerPoint: e.target.value })} />
            <span className="field-help">Used only when creating items from user stories.</span>
          </div>
          <div className="field span-2">
            <label htmlFor="ep-assume">Assumptions</label>
            <textarea id="ep-assume" rows={5} value={form.assumptions} placeholder="What this price relies on, and what it excludes" onChange={(e) => setForm({ ...form, assumptions: e.target.value })} />
          </div>
        </div>
        <div className="form-actions start">
          <button type="button" className="btn btn-primary" disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? "Saving…" : "Save terms"}
          </button>
        </div>
      </Card>

      <Card flush title="Price summary">
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {row("Effort subtotal", money(summary.subtotal))}
              {row(`Contingency (${settings.contingencyPct}%)`, money(summary.contingencyAmount))}
              {row(`Discount (${settings.discountPct}%)`, `−${money(summary.discountAmount)}`)}
              {row("Total price", money(summary.total), true)}
              {row("Blended day rate", money(summary.blendedDayRate))}
              {summary.byPhase.map((p) => (
                <tr key={p.phase}>
                  <td>{PHASE_LABEL[p.phase]}</td>
                  <td style={right}>
                    {days(p.days)} d · {money(p.cost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
