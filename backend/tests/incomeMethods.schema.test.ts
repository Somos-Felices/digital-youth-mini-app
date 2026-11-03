import assert from "node:assert/strict";
import { test } from "node:test";
import { criteriaSchema, evidenceSchema, experimentPatchSchema, experimentSchema, methodCreateSchema, sourceSchema, toolSchema } from "../src/schemas/incomeMethods.schema.js";

const fourCriteria = [
  { code: "phone_and_free_tools", assessment: "pass", explanation: "Evidence checked", sourceIds: [1] },
  { code: "independent_execution", assessment: "pass", explanation: "Evidence checked", sourceIds: [1] },
  { code: "no_credentials_or_preexisting_trust", assessment: "pass", explanation: "Evidence checked", sourceIds: [1] },
  { code: "no_meetings_or_sales_calls", assessment: "pass", explanation: "Evidence checked", sourceIds: [1] }
];

test("income method validation schemas", async (t) => {
  await t.test("accepts a complete four-condition assessment", () => {
    assert.equal(criteriaSchema.safeParse({ criteria: fourCriteria }).success, true);
  });

  await t.test("rejects duplicate or missing qualification criteria", () => {
    assert.equal(criteriaSchema.safeParse({ criteria: [fourCriteria[0], fourCriteria[0], fourCriteria[2], fourCriteria[3]] }).success, false);
    assert.equal(criteriaSchema.safeParse({ criteria: fourCriteria.slice(0, 3) }).success, false);
  });

  await t.test("rejects criteria without an explanation", () => {
    const malformed = fourCriteria.map((criterion) => ({ ...criterion }));
    malformed[0].explanation = " ";
    assert.equal(criteriaSchema.safeParse({ criteria: malformed }).success, false);
  });

  await t.test("validates safe URL slugs and required method content", () => {
    const method = { slug: "sample-method", title: "Sample method", category: "Digital products", summary: "A careful test", overview: "What the person does", distribution: "A self-serve hypothesis", incomeMechanism: "Not yet verified", requirements: { device: "Not verified" }, limitations: "No result is promised" };
    assert.equal(methodCreateSchema.safeParse(method).success, true);
    assert.equal(methodCreateSchema.safeParse({ ...method, slug: "Bad slug" }).success, false);
  });

  await t.test("requires currency alongside actual experiment amounts", () => {
    const base = { methodId: 1, title: "Test", hypothesis: "A testable hypothesis", owner: "Researcher" };
    assert.equal(experimentSchema.safeParse({ ...base, actualIncome: 10 }).success, false);
    assert.equal(experimentSchema.safeParse({ ...base, actualIncome: 10, actualIncomeCurrency: "INR" }).success, true);
    assert.equal(experimentSchema.safeParse({ ...base, actualIncome: 10, actualIncomeCurrency: "usd" }).success, false);
  });

  await t.test("experiment updates accept partial changes without accepting methodId", () => {
    assert.equal(experimentPatchSchema.safeParse({ title: "Edited title" }).success, true);
    assert.equal(experimentPatchSchema.safeParse({ methodId: 1, title: "Edited title" }).success, false);
    assert.equal(experimentPatchSchema.safeParse({ actualIncome: 5 }).success, false);
    assert.equal(experimentPatchSchema.safeParse({ actualIncome: 5, actualIncomeCurrency: "INR" }).success, true);
  });
  await t.test("external evidence and tool links are restricted to HTTP(S)", () => {
    assert.equal(sourceSchema.safeParse({ title: "Safe", url: "https://example.org", supportsClaim: "A checked claim" }).success, true);
    assert.equal(sourceSchema.safeParse({ title: "Unsafe", url: "javascript:alert(1)", supportsClaim: "A checked claim" }).success, false);
    assert.equal(toolSchema.safeParse({ name: "Example", purpose: "Research", officialUrl: "data:text/html,unsafe" }).success, false);
    assert.equal(evidenceSchema.safeParse({ title: "Evidence", url: "javascript:alert(1)", description: "Reviewed" }).success, false);
  });
});
