import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { config } from "dotenv";
import argon2 from "argon2";
import request from "supertest";
import type { Express } from "express";
import type { Pool, RowDataPacket } from "mysql2/promise";

const loaded = config({ path: resolve(process.cwd(), ".env.test"), override: true });
const TEST_DB = "digital_youth_mini_app_test";

if (loaded.error) throw loaded.error;
if (process.env.NODE_ENV !== "test" || process.env.DB_NAME !== TEST_DB) {
  throw new Error(`Learning integration requires ${TEST_DB}.`);
}

const suffix = randomUUID();
const adminEmail = `learning-admin-${suffix}@digital-youth.test`;
const participantEmail = `learning-participant-${suffix}@digital-youth.test`;
const adminPassword = "Learning-Integration-Admin-2026!";
const participantPassword = "Learning-Integration-Participant-2026!";
const moduleSlug = `integration-learning-${suffix}`;

let app: Express;
let pool: Pool;
let adminAgent: ReturnType<typeof request.agent>;
let participantAgent: ReturnType<typeof request.agent>;
let adminId = 0;
let participantId = 0;
let moduleId = 0;
let exerciseId = 0;
let adminCsrf = "";
let participantCsrf = "";

async function assertTestDatabase() {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS db");
  assert.equal(rows[0]?.db, TEST_DB);
}

async function cleanup() {
  if (!pool) return;
  await assertTestDatabase();

  const [participants] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM participant_accounts WHERE email = ?",
    [participantEmail]
  );
  const ids = participants.map(row => Number(row.id));

  for (const id of ids) {
    await pool.execute("DELETE FROM participant_learning_time_logs WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM exercise_submissions WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM learning_enrollments WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_sessions WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_skills WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_interests WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_portfolio_items WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM digital_youth_audit_events WHERE participant_id = ?", [id]);
  }

  await pool.execute("DELETE FROM participant_invitations WHERE email = ?", [participantEmail]);

  const [modules] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM learning_modules WHERE slug = ?",
    [moduleSlug]
  );

  for (const module of modules) {
    const id = Number(module.id);
    await pool.execute(
      "DELETE FROM participant_learning_time_logs WHERE module_id = ?",
      [id]
    );
    await pool.execute(
      "DELETE s FROM exercise_submissions s INNER JOIN learning_exercises e ON e.id = s.exercise_id WHERE e.module_id = ?",
      [id]
    );
    await pool.execute("DELETE FROM learning_enrollments WHERE module_id = ?", [id]);
    await pool.execute("DELETE FROM learning_exercises WHERE module_id = ?", [id]);
    await pool.execute("DELETE FROM learning_modules WHERE id = ?", [id]);
  }

  for (const id of ids) {
    await pool.execute("DELETE FROM participant_accounts WHERE id = ?", [id]);
  }

  if (adminId) {
    await pool.execute("DELETE FROM digital_youth_audit_events WHERE admin_user_id = ?", [adminId]);
    await pool.execute("DELETE FROM admin_sessions WHERE admin_user_id = ?", [adminId]);
    await pool.execute("DELETE FROM admin_users WHERE id = ?", [adminId]);
  }
}

before(async () => {
  const [application, database] = await Promise.all([
    import("../../src/app.js"),
    import("../../src/config/database.js")
  ]);

  app = application.createApp();
  pool = database.pool;
  await assertTestDatabase();

  const hash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });

  await pool.execute(
    `INSERT INTO admin_users (email, display_name, password_hash, is_active)
     VALUES (?, 'Learning Integration Admin', ?, 1)`,
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
  assert.equal(login.status, 200, JSON.stringify(login.body));
  adminCsrf = login.body.csrfToken;

  const [sites] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM pilot_sites WHERE code = 'bengaluru' AND is_active = 1 LIMIT 1"
  );
  assert.equal(sites.length, 1);

  const invitation = await adminAgent
    .post("/api/admin/participants/invitations")
    .set("x-csrf-token", adminCsrf)
    .send({
      email: participantEmail,
      displayName: "Learning Integration Participant",
      pilotSiteId: Number(sites[0].id),
      expiresInDays: 7
    });
  assert.equal(invitation.status, 201, JSON.stringify(invitation.body));

  participantAgent = request.agent(app);
  const registration = await participantAgent
    .post("/api/participants/accept-invitation")
    .send({
      token: invitation.body.invitationToken,
      password: participantPassword,
      dateOfBirth: "1998-04-15",
      adultParticipationConfirmed: true
    });
  assert.equal(registration.status, 201, JSON.stringify(registration.body));

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

test("coordinator publishes learning content; participant enrols, submits, completes and logs time", async () => {
  const malformedSlug = await adminAgent
    .post("/api/admin/learning/modules")
    .set("x-csrf-token", adminCsrf)
    .send({
      slug: "invalid--slug",
      title: "Invalid Slug Module",
      summary: "This slug should be rejected by validation.",
      contentMarkdown: "This content is long enough to pass the minimum length.",
      skillCategory: "Digital operations",
      difficulty: "beginner"
    });
  assert.equal(malformedSlug.status, 400, "Repeated hyphens must not be accepted in slugs.");

  // Draft module creation.
  const createModule = await adminAgent
    .post("/api/admin/learning/modules")
    .set("x-csrf-token", adminCsrf)
    .send({
      slug: moduleSlug,
      title: "Integration Test Digital Skills",
      summary: "A test module for the complete learning workflow.",
      contentMarkdown: "## Practice\nComplete the simulated business exercise.",
      skillCategory: "Digital operations",
      difficulty: "beginner",
      estimatedMinutes: 45
    });

  assert.equal(createModule.status, 201, JSON.stringify(createModule.body));
  moduleId = Number(createModule.body.moduleId);

  // A draft must not appear in the public catalogue.
  const hiddenDraft = await request(app).get(`/api/learning/modules/${moduleSlug}`);
  assert.equal(hiddenDraft.status, 404);

  // Add an exercise before publishing.
  const createExercise = await adminAgent
    .post(`/api/admin/learning/modules/${moduleId}/exercises`)
    .set("x-csrf-token", adminCsrf)
    .send({
      title: "Create a sample digital menu",
      instructions: "Use the fictional menu data to create a readable digital menu.",
      simulatedMaterials: { business: "Sample Cafe", items: ["Tea", "Coffee"] },
      expectedOutcome: "A clear, accurate menu using only supplied fictional information.",
      reviewCriteria: [
        "Prices and item names are accurate.",
        "The menu is readable and well organised."
      ],
      sortOrder: 1
    });

  assert.equal(createExercise.status, 201, JSON.stringify(createExercise.body));
  exerciseId = Number(createExercise.body.exerciseId);

  // Publish after an exercise exists.
  const publish = await adminAgent
    .patch(`/api/admin/learning/modules/${moduleId}`)
    .set("x-csrf-token", adminCsrf)
    .send({ publicationStatus: "published" });

  assert.equal(publish.status, 200, JSON.stringify(publish.body));

  const catalogue = await request(app).get("/api/learning/modules");
  assert.equal(catalogue.status, 200);
  assert.ok(catalogue.body.modules.some((item: any) => item.slug === moduleSlug));

  const publicDetail = await request(app).get(`/api/learning/modules/${moduleSlug}`);
  assert.equal(publicDetail.status, 200);
  assert.equal(publicDetail.body.exercises.length, 1);

  // Participant enrols.
  const enrollment = await participantAgent
    .post(`/api/learning/modules/${moduleId}/enroll`)
    .set("x-csrf-token", participantCsrf)
    .send({});

  assert.equal(enrollment.status, 200, JSON.stringify(enrollment.body));
  const enrollmentId = Number(enrollment.body.enrollment.id);

  const myEnrollments = await participantAgent.get("/api/learning/enrollments");
  assert.equal(myEnrollments.status, 200);
  assert.ok(myEnrollments.body.enrollments.some((item: any) => Number(item.id) === enrollmentId));

  // Participant submits the exercise.
  const submission = await participantAgent
    .post(`/api/learning/exercises/${exerciseId}/submissions`)
    .set("x-csrf-token", participantCsrf)
    .send({
      responseText: "I created a sample menu with the supplied fictional items and checked every label.",
      resourceUrl: null
    });

  assert.equal(submission.status, 201, JSON.stringify(submission.body));
  const submissionId = Number(submission.body.submissionId);

  const reviewQueue = await adminAgent.get("/api/admin/learning/submissions?status=submitted");
  assert.equal(reviewQueue.status, 200);
  assert.ok(reviewQueue.body.submissions.some((item: any) => Number(item.id) === submissionId));

  // Coordinator accepts the exercise.
  const review = await adminAgent
    .patch(`/api/admin/learning/submissions/${submissionId}/review`)
    .set("x-csrf-token", adminCsrf)
    .send({
      reviewStatus: "accepted",
      feedback: "The simulated menu meets the stated exercise criteria."
    });

  assert.equal(review.status, 200, JSON.stringify(review.body));

  const enrollmentDetail = await participantAgent.get(
    `/api/learning/enrollments/${enrollmentId}`
  );
  assert.equal(enrollmentDetail.status, 200);
  assert.equal(enrollmentDetail.body.enrollment.enrollment_status, "completed");

  // Participant records learning time.
  const [todayRows] = await pool.query<RowDataPacket[]>(
    "SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS today"
  );
  const today = String(todayRows[0].today);

  const timeLog = await participantAgent
    .post("/api/learning/time-logs")
    .set("x-csrf-token", participantCsrf)
    .send({
      moduleId,
      exerciseId,
      workDate: today,
      minutesSpent: 35,
      activityType: "practice",
      description: "Practised arranging the sample menu and checking item accuracy."
    });

  assert.equal(timeLog.status, 201, JSON.stringify(timeLog.body));
  const timeLogId = Number(timeLog.body.timeLogId);

  const queue = await adminAgent.get("/api/admin/learning/time-logs?status=pending");
  assert.equal(queue.status, 200);
  assert.ok(queue.body.timeLogs.some((item: any) => Number(item.id) === timeLogId));

  const approval = await adminAgent
    .patch(`/api/admin/learning/time-logs/${timeLogId}/review`)
    .set("x-csrf-token", adminCsrf)
    .send({
      approvalStatus: "approved",
      reason: "The learning activity is sufficiently described."
    });

  assert.equal(approval.status, 200, JSON.stringify(approval.body));

  const personalLogs = await participantAgent.get("/api/learning/time-logs");
  assert.equal(personalLogs.status, 200);
  const savedLog = personalLogs.body.timeLogs.find((item: any) => Number(item.id) === timeLogId);
  assert.ok(savedLog);
  assert.equal(savedLog.approval_status, "approved");

  const personalSubmissions = await participantAgent.get("/api/learning/submissions");
  assert.equal(personalSubmissions.status, 200);
  assert.ok(personalSubmissions.body.submissions.some((item: any) => Number(item.id) === submissionId));

  // Participants cannot access coordinator-only routes.
  const forbiddenAdminQueue = await participantAgent.get("/api/admin/learning/submissions");
  assert.equal(forbiddenAdminQueue.status, 401);
});
