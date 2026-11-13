import type { LocalActivity, LocalExperiment, LocalLedgerEntry } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function ledger(value: unknown, income = false): LocalLedgerEntry[] | null {
  if (!Array.isArray(value)) return null;
  const items: LocalLedgerEntry[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.date !== "string" || typeof entry.amount !== "number" || !Number.isFinite(entry.amount) || entry.amount < 0 || typeof entry.currency !== "string" || !/^[A-Z]{3}$/.test(entry.currency) || typeof entry.note !== "string") return null;
    const status = income ? (entry.status === "pending" ? "pending" : "received") : undefined;
    const deductions = entry.deductions == null ? 0 : Number(entry.deductions);
    const refunds = entry.refunds == null ? 0 : Number(entry.refunds);
    if (!Number.isFinite(deductions) || deductions < 0 || !Number.isFinite(refunds) || refunds < 0) return null;
    items.push({ date: entry.date, amount: entry.amount, currency: entry.currency, note: entry.note, ...(income ? { status, deductions, refunds, ...(typeof entry.reference === "string" ? { reference: entry.reference } : {}) } : {}) });
  }
  return items;
}

function parseItems(value: unknown, version: 0|1|2): LocalExperiment[] | null {
  if (!Array.isArray(value)) return null;
  const result: LocalExperiment[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) || typeof item.title !== "string" || typeof item.startedAt !== "string" || !Number.isFinite(Date.parse(item.startedAt)) || !Array.isArray(item.completedSteps) || item.completedSteps.some((step) => !Number.isSafeInteger(step) || Number(step) < 1) || typeof item.paused !== "boolean" || typeof item.timeMinutes !== "number" || !Number.isFinite(item.timeMinutes) || item.timeMinutes < 0 || !Array.isArray(item.outputs) || item.outputs.some((output) => typeof output !== "string") || typeof item.notes !== "string") return null;
    const type = version < 2 ? "method" : item.type;
    if (type !== "method" && type !== "opportunity") return null;
    const id = version < 2 ? `${type}:${item.slug}` : item.id;
    if (typeof id !== "string" || id !== `${type}:${item.slug}` || result.some((existing) => existing.id === id)) return null;
    const costs = ledger(item.costs); const income = ledger(item.income, true);
    if (!costs || !income) return null;
    const activitiesValue = item.activities ?? [];
    if (!Array.isArray(activitiesValue)) return null;
    const activities: LocalActivity[] = [];
    for (const activity of activitiesValue) {
      if (!isRecord(activity) || typeof activity.date !== "string" || !["application","distribution","rejection","sale","other"].includes(String(activity.kind)) || typeof activity.description !== "string" || typeof activity.outcome !== "string") return null;
      activities.push({ date: activity.date, kind: activity.kind as LocalActivity["kind"], description: activity.description, outcome: activity.outcome });
    }
    result.push({ id, type, slug: item.slug, title: item.title, startedAt: item.startedAt, completedSteps: item.completedSteps as number[], paused: item.paused, timeMinutes: item.timeMinutes, costs, income, activities, outputs: item.outputs as string[], notes: item.notes });
  }
  return result;
}

export const EXPERIMENTS_STORAGE_KEY = "dy-local-experiments";
export function parseLocalExperiments(value: unknown): LocalExperiment[] | null {
  // Version 0 was the original bare array. Normalize it without dropping data.
  if (Array.isArray(value)) return parseItems(value, 0);
  if (!isRecord(value) || ![1,2].includes(Number(value.version))) return null;
  return parseItems(value.experiments, Number(value.version) as 1|2);
}
export function serializeLocalExperiments(experiments: LocalExperiment[]): string {
  return JSON.stringify({ version: 2, experiments });
}
