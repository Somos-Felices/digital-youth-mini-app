export type MethodListItem = { id: number; slug: string; title: string; category: string; summary: string; status: string; criteria: { criterion_code: string; assessment: string }[] };
export class MethodListContractError extends Error { constructor() { super("The method library returned incomplete or invalid data. Please try again later."); this.name = "MethodListContractError"; } }
export function parseMethodList(value: unknown): MethodListItem[] {
  if (typeof value !== "object" || value === null || !("methods" in value) || !Array.isArray(value.methods)) throw new MethodListContractError();
  return value.methods.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw new MethodListContractError();
    const row = entry as Record<string, unknown>;
    const status = typeof row.status === "string" ? row.status : "";
    if (!Number.isSafeInteger(Number(row.id)) || Number(row.id) < 1 || typeof row.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) || typeof row.title !== "string" || !row.title.trim() || typeof row.category !== "string" || !row.category.trim() || typeof row.summary !== "string" || !row.summary.trim() || !["under_validation", "qualified", "rejected"].includes(status) || !Array.isArray(row.criteria)) throw new MethodListContractError();
    const criteria = row.criteria.map((criterion) => {
      if (typeof criterion !== "object" || criterion === null || Array.isArray(criterion)) throw new MethodListContractError();
      const item = criterion as Record<string, unknown>;
      if (typeof item.criterion_code !== "string" || !["phone_and_free_tools", "independent_execution", "no_credentials_or_preexisting_trust", "no_meetings_or_sales_calls"].includes(item.criterion_code) || typeof item.assessment !== "string" || !["pass", "conditional", "fail", "not_verified"].includes(item.assessment)) throw new MethodListContractError();
      return { criterion_code: item.criterion_code, assessment: item.assessment };
    });
    return { id: Number(row.id), slug: row.slug, title: row.title, category: row.category, summary: row.summary, status, criteria };
  });
}
