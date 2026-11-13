export type Criterion = { criterion_code: string; assessment: string; explanation: string; source_ids: number[] };
export type MethodStep = { step_number: number; title: string; what_to_do: string; how_to_do: string; tool_names: string; output: string; success_looks_like: string; common_problems: string; alternatives: string };
export type MethodTool = { id?: number; name: string; purpose: string; official_url: string | null; free_conditions: string; limitations: string; phone_usable: string; last_verified: string | null };
export type MethodSource = { id: number; title: string; url: string; source_type: string; accessed_at: string | null; last_verified_at: string | null; supports_claim: string; supports_area: string };
export type Method = { id?: number; slug: string; title: string; category: string; summary: string; overview: string; distribution: string; income_mechanism: string; requirements: Record<string, unknown>; limitations: string; status: string; criteria: Criterion[]; steps: MethodStep[]; tools: MethodTool[]; sources: MethodSource[] };
export type MethodDetailResponse = { method: Omit<Method, "criteria" | "steps" | "tools" | "sources">; criteria: unknown[]; steps: unknown[]; tools: unknown[]; sources: unknown[] };
export class MethodContractError extends Error { constructor(message = "The method guide returned incomplete or invalid data. Please try again later.") { super(message); this.name = "MethodContractError"; } }

function record(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.trim() === "") throw new MethodContractError();
  return value;
}
function optionalString(row: Record<string, unknown>, key: string, fallback = ""): string {
  const value = row[key];
  if (value == null) return fallback;
  if (typeof value !== "string") throw new MethodContractError();
  return value;
}
function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { throw new MethodContractError("The method guide contains malformed structured data. Please contact the administrator."); }
}
function requirements(value: unknown): Record<string, unknown> {
  const parsed = jsonValue(value);
  const row = record(parsed);
  if (!row) throw new MethodContractError();
  return row;
}
function sourceIds(value: unknown): number[] {
  const parsed = jsonValue(value ?? []);
  if (!Array.isArray(parsed) || parsed.some((item) => !Number.isSafeInteger(Number(item)) || Number(item) <= 0)) throw new MethodContractError();
  return parsed.map(Number);
}
function list(value: unknown, name: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new MethodContractError(`The method guide is missing its ${name} list. Please try again later.`);
  return value.map((item) => {
    const row = record(item);
    if (!row) throw new MethodContractError();
    return row;
  });
}
function nullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  if (typeof value !== "string") throw new MethodContractError();
  return value;
}
export function safeExternalUrl(value: string | null): string | null {
  if (value === null) return null;
  try { const url = new URL(value); if (url.protocol === "https:" || url.protocol === "http:") return url.toString(); } catch { /* invalid endpoint data is rejected below */ }
  throw new MethodContractError("The method guide contains an invalid external link. Please contact the administrator.");
}

export function parseMethodDetail(value: unknown): Method {
  const payload = record(value);
  const sourceMethod = record(payload?.method);
  if (!payload || !sourceMethod) throw new MethodContractError("The method guide response does not match the expected API format.");
  const method = {
    slug: requiredString(sourceMethod, "slug"), title: requiredString(sourceMethod, "title"), category: requiredString(sourceMethod, "category"),
    summary: requiredString(sourceMethod, "summary"), overview: requiredString(sourceMethod, "overview"), distribution: requiredString(sourceMethod, "distribution"),
    income_mechanism: requiredString(sourceMethod, "income_mechanism"), requirements: requirements(sourceMethod.requirements),
    limitations: requiredString(sourceMethod, "limitations"), status: requiredString(sourceMethod, "status")
  };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(method.slug) || !["draft", "under_validation", "qualified", "rejected", "archived"].includes(method.status)) throw new MethodContractError();
  const criteria = list(payload.criteria, "criteria").map((row) => {
    const criterion_code = requiredString(row, "criterion_code"); const assessment = requiredString(row, "assessment");
    if (!["phone_and_free_tools", "independent_execution", "no_credentials_or_preexisting_trust", "no_meetings_or_sales_calls"].includes(criterion_code) || !["pass", "conditional", "fail", "not_verified"].includes(assessment)) throw new MethodContractError();
    return { criterion_code, assessment, explanation: requiredString(row, "explanation"), source_ids: sourceIds(row.source_ids) };
  });
  const steps = list(payload.steps, "execution steps").map((row) => { const step_number=Number(row.step_number); if(!Number.isSafeInteger(step_number)||step_number<1)throw new MethodContractError();return { step_number, title: requiredString(row, "title"), what_to_do: requiredString(row, "what_to_do"), how_to_do: requiredString(row, "how_to_do"), tool_names: optionalString(row, "tool_names"), output: requiredString(row, "output"), success_looks_like: requiredString(row, "success_looks_like"), common_problems: optionalString(row, "common_problems"), alternatives: optionalString(row, "alternatives") }; });
  const tools = list(payload.tools, "tools").map((row) => { const phone_usable=optionalString(row,"phone_usable","not_verified");if(!["yes","limited","no","not_verified"].includes(phone_usable))throw new MethodContractError();return { id: row.id == null ? undefined : Number(row.id), name: requiredString(row, "name"), purpose: requiredString(row, "purpose"), official_url: safeExternalUrl(nullableString(row, "official_url")), free_conditions: optionalString(row, "free_conditions", "Not verified"), limitations: optionalString(row, "limitations", "Not verified"), phone_usable, last_verified: nullableString(row, "last_verified") }; });
  const sources = list(payload.sources, "sources").map((row) => ({ id: Number.isSafeInteger(Number(row.id)) && Number(row.id) > 0 ? Number(row.id) : (() => { throw new MethodContractError(); })(), title: requiredString(row, "title"), url: safeExternalUrl(requiredString(row, "url"))!, source_type: requiredString(row, "source_type"), accessed_at: nullableString(row, "accessed_at"), last_verified_at: nullableString(row, "last_verified_at"), supports_claim: requiredString(row, "supports_claim"), supports_area: requiredString(row, "supports_area") }));
  return { ...(sourceMethod.id == null ? {} : { id: Number(sourceMethod.id) }), ...method, criteria, steps, tools, sources };
}

export function formatStatus(value: string): string { return value.replaceAll("_", " "); }
