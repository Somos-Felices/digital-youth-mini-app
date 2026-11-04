import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  diagnosticSubmissionSchema
} from "../src/schemas/diagnosticSubmission.schema.js";

const validSubmission = {
  pilotLocation: "Bengaluru",
  participantName: "Test Participant",
  businessName: "Demo Business",
  businessType: "Retail",
  currentTools: ["whatsapp"],
  problemAreas: ["bookings", "tourist_replies"],
  biggestOperationalPain:
    "Difficulty tracking customer orders and daily records.",
  painFrequency: "weekly",
  willingnessToPay: "maybe",
  budgetAmount: null,
  budgetCurrency: null,
  followUpConsent: false
};

describe("Diagnostic submission validation", () => {
  it("accepts a valid submission", () => {
    const result = diagnosticSubmissionSchema.safeParse(validSubmission);
    assert.equal(result.success, true);
  });

  it("rejects a missing participant name", () => {
    const { participantName, ...payload } = validSubmission;

    const result = diagnosticSubmissionSchema.safeParse(payload);

    assert.equal(result.success, false);
  });

  it("rejects duplicate current tools", () => {
    const result = diagnosticSubmissionSchema.safeParse({
      ...validSubmission,
      currentTools: ["whatsapp", "whatsapp"]
    });

    assert.equal(result.success, false);
  });

  it("rejects none combined with another tool", () => {
    const result = diagnosticSubmissionSchema.safeParse({
      ...validSubmission,
      currentTools: ["none", "whatsapp"]
    });

    assert.equal(result.success, false);
  });

  it("rejects an invalid pain frequency", () => {
    const result = diagnosticSubmissionSchema.safeParse({
      ...validSubmission,
      painFrequency: "hourly"
    });

    assert.equal(result.success, false);
  });

  it("rejects consent without contact details", () => {
    const result = diagnosticSubmissionSchema.safeParse({
      ...validSubmission,
      followUpConsent: true
    });

    assert.equal(result.success, false);
  });

  it("accepts consent with contact details", () => {
    const result = diagnosticSubmissionSchema.safeParse({
      ...validSubmission,
      followUpConsent: true,
      contactName: "Test Contact",
      contactMethod: "whatsapp",
      contactValue: "9000000000"
    });

    assert.equal(result.success, true);
  });

  it("rejects a budget amount without currency", () => {
    const result = diagnosticSubmissionSchema.safeParse({
      ...validSubmission,
      budgetAmount: 500
    });

    assert.equal(result.success, false);
  });

  it("rejects currency without a budget amount", () => {
    const result = diagnosticSubmissionSchema.safeParse({
      ...validSubmission,
      budgetCurrency: "INR"
    });

    assert.equal(result.success, false);
  });

  it("defaults follow-up consent to false", () => {
    const payload = { ...validSubmission };
    delete (payload as Record<string, unknown>).followUpConsent;

    const result = diagnosticSubmissionSchema.safeParse(payload);

    assert.equal(result.success, true);

    if (result.success) {
      assert.equal(result.data.followUpConsent, false);
    }
  });
});

