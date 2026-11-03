import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatStatus, MethodContractError, parseMethodDetail } from "../../frontend/src/lib/method-detail.ts";
import { parseLocalExperiments } from "../../frontend/src/lib/localExperiments.ts";
import { MethodListContractError, parseMethodList } from "../../frontend/src/lib/method-list.ts";

const method = { slug: "test-method", title: "Test method", category: "Test", summary: "A candidate", overview: "A person creates one output.", distribution: "Not yet verified.", income_mechanism: "Not yet verified.", requirements: JSON.stringify({ device: "Phone" }), limitations: "Unverified.", status: "under_validation" };

describe("method detail API contract", () => {
  it("normalizes the API envelope and JSON string fields", () => {
    const parsed = parseMethodDetail({ method, criteria: [{ criterion_code: "phone_and_free_tools", assessment: "not_verified", explanation: "Not checked.", source_ids: "[12]" }], steps: [], tools: [], sources: [] });
    assert.equal(parsed.title, "Test method");
    assert.deepEqual(parsed.requirements, { device: "Phone" });
    assert.deepEqual(parsed.criteria[0].source_ids, [12]);
    assert.deepEqual(parsed.steps, []);
  });
  it("allows empty optional collections and malformed source JSON fails clearly", () => {
    assert.equal(parseMethodDetail({ method, criteria: [], steps: [], tools: [], sources: [] }).criteria.length, 0);
    assert.throws(() => parseMethodDetail({ method, criteria: [{ criterion_code: "x", assessment: "pass", explanation: "text", source_ids: "{" }], steps: [], tools: [], sources: [] }), MethodContractError);
  });
  it("rejects a missing method, malformed required fields, and missing arrays", () => {
    assert.throws(() => parseMethodDetail({}), MethodContractError);
    assert.throws(() => parseMethodDetail({ method: { ...method, title: null }, criteria: [], steps: [], tools: [], sources: [] }), MethodContractError);
    assert.throws(() => parseMethodDetail({ method }), MethodContractError);
  });
  it("rejects non-HTTP external links in source data", () => {
    assert.throws(() => parseMethodDetail({ method, criteria: [], steps: [], tools: [{ name: "Unsafe", purpose: "Test", official_url: "javascript:alert(1)" }], sources: [] }), MethodContractError);
    assert.throws(() => parseMethodDetail({ method, criteria: [], steps: [], tools: [], sources: [{ id: 1, title: "Unsafe", url: "javascript:alert(1)", source_type: "other", supports_claim: "A claim", supports_area: "other" }] }), MethodContractError);
  });
  it("formats enum labels safely", () => assert.equal(formatStatus("under_validation"), "under validation"));
  it("validates browser-local experiment records before rendering", () => {
    const item = { slug: "test-method", title: "Test", startedAt: "2026-11-03T10:00:00.000Z", completedSteps: [1], paused: false, timeMinutes: 15, costs: [{ date: "2026-11-03", amount: 0, currency: "INR", note: "" }], income: [], outputs: ["Worksheet"], notes: "Private note" };
    assert.equal(parseLocalExperiments([item])?.[0].title, "Test");
    assert.equal(parseLocalExperiments([{ ...item, costs: [{ ...item.costs[0], currency: "rupees" }] }]), null);
    assert.equal(parseLocalExperiments({ corrupted: true }), null);
  });
  it("validates the public method library response and rejects malformed rows", () => {
    const row = { id: 1, slug: "test-method", title: "Test method", category: "Test", summary: "Candidate", status: "under_validation", criteria: [] };
    assert.equal(parseMethodList({ methods: [row] })[0].slug, "test-method");
    assert.deepEqual(parseMethodList({ methods: [] }), []);
    assert.throws(() => parseMethodList({ methods: [{ ...row, criteria: undefined }] }), MethodListContractError);
    assert.throws(() => parseMethodList(null), MethodListContractError);
  });
});
