import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { config } from "dotenv";
import request from "supertest";
import type { Express } from "express";
import type { Pool, RowDataPacket } from "mysql2/promise";

config({ path: resolve(process.cwd(), ".env.test"), override: true });
if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== "digital_youth_mini_app_test") {
  throw new Error("Field visit integration tests require digital_youth_mini_app_test.");
}

const withoutConsentUuid = randomUUID();
const withConsentUuid = randomUUID();
let app: Express;
let pool: Pool;

const payload = {
  submissionUuid: withoutConsentUuid,
  businessName: "E2E Test Cafe",
  businessType: "food_beverage",
  businessTypeOther: null,
  currentTools: ["whatsapp", "paper_pen"],
  toolsOther: null,
  biggestOperationalPain: "Difficulty responding to customer questions and maintaining daily records.",
  problemAreas: ["tourist_replies", "bookings"],
  contactName: null,
  whatsappNumber: null,
  followUpConsent: false
};

before(async () => {
  const [application, database] = await Promise.all([
    import("../../src/app.js"),
    import("../../src/config/database.js")
  ]);
  app = application.createApp();
  pool = database.pool;
  const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS database_name");
  assert.equal(rows[0]?.database_name, "digital_youth_mini_app_test");
});

after(async () => {
  if (!pool) return;
  const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS database_name");
  if (rows[0]?.database_name !== "digital_youth_mini_app_test") throw new Error("Refusing integration cleanup outside the isolated test database.");
  await pool.execute("DELETE FROM field_visit_diagnostic_submissions WHERE submission_uuid IN (?, ?)", [withoutConsentUuid, withConsentUuid]);
  await pool.end();
});

test("receives and idempotently stores the exact five-step diagnostic", async () => {
  const first = await request(app).post("/api/v2/field-visit-diagnostics").send(payload);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.deepEqual(first.body.submission, { submissionUuid: withoutConsentUuid, status: "received", duplicate: false });

  const duplicate = await request(app).post("/api/v2/field-visit-diagnostics").send(payload);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.submission.duplicate, true);

  const conflict = await request(app).post("/api/v2/field-visit-diagnostics").send({ ...payload, biggestOperationalPain: "Changed answers under a used idempotency key." });
  assert.equal(conflict.status, 409);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT submission_uuid, payload_hash, business_name, business_type, current_tools,
      biggest_operational_pain, problem_areas, contact_name, whatsapp_number,
      follow_up_consent, created_at
     FROM field_visit_diagnostic_submissions WHERE submission_uuid = ?`,
    [withoutConsentUuid]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].business_name, "E2E Test Cafe");
  assert.equal(rows[0].business_type, "food_beverage");
  const storedTools = typeof rows[0].current_tools === "string" ? JSON.parse(rows[0].current_tools) : rows[0].current_tools;
  assert.deepEqual(storedTools, ["whatsapp", "paper_pen"]);
  assert.equal(rows[0].biggest_operational_pain, payload.biggestOperationalPain);
  const storedProblemAreas = typeof rows[0].problem_areas === "string" ? JSON.parse(rows[0].problem_areas) : rows[0].problem_areas;
  assert.deepEqual(storedProblemAreas, payload.problemAreas);
  assert.equal(rows[0].follow_up_consent, 0);
  assert.equal(rows[0].contact_name, null);
  assert.equal(rows[0].whatsapp_number, null);
  assert.ok(rows[0].submission_uuid && rows[0].created_at && rows[0].payload_hash);
});

test("stores WhatsApp details only with explicit consent and rejects invalid privacy combinations", async () => {
  const unconsented = await request(app).post("/api/v2/field-visit-diagnostics").send({ ...payload, submissionUuid: randomUUID(), contactName: "Ayu", whatsappNumber: "+62 812 3456 7890" });
  assert.equal(unconsented.status, 400);

  const consentedPayload = { ...payload, submissionUuid: withConsentUuid, contactName: "Ayu", whatsappNumber: "+62 812 3456 7890", followUpConsent: true };
  const response = await request(app).post("/api/v2/field-visit-diagnostics").send(consentedPayload);
  assert.equal(response.status, 201, JSON.stringify(response.body));

  const [rows] = await pool.execute<RowDataPacket[]>("SELECT contact_name, whatsapp_number, follow_up_consent FROM field_visit_diagnostic_submissions WHERE submission_uuid = ?", [withConsentUuid]);
  assert.equal(rows[0]?.contact_name, "Ayu");
  assert.equal(rows[0]?.whatsapp_number, "+62 812 3456 7890");
  assert.equal(rows[0]?.follow_up_consent, 1);
});
