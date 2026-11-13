import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldVisitDiagnosticSchema } from "../src/schemas/fieldVisitDiagnostic.schema.js";

const valid = {
  submissionUuid: "e27b22df-4a9d-44e1-9e61-f7e20a2c4834",
  businessName: "Warung Contoh",
  businessType: "food_beverage",
  businessTypeOther: null,
  currentTools: ["whatsapp", "paper_pen"],
  toolsOther: null,
  biggestOperationalPain: "Pelanggan sering menunggu jawaban terlalu lama.",
  problemAreas: ["tourist_replies", "bookings"],
  contactName: null,
  whatsappNumber: null,
  followUpConsent: false
} as const;

test("accepts the exact five-step field visit payload", () => {
  assert.equal(fieldVisitDiagnosticSchema.safeParse(valid).success, true);
});

test("requires a description when Other business type is selected", () => {
  const parsed = fieldVisitDiagnosticSchema.safeParse({ ...valid, businessType: "other" });
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.ok(parsed.error.issues.some((issue) => issue.path[0] === "businessTypeOther"));
});

test("requires a description when Other tool is selected", () => {
  const parsed = fieldVisitDiagnosticSchema.safeParse({ ...valid, currentTools: ["other"] });
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.ok(parsed.error.issues.some((issue) => issue.path[0] === "toolsOther"));
});

test("rejects Nothing combined with another tool", () => {
  assert.equal(fieldVisitDiagnosticSchema.safeParse({ ...valid, currentTools: ["nothing", "whatsapp"] }).success, false);
});

test("rejects contact fields without consent and consent without a WhatsApp number", () => {
  assert.equal(fieldVisitDiagnosticSchema.safeParse({ ...valid, contactName: "Ayu" }).success, false);
  assert.equal(fieldVisitDiagnosticSchema.safeParse({ ...valid, followUpConsent: true }).success, false);
});

test("accepts and normalizes WhatsApp contact only with consent", () => {
  const parsed = fieldVisitDiagnosticSchema.safeParse({ ...valid, contactName: " Ayu ", whatsappNumber: " +62 812 3456 7890 ", followUpConsent: true });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.contactName, "Ayu");
    assert.equal(parsed.data.whatsappNumber, "+62 812 3456 7890");
  }
});

test("rejects legacy or unexpected payload keys instead of silently accepting them", () => {
  assert.equal(fieldVisitDiagnosticSchema.safeParse({ ...valid, pilotLocation: "Nusa Lembongan" }).success, false);
});
