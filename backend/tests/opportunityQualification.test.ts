import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { opportunityCriterionCodes, qualificationBlockReason } from "../src/services/opportunityQualification.js";

const valid = opportunityCriterionCodes.map(criterion_code => ({
  criterion_code,
  assessment: "pass",
  explanation: `Verified ${criterion_code} requirement with evidence.`,
  source_ids: [11]
}));

describe("opportunity qualification gate", () => {
  it("accepts exactly four passing criteria tied to valid evidence", () => {
    assert.equal(qualificationBlockReason(valid, new Set([11])), null);
  });
  it("rejects missing, extra or duplicate criterion codes", () => {
    assert.match(qualificationBlockReason(valid.slice(1), new Set([11])) ?? "", /exactly four/);
    assert.match(qualificationBlockReason([...valid, valid[0]], new Set([11])) ?? "", /exactly four/);
    assert.match(qualificationBlockReason(valid.map((c,i)=>i===1?{...c,criterion_code:valid[0].criterion_code}:c), new Set([11])) ?? "", /exactly four/);
  });
  it("rejects non-passing assessments and explanations without substance", () => {
    assert.match(qualificationBlockReason(valid.map((c,i)=>i===0?{...c,assessment:"conditional"}:c), new Set([11])) ?? "", /must pass/);
    assert.match(qualificationBlockReason(valid.map((c,i)=>i===0?{...c,explanation:"unknown"}:c), new Set([11])) ?? "", /must pass/);
  });
  it("rejects missing or cross-opportunity evidence references", () => {
    assert.match(qualificationBlockReason(valid.map((c,i)=>i===0?{...c,source_ids:[]}:c), new Set([11])) ?? "", /evidence/);
    assert.match(qualificationBlockReason(valid, new Set([99])) ?? "", /evidence/);
  });
});
