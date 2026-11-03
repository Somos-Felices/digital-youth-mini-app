import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { resolve } from "node:path";
import { config } from "dotenv";
import argon2 from "argon2";

import type { Express } from "express";
import type { Pool } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

import request from "supertest";

// Load the isolated test environment before importing application modules.
const testEnv = config({
  path: resolve(process.cwd(), ".env.test"),
  override: true
});

let app: Express;
let pool: Pool | null = null;
let adminAgent: ReturnType<typeof request.agent>;
let adminCsrfToken = "";
let testAdminId = 0;

const TEST_ADMIN_EMAIL = "integration-admin@digital-youth.test";
const TEST_ADMIN_PASSWORD = "Integration-Test-Admin-Password-2026!";

async function clearTestData(): Promise<void> {
  if (!pool) {
    throw new Error("Test database pool is not initialized.");
  }

  const [databaseRows] = await pool.query<RowDataPacket[]>(
    "SELECT DATABASE() AS database_name"
  );

  const databaseName = databaseRows[0]?.database_name;

  // Never execute cleanup unless the exact test database is selected.
  if (databaseName !== "digital_youth_mini_app_test") {
    throw new Error(
      `Unsafe test cleanup blocked. Connected database: ${databaseName}`
    );
  }

  await pool.execute(
    "DELETE FROM business_diagnostic_status_history"
  );

  await pool.execute(
    "DELETE FROM business_diagnostic_submissions"
  );
}

const validPayload = {
  pilotLocation: "Bengaluru - AUTOMATED TEST",
  participantName: "Integration Test Participant",
  businessName: "Integration Test Cafe",
  businessType: "Food and Beverage",
  currentTools: ["whatsapp", "paper_records"],
  biggestOperationalPain:
    "Difficulty tracking customer orders and maintaining daily records.",
  painFrequency: "weekly",
  willingnessToPay: "maybe",
  budgetAmount: null,
  budgetCurrency: null,
  followUpConsent: false
};

async function createSubmission(): Promise<number> {
  const response = await request(app)
    .post("/api/diagnostic-submissions")
    .send(validPayload);

  assert.equal(response.status, 201);

  return Number(response.body.submission.id);
}

before(async () => {
  if (testEnv.error) {
    throw new Error(
      `Unable to load .env.test: ${testEnv.error.message}`
    );
  }

  if (
    process.env.NODE_ENV !== "test" ||
    process.env.DB_NAME !== "digital_youth_mini_app_test"
  ) {
    throw new Error(
      "Integration tests require digital_youth_mini_app_test."
    );
  }

  // Dynamic imports ensure environment variables are loaded first.
  const [application, database] = await Promise.all([
    import("../../src/app.js"),
    import("../../src/config/database.js")
  ]);

  app = application.createApp();
  pool = database.pool;

  await database.verifyDatabaseConnection();
  await clearTestData();

  // Create a dedicated administrator in the isolated test database only.
  const passwordHash = await argon2.hash(TEST_ADMIN_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });

  await pool!.execute(
    `
      INSERT INTO admin_users (email, display_name, password_hash, is_active)
      VALUES (?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        display_name = VALUES(display_name),
        password_hash = VALUES(password_hash),
        is_active = 1
    `,
    [TEST_ADMIN_EMAIL, "Integration Test Admin", passwordHash]
  );

  const [adminRows] = await pool!.execute<RowDataPacket[]>(
    "SELECT id FROM admin_users WHERE email = ? LIMIT 1",
    [TEST_ADMIN_EMAIL]
  );

  assert.equal(adminRows.length, 1);
  testAdminId = Number(adminRows[0].id);

  await pool!.execute(
    "DELETE FROM admin_sessions WHERE admin_user_id = ?",
    [testAdminId]
  );

  adminAgent = request.agent(app);

  const loginResponse = await adminAgent
    .post("/api/auth/login")
    .send({
      email: TEST_ADMIN_EMAIL,
      password: TEST_ADMIN_PASSWORD
    });

  assert.equal(
    loginResponse.status,
    200,
    `Test admin login failed: ${JSON.stringify(loginResponse.body)}`
  );

  adminCsrfToken = loginResponse.body.csrfToken;
  assert.ok(typeof adminCsrfToken === "string" && adminCsrfToken.length > 0);

  console.log("Connected to isolated MySQL integration database.");
});

beforeEach(async () => {
  await clearTestData();
});

after(async () => {
  if (pool) {
    try {
      await clearTestData();
      if (testAdminId > 0) {
        await pool.execute("DELETE FROM admin_sessions WHERE admin_user_id = ?", [testAdminId]);
        await pool.execute("DELETE FROM admin_users WHERE id = ?", [testAdminId]);
      }
    } finally {
      await pool.end();
    }
  }
});

// Test 1: Actual HTTP submission and MySQL persistence.
test("creates a submission and initial audit record", async () => {
  const response = await request(app)
    .post("/api/diagnostic-submissions")
    .send({
      ...validPayload,
      contactName: "Must Not Be Stored",
      contactMethod: "whatsapp",
      contactValue: "9000000000"
    });

  assert.equal(response.status, 201);

  const submissionId = Number(response.body.submission.id);

  const [rows] = await pool!.execute<RowDataPacket[]>(
    `
      SELECT *
      FROM business_diagnostic_submissions
      WHERE id = ?
    `,
    [submissionId]
  );

  assert.equal(rows.length, 1);

  const row = rows[0];

  assert.equal(row.business_name, validPayload.businessName);
  assert.equal(row.pilot_location, validPayload.pilotLocation);
  assert.equal(row.submission_status, "new");
  assert.equal(row.follow_up_consent, 0);
  assert.equal(row.contact_name, null);
  assert.equal(row.contact_method, null);
  assert.equal(row.contact_value, null);

  const storedTools =
    typeof row.current_tools === "string"
      ? JSON.parse(row.current_tools)
      : row.current_tools;

  assert.deepEqual(storedTools, validPayload.currentTools);

  const [history] = await pool!.execute<RowDataPacket[]>(
    `
      SELECT *
      FROM business_diagnostic_status_history
      WHERE submission_id = ?
    `,
    [submissionId]
  );

  assert.equal(history.length, 1);
  assert.equal(history[0].previous_status, null);
  assert.equal(history[0].new_status, "new");
  assert.equal(history[0].changed_by, "system");
});

// Test 2: Admin can list and retrieve real MySQL records.
test("admin can list and retrieve submissions", async () => {
  const submissionId = await createSubmission();

  const listResponse = await adminAgent
    .get("/api/admin/submissions");

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.pagination.total, 1);
  assert.equal(listResponse.body.submissions[0].id, submissionId);

  const detailResponse = await adminAgent
    .get(`/api/admin/submissions/${submissionId}`);

  assert.equal(detailResponse.status, 200);

  assert.equal(
    detailResponse.body.submission.business_name,
    validPayload.businessName
  );
});

// Test 3: Status updates and audit entries are saved together.
test("status transition creates an audit history entry", async () => {
  const submissionId = await createSubmission();

  const response = await adminAgent
    .patch(`/api/admin/submissions/${submissionId}/status`)
    .set("x-csrf-token", adminCsrfToken)
    .send({
      status: "reviewed",
      changeReason: "Integration test status transition."
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.historyRecorded, true);

  const [submissionRows] = await pool!.execute<RowDataPacket[]>(
    `
      SELECT submission_status
      FROM business_diagnostic_submissions
      WHERE id = ?
    `,
    [submissionId]
  );

  assert.equal(submissionRows[0].submission_status, "reviewed");

  const [history] = await pool!.execute<RowDataPacket[]>(
    `
      SELECT previous_status, new_status, changed_by, change_reason
      FROM business_diagnostic_status_history
      WHERE submission_id = ?
      ORDER BY id
    `,
    [submissionId]
  );

  assert.equal(history.length, 2);
  assert.equal(history[1].previous_status, "new");
  assert.equal(history[1].new_status, "reviewed");
  assert.equal(history[1].changed_by, `admin:${testAdminId}`);
  assert.equal(
    history[1].change_reason,
    "Integration test status transition."
  );
});

// Test 4: Identical status updates do not create duplicate audit entries.
test("duplicate status update does not create audit history", async () => {
  const submissionId = await createSubmission();

  const response = await adminAgent
    .patch(`/api/admin/submissions/${submissionId}/status`)
    .set("x-csrf-token", adminCsrfToken)
    .send({
      status: "new",
      changeReason: "This should not create history."
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.historyRecorded, false);

  const [history] = await pool!.execute<RowDataPacket[]>(
    `
      SELECT id
      FROM business_diagnostic_status_history
      WHERE submission_id = ?
    `,
    [submissionId]
  );

  assert.equal(history.length, 1);
});

// Test 5: Invalid requests never reach MySQL insertion.
test("invalid submission does not create a database record", async () => {
  const { participantName, ...invalidPayload } = validPayload;

  const response = await request(app)
    .post("/api/diagnostic-submissions")
    .send(invalidPayload);

  assert.equal(response.status, 400);

  const [rows] = await pool!.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS total FROM business_diagnostic_submissions"
  );

  assert.equal(Number(rows[0].total), 0);
});

// Test 6: Protected admin endpoints reject missing credentials.
test("admin endpoint rejects unauthenticated requests", async () => {
  const response = await request(app)
    .get("/api/admin/submissions");

  assert.equal(response.status, 401);
});

// Test 7: Protected admin endpoints reject invalid credentials.
test("admin endpoint rejects invalid credentials", async () => {
  const response = await request(app)
    .get("/api/admin/submissions")
    .set("Authorization", "Bearer invalid-test-token");

  assert.equal(response.status, 401);
});

// Test 8: Contact information is saved when consent is granted.
test("stores contact information with explicit follow-up consent", async () => {
  const response = await request(app)
    .post("/api/diagnostic-submissions")
    .send({
      ...validPayload,
      followUpConsent: true,
      contactName: "Test Contact",
      contactMethod: "whatsapp",
      contactValue: "9000000000"
    });

  assert.equal(response.status, 201);

  const submissionId = Number(response.body.submission.id);

  const [rows] = await pool!.execute<RowDataPacket[]>(
    `
      SELECT
        follow_up_consent,
        contact_name,
        contact_method,
        contact_value
      FROM business_diagnostic_submissions
      WHERE id = ?
    `,
    [submissionId]
  );

  assert.equal(rows[0].follow_up_consent, 1);
  assert.equal(rows[0].contact_name, "Test Contact");
  assert.equal(rows[0].contact_method, "whatsapp");
  assert.equal(rows[0].contact_value, "9000000000");
});

// Test 9: Admin can retrieve the status history endpoint.
test("admin can retrieve submission status history", async () => {
  const submissionId = await createSubmission();

  const response = await adminAgent
    .get(`/api/admin/submissions/${submissionId}/history`);

  assert.equal(response.status, 200);
  assert.equal(response.body.submissionId, submissionId);
  assert.equal(response.body.pagination.total, 1);

  assert.equal(response.body.history[0].previous_status, null);
  assert.equal(response.body.history[0].new_status, "new");
});

// Session and CSRF security tests.
test("admin session authenticates the seeded administrator", async () => {
  const response = await adminAgent.get("/api/auth/me");
  assert.equal(response.status, 200);
  assert.equal(response.body.authenticated, true);
  assert.equal(response.body.admin.id, testAdminId);
});

test("status update rejects a missing CSRF token", async () => {
  const submissionId = await createSubmission();

  const response = await adminAgent
    .patch(`/api/admin/submissions/\x24{submissionId}/status`)
    .send({ status: "reviewed" });

  assert.equal(response.status, 403);
});

test("admin login rejects an incorrect password", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({
      email: TEST_ADMIN_EMAIL,
      password: "Wrong-Password-For-Test-2026!"
    });

  assert.equal(response.status, 401);
});

// Test 10: Submission is rolled back if audit insertion fails.
test("rolls back submission when initial audit insertion fails", async () => {
  const previousFlag = process.env.TEST_FAIL_INITIAL_AUDIT_INSERT;

  process.env.TEST_FAIL_INITIAL_AUDIT_INSERT = "true";

  try {
    const response = await request(app)
      .post("/api/diagnostic-submissions")
      .send(validPayload);

    assert.equal(response.status, 500);
    assert.equal(response.body.error, "Internal server error");

    // The submission INSERT must have been rolled back too.
    const [rows] = await pool!.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM business_diagnostic_submissions"
    );

    assert.equal(Number(rows[0].total), 0);

    const [history] = await pool!.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM business_diagnostic_status_history"
    );

    assert.equal(Number(history[0].total), 0);
  } finally {
    if (previousFlag === undefined) {
      delete process.env.TEST_FAIL_INITIAL_AUDIT_INSERT;
    } else {
      process.env.TEST_FAIL_INITIAL_AUDIT_INSERT = previousFlag;
    }
  }
});

test("CSRF endpoint rotates the token", async () => {
  const previousToken = adminCsrfToken;

  const response = await adminAgent.get("/api/auth/csrf");

  assert.equal(response.status, 200);
  assert.ok(typeof response.body.csrfToken === "string");
  assert.notEqual(response.body.csrfToken, previousToken);

  adminCsrfToken = response.body.csrfToken;
});


test("API health endpoint reports service status", async () => {
  const response = await request(app).get("/api/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
});

test("database health endpoint confirms MySQL connectivity", async () => {
  const response = await request(app).get("/api/health/db");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.database, "connected");
});

test("CORS rejects an untrusted browser origin", async () => {
  const response = await request(app)
    .get("/api/health")
    .set("Origin", "https://attacker.example");

  assert.equal(response.status, 403);
});

test("login rejects an untrusted browser origin", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .set("Origin", "https://attacker.example")
    .send({
      email: TEST_ADMIN_EMAIL,
      password: TEST_ADMIN_PASSWORD
    });

  assert.equal(response.status, 403);
});

test("admin listing rejects invalid pagination", async () => {
  const response = await adminAgent
    .get("/api/admin/submissions?page=0");

  assert.equal(response.status, 400);
});

test("admin detail endpoint rejects invalid submission IDs", async () => {
  const response = await adminAgent
    .get("/api/admin/submissions/not-a-number");

  assert.equal(response.status, 400);
});
test("logout revokes the administrator session", async () => {
  const logoutResponse = await adminAgent
    .post("/api/auth/logout")
    .set("x-csrf-token", adminCsrfToken);

  assert.equal(logoutResponse.status, 200);

  const sessionResponse = await adminAgent.get("/api/auth/me");

  assert.equal(sessionResponse.status, 401);
});
