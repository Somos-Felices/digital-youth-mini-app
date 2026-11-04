export type QualificationCriterion = {
  criterion_code: string;
  assessment: string;
  explanation: string;
  source_ids: unknown;
};

export const opportunityCriterionCodes = [
  "phone_free_tools",
  "independent",
  "no_credentials",
  "no_meetings"
] as const;

export function qualificationBlockReason(
  criteria: QualificationCriterion[],
  validSourceIds: ReadonlySet<number>
): string | null {
  const codes = new Set(criteria.map((criterion) => criterion.criterion_code));
  if (
    criteria.length !== opportunityCriterionCodes.length ||
    opportunityCriterionCodes.some((code) => !codes.has(code))
  ) return "Cannot qualify: exactly four unique assessments are required";

  for (const criterion of criteria) {
    if (criterion.assessment !== "pass" || criterion.explanation.trim().length < 10) {
      return "Cannot qualify: all four criteria must pass with meaningful explanations";
    }
    const ids = Array.isArray(criterion.source_ids)
      ? criterion.source_ids.map(Number)
      : [];
    if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || !validSourceIds.has(id))) {
      return "Cannot qualify: every criterion needs approved, current evidence from this opportunity";
    }
  }

  return null;
}
