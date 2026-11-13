import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { config } from "dotenv";
import argon2 from "argon2";
import request from "supertest";
import type { Express } from "express";
import type { Pool, RowDataPacket } from "mysql2/promise";

config({ path: resolve(process.cwd(), ".env.test"), override: true });

const TEST_DB = "digital_youth_mini_app_test";
if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== TEST_DB) {
  throw new Error(`Project lifecycle test requires ${TEST_DB}.`);
}

const suffix = randomUUID();
const diagnosticUuids = [randomUUID(), randomUUID()];
const adminEmail = `project-admin-${suffix}@digital-youth.test`;
const participantEmail = `project-participant-${suffix}@digital-youth.test`;
const adminPassword = "Project-Integration-Admin-2026!";
const participantPassword = "Project-Integration-Participant-2026!";

let app: Express;
let pool: Pool;
let adminAgent: ReturnType<typeof request.agent>;
let participantAgent: ReturnType<typeof request.agent>;
let adminId = 0;
let participantId = 0;
let pilotSiteId = 0;
let adminCsrf = "";
let participantCsrf = "";

async function assertTestDatabase() {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS db");
  assert.equal(rows[0]?.db, TEST_DB, "Unsafe database connection.");
}

async function cleanup() {
  if (!pool) return;
  await assertTestDatabase();

  const [diagnostics] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM field_visit_diagnostic_submissions WHERE submission_uuid IN (?, ?)",
    diagnosticUuids
  );
  const diagnosticIds = diagnostics.map(row => Number(row.id));

  for (const diagnosticId of diagnosticIds) {
    const [projects] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM digital_youth_projects WHERE diagnostic_submission_id = ?",
      [diagnosticId]
    );

    for (const row of projects) {
      const projectId = Number(row.id);

      await pool.execute(
        "DELETE FROM project_verification_reviews WHERE project_id = ?",
        [projectId]
      );
      await pool.execute(
        "DELETE FROM project_disputes WHERE project_id = ?",
        [projectId]
      );
      await pool.execute(
        "DELETE FROM digital_youth_project_status_history WHERE project_id = ?",
        [projectId]
      );
      await pool.execute(
        `DELETE FROM project_payment_allocations
         WHERE project_payment_id IN (
           SELECT id FROM project_payments WHERE project_id = ?
         )`,
        [projectId]
      );
      await pool.execute("DELETE FROM project_agreement_approvals WHERE agreement_id IN (SELECT id FROM project_agreements WHERE project_id = ?)", [projectId]);
      await pool.execute("DELETE FROM project_deliverables WHERE project_id = ?", [projectId]);
      await pool.execute("DELETE FROM project_work_logs WHERE project_id = ?", [projectId]);
      await pool.execute("DELETE FROM project_tasks WHERE project_id = ?", [projectId]);
      await pool.execute("DELETE FROM project_participants WHERE project_id = ?", [projectId]);
      await pool.execute("DELETE FROM project_payment_allocations WHERE project_payment_id IN (SELECT id FROM project_payments WHERE project_id = ?)", [projectId]);
      await pool.execute("DELETE FROM project_payments WHERE project_id = ?", [projectId]);
      await pool.execute("DELETE FROM business_review_tokens WHERE project_id = ?", [projectId]);
      await pool.execute("DELETE FROM project_agreements WHERE project_id = ?", [projectId]);
      await pool.execute("DELETE FROM digital_youth_projects WHERE id = ?", [projectId]);
    }

    await pool.execute(
      "DELETE FROM diagnostic_prioritisations WHERE diagnostic_submission_id = ?",
      [diagnosticId]
    );
  }

  await pool.execute(
    "DELETE FROM field_visit_diagnostic_submissions WHERE submission_uuid IN (?, ?)",
    diagnosticUuids
  );

  const [participants] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM participant_accounts WHERE email = ?",
    [participantEmail]
  );

  for (const row of participants) {
    const id = Number(row.id);
    await pool.execute("DELETE FROM participant_sessions WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_skills WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_interests WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_portfolio_items WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_learning_time_logs WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM exercise_submissions WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM learning_enrollments WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_team_members WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM digital_youth_audit_events WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_accounts WHERE id = ?", [id]);
  }

  await pool.execute("DELETE FROM participant_invitations WHERE email = ?", [participantEmail]);

  const [admins] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM admin_users WHERE email = ?",
    [adminEmail]
  );

  for (const row of admins) {
    const id = Number(row.id);
    await pool.execute("DELETE FROM digital_youth_audit_events WHERE admin_user_id = ?", [id]);
    await pool.execute("DELETE FROM admin_sessions WHERE admin_user_id = ?", [id]);
    await pool.execute("DELETE FROM admin_users WHERE id = ?", [id]);
  }
}

async function expectStatus(
  response: request.Response,
  status: number,
  description: string
) {
  assert.equal(
    response.status,
    status,
    `${description}: expected HTTP ${status}, received ${response.status}: ${JSON.stringify(response.body)}`
  );
}

before(async () => {
  const [application, database] = await Promise.all([
    import("../../src/app.js"),
    import("../../src/config/database.js")
  ]);

  app = application.createApp();
  pool = database.pool;
  await assertTestDatabase();

  const [sites] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM pilot_sites WHERE code = 'bengaluru' AND is_active = 1 LIMIT 1"
  );
  assert.equal(sites.length, 1, "Active Bengaluru pilot site is required.");
  pilotSiteId = Number(sites[0].id);

  const hash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });

  await pool.execute(
    `INSERT INTO admin_users (email, display_name, password_hash, is_active)
     VALUES (?, 'Project Integration Admin', ?, 1)`,
    [adminEmail, hash]
  );

  const [admins] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM admin_users WHERE email = ?",
    [adminEmail]
  );
  adminId = Number(admins[0].id);

  adminAgent = request.agent(app);
  const login = await adminAgent.post("/api/auth/login").send({
    email: adminEmail,
    password: adminPassword
  });
  await expectStatus(login, 200, "Admin login");
  adminCsrf = login.body.csrfToken;

  const invitation = await adminAgent
    .post("/api/admin/participants/invitations")
    .set("x-csrf-token", adminCsrf)
    .send({
      email: participantEmail,
      displayName: "Project Integration Participant",
      pilotSiteId,
      expiresInDays: 7
    });
  await expectStatus(invitation, 201, "Participant invitation");

  participantAgent = request.agent(app);
  const registration = await participantAgent
    .post("/api/participants/accept-invitation")
    .send({
      token: invitation.body.invitationToken,
      password: participantPassword,
      dateOfBirth: "1998-04-15",
      adultParticipationConfirmed: true
    });
  await expectStatus(registration, 201, "Participant registration");

  participantId = Number(registration.body.participant.id);
  participantCsrf = registration.body.csrfToken;
});

after(async () => {
  if (!pool) return;
  try {
    await cleanup();
  } finally {
    await pool.end();
  }
});

async function createApprovedProject(
  diagnosticIndex: number,
  label: string,
  price: number
) {
  const submissionUuid = diagnosticUuids[diagnosticIndex];

  const diagnostic = await request(app)
    .post("/api/v2/field-visit-diagnostics")
    .send({
      submissionUuid,
      businessName: `Project Test ${label}`,
      businessType: "food_beverage",
      businessTypeOther: null,
      currentTools: ["whatsapp", "paper_pen"],
      toolsOther: null,
      biggestOperationalPain:
        "Difficulty maintaining accurate daily business records and responding to customer requests.",
      problemAreas: ["tourist_replies", "bookings"],
      contactName: null,
      whatsappNumber: null,
      followUpConsent: false
    });

  await expectStatus(diagnostic, 201, `${label}: diagnostic submission`);

  await pool.execute(
    "UPDATE field_visit_diagnostic_submissions SET pilot_site_id = ? WHERE submission_uuid = ?",
    [pilotSiteId, submissionUuid]
  );

  const [diagnosticRows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM field_visit_diagnostic_submissions WHERE submission_uuid = ?",
    [submissionUuid]
  );
  const diagnosticId = Number(diagnosticRows[0].id);

  const prioritisation = await adminAgent
    .post(`/api/admin/diagnostics/${diagnosticId}/prioritisation`)
    .set("x-csrf-token", adminCsrf)
    .send({
      usefulness: true,
      solvable: true,
      safeToDeliver: true,
      measurable: true,
      skillsAvailable: true,
      decision: "prioritised",
      rationale: "The issue is useful, solvable, safe, measurable and within available participant skills.",
      priority: "normal"
    });
  await expectStatus(prioritisation, 200, `${label}: human prioritisation`);

  const created = await adminAgent
    .post("/api/admin/projects")
    .set("x-csrf-token", adminCsrf)
    .send({
      diagnosticSubmissionId: diagnosticId,
      title: `${label} integration project`,
      objective: "Validate the project lifecycle using an isolated test participant.",
      proposedSolution: "Create and verify a small digital workflow using simulated test material.",
      riskNotes: "Integration test only."
    });
  await expectStatus(created, 201, `${label}: project creation`);
  const projectId = Number(created.body.projectId);

  const assignment = await adminAgent
    .post(`/api/admin/projects/${projectId}/assignments`)
    .set("x-csrf-token", adminCsrf)
    .send({
      participantId,
      assignmentRole: "Digital contributor"
    });
  await expectStatus(assignment, 201, `${label}: participant assignment`);

  const assignmentId = Number(assignment.body.assignmentId);

  const accepted = await participantAgent
    .post(`/api/projects/${projectId}/assignments/${assignmentId}/respond`)
    .set("x-csrf-token", participantCsrf)
    .send({ response: "accepted" });
  await expectStatus(accepted, 200, `${label}: participant accepts assignment`);

  const demonstration = await adminAgent
    .patch(`/api/admin/projects/${projectId}/status`)
    .set("x-csrf-token", adminCsrf)
    .send({
      status: "demonstration",
      reason: "Begin a simulated demonstration."
    });
  await expectStatus(demonstration, 200, `${label}: demonstration status`);

  const demoLog = await participantAgent
    .post(`/api/projects/${projectId}/work-logs`)
    .set("x-csrf-token", participantCsrf)
    .send({
      workDate: new Date().toISOString().slice(0, 10),
      minutesWorked: 10,
      workType: "demonstration",
      description: "Prepared the simulated demonstration."
    });
  await expectStatus(demoLog, 201, `${label}: demonstration work log`);

  const businessReview = await adminAgent
    .patch(`/api/admin/projects/${projectId}/status`)
    .set("x-csrf-token", adminCsrf)
    .send({
      status: "business_review",
      reason: "Demonstration ready for business review."
    });
  await expectStatus(businessReview, 200, `${label}: business review status`);

  const agreement = await adminAgent
    .post(`/api/admin/projects/${projectId}/agreements`)
    .set("x-csrf-token", adminCsrf)
    .send({
      scopeOfWork: "Build and verify the agreed digital workflow using the supplied test materials.",
      deliverables: [
        {
          title: "Verified digital workflow",
          description: "A functioning workflow with documented test evidence."
        }
      ],
      price,
      currency: "INR",
      deadline: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      acceptanceCriteria: "The workflow must work as described and pass the documented acceptance checks.",
      responsiblePayer: "Project Integration Test Business",
      paymentTerms: "Payment after business verification."
    });
  await expectStatus(agreement, 201, `${label}: agreement draft`);
  const agreementId = Number(agreement.body.agreementId);

  const sent = await adminAgent
    .post(`/api/admin/projects/${projectId}/agreements/${agreementId}/send`)
    .set("x-csrf-token", adminCsrf)
    .send({});
  await expectStatus(sent, 201, `${label}: agreement sent`);
  const token = sent.body.businessReviewToken;
  assert.ok(typeof token === "string" && token.length >= 32);

  const review = await request(app).get(`/api/business/review/${token}`);
  await expectStatus(review, 200, `${label}: business review link`);
  assert.equal(Number(review.body.project.id), projectId);

  const participantApproval = await participantAgent
    .post(`/api/projects/${projectId}/agreements/${agreementId}/approval`)
    .set("x-csrf-token", participantCsrf)
    .send({
      decision: "approved",
      comments: "Scope, price and acceptance criteria reviewed."
    });
  await expectStatus(participantApproval, 201, `${label}: participant agreement approval`);

  const businessApproval = await request(app)
    .post(`/api/business/review/${token}/agreements/${agreementId}/decision`)
    .send({
      decision: "approved",
      comments: "Business accepts the documented scope and terms."
    });
  await expectStatus(businessApproval, 201, `${label}: business agreement approval`);

  const activated = await adminAgent
    .post(`/api/admin/projects/${projectId}/agreements/${agreementId}/activate`)
    .set("x-csrf-token", adminCsrf)
    .send({});
  await expectStatus(activated, 200, `${label}: agreement activation`);

  const inProgress = await adminAgent
    .patch(`/api/admin/projects/${projectId}/status`)
    .set("x-csrf-token", adminCsrf)
    .send({
      status: "in_progress",
      reason: "All approvals received; commercial work may begin."
    });
  await expectStatus(inProgress, 200, `${label}: commercial work starts`);

  return { projectId, agreementId, token };
}

test("project lifecycle: approvals, delivery, business verification, payment and full participant payout", async () => {
  const { projectId, agreementId, token } =
    await createApprovedProject(0, "Completion", 1000);

  const task = await adminAgent
    .post(`/api/admin/projects/${projectId}/tasks`)
    .set("x-csrf-token", adminCsrf)
    .send({
      title: "Complete the digital workflow",
      description: "Implement and test the agreed workflow.",
      assignedParticipantId: participantId
    });
  await expectStatus(task, 201, "Task creation");
  const taskId = Number(task.body.taskId);

  const taskStarted = await participantAgent
    .patch(`/api/projects/tasks/${taskId}`)
    .set("x-csrf-token", participantCsrf)
    .send({ taskStatus: "in_progress" });
  await expectStatus(taskStarted, 200, "Participant starts task");

  const workLog = await participantAgent
    .post(`/api/projects/${projectId}/work-logs`)
    .set("x-csrf-token", participantCsrf)
    .send({
      workDate: new Date().toISOString().slice(0, 10),
      minutesWorked: 60,
      workType: "commercial",
      description: "Implemented and tested the agreed digital workflow."
    });
  await expectStatus(workLog, 201, "Commercial work log");

  const taskCompleted = await participantAgent
    .patch(`/api/projects/tasks/${taskId}`)
    .set("x-csrf-token", participantCsrf)
    .send({ taskStatus: "completed" });
  await expectStatus(taskCompleted, 200, "Participant completes task");

  const deliverable = await participantAgent
    .post(`/api/projects/${projectId}/deliverables`)
    .set("x-csrf-token", participantCsrf)
    .send({
      taskId,
      title: "Completed digital workflow",
      description: "The agreed workflow is implemented and tested.",
      evidenceNotes: "Integration test evidence."
    });
  await expectStatus(deliverable, 201, "Participant submits deliverable");
  const deliverableId = Number(deliverable.body.deliverableId);

  const coordinatorReview = await adminAgent
    .post(`/api/admin/projects/${projectId}/verification`)
    .set("x-csrf-token", adminCsrf)
    .send({
      deliverableId,
      decision: "accepted",
      feedback: "The deliverable meets the agreed coordinator review criteria."
    });
  await expectStatus(coordinatorReview, 200, "Coordinator accepts deliverable");

  const businessVerification = await request(app)
    .post(`/api/business/review/${token}/verification`)
    .send({
      deliverableId,
      decision: "accepted",
      feedback: "The business confirms that the deliverable meets the agreed criteria."
    });
  await expectStatus(businessVerification, 201, "Business verifies delivery");

  const [projectRows] = await pool.execute<RowDataPacket[]>(
    "SELECT project_status FROM digital_youth_projects WHERE id = ?",
    [projectId]
  );
  assert.equal(projectRows[0]?.project_status, "completed");

  const payment = await adminAgent
    .post(`/api/admin/projects/${projectId}/payments`)
    .set("x-csrf-token", adminCsrf)
    .send({
      agreementId,
      payerName: "Project Integration Test Business",
      recipientDescription: "Participant project income",
      amount: 1000,
      currency: "INR",
      paymentReference: `RECEIPT-${suffix}`,
      notes: "Integration test payment."
    });
  await expectStatus(payment, 201, "Business payment record");
  const paymentId = Number(payment.body.paymentId);

  const verifiedPayment = await adminAgent
    .patch(`/api/admin/projects/${projectId}/payments/${paymentId}/verify`)
    .set("x-csrf-token", adminCsrf)
    .send({
      paymentDate: new Date().toISOString().slice(0, 10)
    });
  await expectStatus(verifiedPayment, 200, "Payment receipt verification");

  const underAllocated = await adminAgent
    .put(`/api/admin/projects/${projectId}/payments/${paymentId}/allocations`)
    .set("x-csrf-token", adminCsrf)
    .send({
      allocations: [{ participantId, amount: 999.99 }]
    });
  await expectStatus(underAllocated, 422, "Reject incomplete participant allocation");

  const allocation = await adminAgent
    .put(`/api/admin/projects/${projectId}/payments/${paymentId}/allocations`)
    .set("x-csrf-token", adminCsrf)
    .send({
      allocations: [{ participantId, amount: 1000 }]
    });
  await expectStatus(allocation, 200, "Allocate 100% of verified payment");
  assert.equal(allocation.body.totalAllocated, 1000);
  assert.equal(allocation.body.platformCommission, 0);

  const [allocations] = await pool.execute<RowDataPacket[]>(
    "SELECT id, allocation_status FROM project_payment_allocations WHERE project_payment_id = ?",
    [paymentId]
  );
  assert.equal(allocations.length, 1);

  const payout = await adminAgent
    .patch(`/api/admin/projects/${projectId}/payments/${paymentId}/allocations/${allocations[0].id}/payout`)
    .set("x-csrf-token", adminCsrf)
    .send({
      payoutMethod: "upi",
      payoutDate: new Date().toISOString().slice(0, 10),
      payoutReference: `PAYOUT-${suffix}`,
      notes: "Integration test participant payout."
    });
  await expectStatus(payout, 200, "Record and verify participant payout");

  const [paid] = await pool.execute<RowDataPacket[]>(
    "SELECT allocation_status FROM project_payment_allocations WHERE id = ?",
    [allocations[0].id]
  );
  assert.equal(paid[0]?.allocation_status, "paid");
});

test("project dispute: participant raises dispute and coordinator resolves it", async () => {
  const { projectId } = await createApprovedProject(1, "Dispute", 100);

  const dispute = await participantAgent
    .post(`/api/projects/${projectId}/disputes`)
    .set("x-csrf-token", participantCsrf)
    .send({
      reason: "The agreed scope needs clarification before work can safely continue."
    });
  await expectStatus(dispute, 201, "Participant raises dispute");

  const disputeId = Number(dispute.body.disputeId);

  const [disputed] = await pool.execute<RowDataPacket[]>(
    "SELECT project_status FROM digital_youth_projects WHERE id = ?",
    [projectId]
  );
  assert.equal(disputed[0]?.project_status, "disputed");

  const resolution = await adminAgent
    .post(`/api/admin/projects/${projectId}/disputes/${disputeId}/resolve`)
    .set("x-csrf-token", adminCsrf)
    .send({
      resolutionStatus: "resolved",
      resolutionNotes: "The coordinator clarified the scope and both parties can continue."
    });
  await expectStatus(resolution, 200, "Coordinator resolves dispute");

  const [resolved] = await pool.execute<RowDataPacket[]>(
    `SELECT p.project_status, d.resolution_status
     FROM digital_youth_projects p
     INNER JOIN project_disputes d ON d.project_id = p.id
     WHERE p.id = ? AND d.id = ?`,
    [projectId, disputeId]
  );
  assert.equal(resolved[0]?.project_status, "in_progress");
  assert.equal(resolved[0]?.resolution_status, "resolved");
});
