import type { LocalExperiment } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function ledger(value: unknown): LocalExperiment["costs"] | null {
  if (!Array.isArray(value)) return null;
  const items: LocalExperiment["costs"] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.date !== "string" || typeof entry.amount !== "number" || !Number.isFinite(entry.amount) || entry.amount < 0 || typeof entry.currency !== "string" || !/^[A-Z]{3}$/.test(entry.currency) || typeof entry.note !== "string") return null;
    items.push({ date: entry.date, amount: entry.amount, currency: entry.currency, note: entry.note });
  }
  return items;
}
export function parseLocalExperiments(value: unknown): LocalExperiment[] | null {
  if (!Array.isArray(value)) return null;
  const result: LocalExperiment[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) || typeof item.title !== "string" || typeof item.startedAt !== "string" || !Number.isFinite(Date.parse(item.startedAt)) || !Array.isArray(item.completedSteps) || item.completedSteps.some((step) => !Number.isSafeInteger(step) || Number(step) < 1) || typeof item.paused !== "boolean" || typeof item.timeMinutes !== "number" || !Number.isFinite(item.timeMinutes) || item.timeMinutes < 0 || !Array.isArray(item.outputs) || item.outputs.some((output) => typeof output !== "string") || typeof item.notes !== "string") return null;
    if (result.some((existing) => existing.slug === item.slug)) return null;
    const costs = ledger(item.costs); const income = ledger(item.income);
    if (!costs || !income) return null;
    result.push({ slug: item.slug, title: item.title, startedAt: item.startedAt, completedSteps: item.completedSteps as number[], paused: item.paused, timeMinutes: item.timeMinutes, costs, income, outputs: item.outputs as string[], notes: item.notes });
  }
  return result;
}
