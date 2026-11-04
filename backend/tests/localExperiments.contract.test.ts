import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLocalExperiments, serializeLocalExperiments } from "../../frontend/src/lib/localExperiments.ts";

const original = { slug: "downloadable-resource", title: "Downloadable resource", startedAt: "2026-11-03T10:00:00.000Z", completedSteps: [1], paused: false, timeMinutes: 30, costs: [{ date: "2026-11-03", amount: 2, currency: "USD", note: "Data" }], income: [{ date: "2026-11-03", amount: 12, currency: "USD", note: "Sale" }], outputs: ["Worksheet"], notes: "Private" };

describe("versioned local experiment storage", () => {
  it("migrates the old unversioned shape and preserves legacy income as received", () => {
    const parsed = parseLocalExperiments([original]);
    assert.ok(parsed);
    assert.equal(parsed[0].income[0].status, "received");
    assert.equal(parsed[0].income[0].amount, 12);
    assert.equal(parsed[0].notes, "Private");
  });

  it("migrates v1 pending and received payment states into v2 separately", () => {
    const value = [{ ...original, income: [
      { date: "2026-11-03", amount: 12, currency: "USD", note: "Sale", status: "pending", deductions: 1, refunds: 0, reference: "platform" },
      { date: "2026-11-03", amount: 7, currency: "INR", note: "Paid", status: "received", deductions: 0.5, refunds: 1, reference: "transfer" }
    ] }];
    const migrated = parseLocalExperiments({ version: 1, experiments: value });
    assert.ok(migrated);
    const serialized = serializeLocalExperiments(migrated);
    assert.equal(JSON.parse(serialized).version, 2);
    const parsed = parseLocalExperiments(JSON.parse(serialized));
    assert.ok(parsed);
    assert.equal(parsed[0].income[0].status, "pending");
    assert.equal(parsed[0].income[1].status, "received");
    assert.equal(parsed[0].income[1].deductions, 0.5);
    assert.equal(parsed[0].income[1].refunds, 1);
  });

  it("preserves a method and opportunity with the same slug as distinct records", () => {
    const v1 = parseLocalExperiments({ version: 1, experiments: [original] });
    assert.ok(v1);
    const combined = [...v1, { ...v1[0], id: "opportunity:downloadable-resource", type: "opportunity" as const, title: "Opportunity record" }];
    const parsed = parseLocalExperiments(JSON.parse(serializeLocalExperiments(combined)));
    assert.deepEqual(parsed?.map(x => x.id), ["method:downloadable-resource", "opportunity:downloadable-resource"]);
    assert.equal(parsed?.[0].notes, "Private");
    assert.equal(parsed?.[1].title, "Opportunity record");
  });

  it("rejects corrupt, unknown-version and invalid-currency data safely", () => {
    assert.equal(parseLocalExperiments({ version: 99, experiments: [] }), null);
    assert.equal(parseLocalExperiments([{ ...original, costs: [{ ...original.costs[0], currency: "US" }] }]), null);
    assert.equal(parseLocalExperiments({ version: 1, experiments: "not-an-array" }), null);
  });
});
