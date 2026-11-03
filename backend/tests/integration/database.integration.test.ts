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

  await pool.execute(`DELETE ev FROM method_experiment_evidence ev
    INNER JOIN method_validation_experiments e ON e.id = ev.experiment_id
    INNER JOIN income_methods m ON m.id = e.method_id
    WHERE m.slug LIKE 'integration-%' OR m.slug IN ('candidate-private','qualification-gate','experiment-currency')`);
  await pool.execute(`DELETE e FROM method_validation_experiments e
    INNER JOIN income_methods m ON m.id = e.method_id
    WHERE m.slug LIKE 'integration-%' OR m.slug IN ('candidate-private','qualification-gate','experiment-currency')`);
  await pool.execute("DELETE FROM income_method_sources WHERE method_id IN (SELECT id FROM income_methods WHERE slug LIKE 'integration-%' OR slug IN ('candidate-private','qualification-gate','experiment-currency'))");
  await pool.execute("DELETE FROM income_method_tools WHERE method_id IN (SELECT id FROM income_methods WHERE slug LIKE 'integration-%' OR slug IN ('candidate-private','qualification-gate','experiment-currency'))");
  await pool.execute("DELETE FROM income_method_steps WHERE method_id IN (SELECT id FROM income_methods WHERE slug LIKE 'integration-%' OR slug IN ('candidate-private','qualification-gate','experiment-currency'))");
  await pool.execute("DELETE FROM income_method_criteria WHERE method_id IN (SELECT id FROM income_methods WHERE slug LIKE 'integration-%' OR slug IN ('candidate-private','qualification-gate','experiment-currency'))");
  await pool.execute("DELETE FROM income_methods WHERE slug LIKE 'integration-%' OR slug IN ('candidate-private','qualification-gate','experiment-currency')");

  await pool.execute(`DELETE h FROM business_diagnostic_status_history h
    INNER JOIN business_diagnostic_submissions s ON s.id = h.submission_id
    WHERE s.pilot_location = ?`, [validPayload.pilotLocation]);
  await pool.execute(
    "DELETE FROM business_diagnostic_submissions WHERE pilot_location = ?",
    [validPayload.pilotLocation]
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

async function createMethod(slug = "integration-method") {
  return adminAgent.post("/api/admin/methods")
    .set("x-csrf-token", adminCsrfToken)
    .send({
      slug,
      title: "Integration method candidate",
      category: "Digital products",
      summary: "A clearly disclosed validation test.",
      overview: "Create one useful test output independently.",
      distribution: "Distribution route has not been verified.",
      incomeMechanism: "No income is claimed.",
      requirements: { device: "Not verified" },
      limitations: "This test has no earnings evidence."
    });
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
  assert.equal(listResponse.body.submissions.some((submission: { id: number }) => submission.id === submissionId), true);

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
    "SELECT COUNT(*) AS total FROM business_diagnostic_submissions WHERE pilot_location = ?",
    [validPayload.pilotLocation]
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

test("income method records remain private until explicitly disclosed", async () => {
  const created = await createMethod("integration-candidate-private");
  assert.equal(created.status, 201);
  const privateListing = await request(app).get("/api/methods");
  assert.equal(privateListing.status, 200);
  assert.equal(privateListing.body.methods.some((m: { slug: string }) => m.slug === "integration-candidate-private"), false);

  const status = await adminAgent.patch(`/api/admin/methods/${created.body.method.id}/status`)
    .set("x-csrf-token", adminCsrfToken)
    .send({ status: "under_validation", published: true });
  assert.equal(status.status, 200);
  const publicListing = await request(app).get("/api/methods?status=under_validation");
  assert.equal(publicListing.body.methods.some((m: { slug: string }) => m.slug === "integration-candidate-private"), true);
  const detail = await request(app).get("/api/methods/integration-candidate-private");
  assert.equal(detail.status, 200);
  assert.equal(detail.body.method.created_by, undefined);
  assert.equal(detail.body.criteria.length, 4);
  assert.equal(detail.body.criteria.every((c: { assessment: string }) => c.assessment === "not_verified"), true);
});

test("public method detail uses an envelope and exposes no draft or admin fields", async () => {
  for (const slug of ["phone-made-educational-content", "downloadable-practical-resource", "reusable-digital-workflow-kit"]) {
    const response = await request(app).get(`/api/methods/${slug}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.method.slug, slug);
    assert.equal(response.body.method.status, "under_validation");
    assert.equal(response.body.method.created_by, undefined);
    assert.equal(response.body.criteria.length, 4);
    assert.ok(response.body.criteria.every((criterion: { assessment: string }) => criterion.assessment === "not_verified"));
    for (const key of ["criteria", "steps", "tools", "sources"]) assert.ok(Array.isArray(response.body[key]));
    assert.match(response.headers["cache-control"], /max-age=5/);
  }
  const unknown = await request(app).get("/api/methods/no-such-method");
  assert.equal(unknown.status, 404);
});

test("method research save rolls back all content and evidence writes together", async () => {
  const created = await createMethod("integration-atomic-research");
  const id = created.body.method.id as number;
  const criteria = ["phone_and_free_tools", "independent_execution", "no_credentials_or_preexisting_trust", "no_meetings_or_sales_calls"]
    .map((code) => ({ code, assessment: "not_verified", explanation: "Not researched yet.", sourceIds: [] }));
  const before = await adminAgent.get(`/api/admin/methods/${id}`);
  const failed = await adminAgent.put(`/api/admin/methods/${id}/research`).set("x-csrf-token", adminCsrfToken).send({
    method: { slug: "integration-atomic-research-edited", title: "Changed title", category: "Test", summary: "Changed summary", overview: "Overview", distribution: "Distribution", incomeMechanism: "Income", requirements: { device: "Phone" }, limitations: "Limits" },
    criteria: { criteria }, steps: [], tools: [], sources: [
      { title: "Duplicate source", url: "https://example.org/one", sourceType: "other", supportsClaim: "Claim one", supportsArea: "other", approved: false },
      { title: "Duplicate source", url: "https://example.org/two", sourceType: "other", supportsClaim: "Claim two", supportsArea: "other", approved: false }
    ]
  });
  assert.equal(failed.status, 500);
  const after = await adminAgent.get(`/api/admin/methods/${id}`);
  assert.equal(after.body.method.title, before.body.method.title);
  assert.deepEqual(after.body.sources, before.body.sources);
});

test("method research editor persists every section through one transactional endpoint", async () => {
  const created = await createMethod("integration-research-success");
  const id = created.body.method.id as number;
  const criteria = ["phone_and_free_tools", "independent_execution", "no_credentials_or_preexisting_trust", "no_meetings_or_sales_calls"].map((code) => ({ code, assessment: "not_verified", explanation: "Research remains incomplete.", sourceIds: [] }));
  const saved = await adminAgent.put(`/api/admin/methods/${id}/research`).set("x-csrf-token", adminCsrfToken).send({
    method: { slug: "integration-research-success-edited", title: "Edited candidate", category: "Digital assets", summary: "New summary", overview: "A person makes one asset.", distribution: "A self-serve hypothesis.", incomeMechanism: "Not researched.", requirements: { device: "Phone", internet: "Not verified" }, limitations: "Discovery is unknown." },
    criteria: { criteria },
    steps: [{ stepNumber: 1, title: "Make a test asset", whatToDo: "Create one sample.", howToDo: "Use an accessible phone workflow.", toolNames: "Phone notes", output: "One sample asset.", successLooksLike: "The sample opens and is understandable.", commonProblems: "Tools are unverified.", alternatives: "A text-only sample." }],
    tools: [{ name: "Phone notes", purpose: "Outline a small asset.", officialUrl: null, freeConditions: "Built-in access varies by device.", limitations: "Not verified.", phoneUsable: "yes", lastVerified: null }],
    sources: [{ title: "Policy notes", url: "https://example.org/policy", sourceType: "other", accessedAt: "2026-11-03", lastVerifiedAt: "2026-11-03", supportsClaim: "Supports a test requirement.", supportsArea: "other", approved: false }]
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.method.title, "Edited candidate");
  assert.equal(saved.body.criteria.length, 4);
  assert.equal(saved.body.steps.length, 1);
  assert.equal(saved.body.tools.length, 1);
  assert.equal(saved.body.sources.length, 1);
});

test("qualification publication is blocked until each passing criterion cites approved evidence", async () => {
  const created = await createMethod("integration-qualification-gate");
  const id = created.body.method.id as number;
  const denied = await adminAgent.patch(`/api/admin/methods/${id}/status`)
    .set("x-csrf-token", adminCsrfToken)
    .send({ status: "qualified", published: true });
  assert.equal(denied.status, 400);

  const sourceResponse = await adminAgent.put(`/api/admin/methods/${id}/sources`)
    .set("x-csrf-token", adminCsrfToken)
    .send({ items: [{ title: "Primary evidence", url: "https://example.org/policy", sourceType: "official_policy", accessedAt: "2026-11-03", lastVerifiedAt: "2026-11-03", supportsClaim: "Supports the tested criterion.", supportsArea: "qualification", approved: true }] });
  assert.equal(sourceResponse.status, 200);
  const sourceId = sourceResponse.body.ids[0] as number;
  const criteria = [
    "phone_and_free_tools", "independent_execution", "no_credentials_or_preexisting_trust", "no_meetings_or_sales_calls"
  ].map((code) => ({ code, assessment: "pass", explanation: "Reviewed against the attached primary source.", sourceIds: [sourceId] }));
  const assessmentResponse = await adminAgent.put(`/api/admin/methods/${id}/criteria`)
    .set("x-csrf-token", adminCsrfToken).send({ criteria });
  assert.equal(assessmentResponse.status, 200);
  const qualified = await adminAgent.patch(`/api/admin/methods/${id}/status`)
    .set("x-csrf-token", adminCsrfToken).send({ status: "qualified", published: true });
  assert.equal(qualified.status, 200);
  const publicDetail = await request(app).get("/api/methods/integration-qualification-gate");
  assert.equal(publicDetail.status, 200);
  assert.equal(publicDetail.body.method.status, "qualified");
  assert.equal(publicDetail.body.sources.length, 1);
});

test("qualification cannot cite another method's approved source", async () => {
  const sourceOwner = await createMethod("integration-source-owner");
  const target = await createMethod("integration-source-target");
  const sourceResult = await adminAgent.put(`/api/admin/methods/${sourceOwner.body.method.id}/sources`).set("x-csrf-token", adminCsrfToken).send({ items: [{ title: "Owned source", url: "https://example.org/policy", sourceType: "official_policy", accessedAt: "2026-11-03", lastVerifiedAt: "2026-11-03", supportsClaim: "Supports the check.", supportsArea: "qualification", approved: true }] });
  assert.equal(sourceResult.status, 200);
  const foreignId = sourceResult.body.ids[0] as number;
  const assessments = ["phone_and_free_tools", "independent_execution", "no_credentials_or_preexisting_trust", "no_meetings_or_sales_calls"].map((code) => ({ code, assessment: "pass", explanation: "Reviewed.", sourceIds: [foreignId] }));
  const forged = await adminAgent.put(`/api/admin/methods/${target.body.method.id}/criteria`).set("x-csrf-token", adminCsrfToken).send({ criteria: assessments });
  assert.equal(forged.status, 400);
  const publish = await adminAgent.patch(`/api/admin/methods/${target.body.method.id}/status`).set("x-csrf-token", adminCsrfToken).send({ status: "qualified", published: true });
  assert.equal(publish.status, 400);
});

test("method writes require CSRF and experiment amounts require currency", async () => {
  const unauthenticated = await request(app).post("/api/admin/methods").send({});
  assert.equal(unauthenticated.status, 401);
  const created = await createMethod("integration-experiment-currency");
  const rejected = await adminAgent.post("/api/admin/experiments")
    .set("x-csrf-token", adminCsrfToken)
    .send({ methodId: created.body.method.id, title: "Currency check", hypothesis: "A test", owner: "Researcher", actualIncome: 15 });
  assert.equal(rejected.status, 400);
  const accepted = await adminAgent.post("/api/admin/experiments")
    .set("x-csrf-token", adminCsrfToken)
    .send({ methodId: created.body.method.id, title: "Currency check", hypothesis: "A test", owner: "Researcher", actualIncome: 15, actualIncomeCurrency: "INR" });
  assert.equal(accepted.status, 201);
  const detail = await adminAgent.get(`/api/admin/experiments/${accepted.body.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.experiment.actual_income_currency, "INR");
  const strictRejected = await adminAgent.patch(`/api/admin/experiments/${accepted.body.id}`).set("x-csrf-token", adminCsrfToken).send({ methodId: created.body.method.id, title: "Updated experiment" });
  assert.equal(strictRejected.status, 400);
  const updated = await adminAgent.patch(`/api/admin/experiments/${accepted.body.id}`).set("x-csrf-token", adminCsrfToken).send({ title: "Updated experiment" });
  assert.equal(updated.status, 200);
});

test("only completed experiments with approved evidence are publicly disclosed", async () => {
  const created = await createMethod("integration-experiment-visibility");
  const methodId = created.body.method.id as number;
  const base = { methodId, title: "Evidence review", hypothesis: "A clearly scoped test.", owner: "Research team", status: "completed", publicApproved: true };
  const noEvidence = await adminAgent.post("/api/admin/experiments").set("x-csrf-token", adminCsrfToken).send(base);
  assert.equal(noEvidence.status, 400);
  const planned = await adminAgent.post("/api/admin/experiments").set("x-csrf-token", adminCsrfToken).send({ ...base, status: "planned", evidence: [{ title: "Approved record", description: "Reviewed.", publicApproved: true }] });
  assert.equal(planned.status, 400);
  const disclosed = await adminAgent.post("/api/admin/experiments").set("x-csrf-token", adminCsrfToken).send({ ...base, evidence: [{ title: "Approved record", description: "Reviewed.", publicApproved: true }, { title: "Internal note", description: "Private.", publicApproved: false }] });
  assert.equal(disclosed.status, 201);
  const publishMethod = await adminAgent.patch(`/api/admin/methods/${methodId}/status`).set("x-csrf-token", adminCsrfToken).send({ status: "under_validation", published: true });
  assert.equal(publishMethod.status, 200);
  const publicData = await request(app).get(`/api/methods/integration-experiment-visibility/experiments`);
  assert.equal(publicData.status, 200);
  assert.equal(publicData.body.experiments.length, 1);
  assert.equal(publicData.body.experiments[0].evidence.length, 1);
  assert.equal(publicData.body.experiments[0].evidence[0].title, "Approved record");
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
      "SELECT COUNT(*) AS total FROM business_diagnostic_submissions WHERE pilot_location = ?",
      [validPayload.pilotLocation]
    );

    assert.equal(Number(rows[0].total), 0);

    const [history] = await pool!.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM business_diagnostic_status_history h
       INNER JOIN business_diagnostic_submissions s ON s.id = h.submission_id
       WHERE s.pilot_location = ?`,
      [validPayload.pilotLocation]
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
  const invalidMethodPage = await adminAgent.get("/api/admin/methods?page=0");
  assert.equal(invalidMethodPage.status, 400);
  const invalidMethodLimit = await adminAgent.get("/api/admin/methods?limit=101");
  assert.equal(invalidMethodLimit.status, 400);
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
