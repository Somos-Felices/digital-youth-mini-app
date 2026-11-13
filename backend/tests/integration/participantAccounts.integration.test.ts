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
  throw new Error(`Participant integration test requires ${TEST_DB}.`);
}

const suffix = randomUUID();
const ADMIN_EMAIL = `participant-admin-${suffix}@digital-youth.test`;
const ADMIN_PASSWORD = "Participant-Integration-Admin-2026!";
const PARTICIPANT_EMAIL = `participant-${suffix}@digital-youth.test`;
const PARTICIPANT_PASSWORD = "Participant-Integration-Password-2026!";

let app: Express;
let pool: Pool;
let adminAgent: ReturnType<typeof request.agent>;
let adminCsrf = "";
let adminId = 0;
let participantId = 0;

async function assertTestDatabase(): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS database_name");
  assert.equal(rows[0]?.database_name, TEST_DB, "Unsafe test database connection.");
}

async function cleanup(): Promise<void> {
  if (!pool) return;
  await assertTestDatabase();

  const [participants] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM participant_accounts WHERE email = ?",
    [PARTICIPANT_EMAIL]
  );

  for (const row of participants) {
    const id = Number(row.id);
    await pool.execute("DELETE FROM project_payment_allocations WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_learning_time_logs WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM project_work_logs WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM project_deliverables WHERE submitted_by_participant_id = ?", [id]);
    await pool.execute("DELETE FROM project_agreement_approvals WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM project_disputes WHERE raised_by_participant_id = ?", [id]);
    await pool.execute("DELETE FROM project_participants WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM project_tasks WHERE assigned_participant_id = ?", [id]);
    await pool.execute("DELETE FROM exercise_submissions WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM learning_enrollments WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM digital_youth_audit_events WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_team_members WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_sessions WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_skills WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_interests WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_portfolio_items WHERE participant_id = ?", [id]);
    await pool.execute("DELETE FROM participant_accounts WHERE id = ?", [id]);
  }

  await pool.execute("DELETE FROM participant_invitations WHERE email = ?", [PARTICIPANT_EMAIL]);

  if (adminId) {
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

  await cleanup();

  const passwordHash = await argon2.hash(ADMIN_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });

  await pool.execute(
    `INSERT INTO admin_users (email, display_name, password_hash, is_active)
     VALUES (?, ?, ?, 1)`,
    [ADMIN_EMAIL, "Participant Integration Admin", passwordHash]
  );

  const [admins] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM admin_users WHERE email = ?",
    [ADMIN_EMAIL]
  );
  adminId = Number(admins[0].id);

  adminAgent = request.agent(app);
  const login = await adminAgent.post("/api/auth/login").send({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });

  assert.equal(login.status, 200, JSON.stringify(login.body));
  adminCsrf = login.body.csrfToken;
  assert.ok(typeof adminCsrf === "string" && adminCsrf.length > 0);
});

after(async () => {
  if (!pool) return;
  try {
    await cleanup();
  } finally {
    await pool.end();
  }
});

test("participant invitation, registration, profile, skills, portfolio and authentication", async () => {
  const [sites] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM pilot_sites WHERE code = 'bengaluru' AND is_active = 1 LIMIT 1"
  );
  assert.equal(sites.length, 1, "Bengaluru pilot site must exist.");
  const pilotSiteId = Number(sites[0].id);

  const unauthenticated = await request(app).get("/api/participants/me");
  assert.equal(unauthenticated.status, 401);

  const invite = await adminAgent
    .post("/api/admin/participants/invitations")
    .set("x-csrf-token", adminCsrf)
    .send({
      email: PARTICIPANT_EMAIL,
      displayName: "Integration Participant",
      pilotSiteId,
      expiresInDays: 7
    });

  assert.equal(invite.status, 201, JSON.stringify(invite.body));
  const token = invite.body.invitationToken;
  assert.ok(typeof token === "string" && token.length >= 32);
  assert.equal(invite.body.registrationPath, `/participant?invite=${encodeURIComponent(token)}`);

  const pilotSites = await adminAgent.get("/api/admin/pilot-sites");
  assert.equal(pilotSites.status, 200);
  assert.ok(pilotSites.body.pilotSites.some((site: { id: number }) => Number(site.id) === pilotSiteId));

  const participantAgent = request.agent(app);

  const minor = await participantAgent
    .post("/api/participants/accept-invitation")
    .send({
      token,
      password: PARTICIPANT_PASSWORD,
      dateOfBirth: "2010-01-01",
      adultParticipationConfirmed: true
    });
  assert.equal(minor.status, 400, "Under-18 registration must be rejected.");

  const registration = await participantAgent
    .post("/api/participants/accept-invitation")
    .send({
      token,
      password: PARTICIPANT_PASSWORD,
      dateOfBirth: "1998-04-15",
      adultParticipationConfirmed: true,
      workingModel: "both",
      about: "Integration test participant."
    });

  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  assert.equal(registration.body.authenticated, true);
  assert.ok(registration.body.csrfToken);
  participantId = Number(registration.body.participant.id);

  const reusedInvitation = await request(app)
    .post("/api/participants/accept-invitation")
    .send({
      token,
      password: "Another-Integration-Password-2026!",
      dateOfBirth: "1998-04-15",
      adultParticipationConfirmed: true
    });
  assert.equal(reusedInvitation.status, 400, "An invitation token cannot create a second account.");

  const [accountRows] = await pool.execute<RowDataPacket[]>(
    `SELECT email, pilot_site_id, adult_participation_confirmed, date_of_birth
     FROM participant_accounts WHERE id = ?`,
    [participantId]
  );
  assert.equal(accountRows.length, 1);
  assert.equal(accountRows[0].email, PARTICIPANT_EMAIL);
  assert.equal(Number(accountRows[0].pilot_site_id), pilotSiteId);
  assert.equal(Number(accountRows[0].adult_participation_confirmed), 1);

  let participantCsrf = registration.body.csrfToken;

  const me = await participantAgent.get("/api/participants/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.participant.id, participantId);

  const profile = await participantAgent
    .patch("/api/participants/profile")
    .set("x-csrf-token", participantCsrf)
    .send({
      displayName: "Updated Participant",
      phone: "+919876543210",
      workingModel: "collaborative",
      profileVisibility: "shared_with_coordinators"
    });
  assert.equal(profile.status, 200, JSON.stringify(profile.body));
  assert.equal(profile.body.profile.display_name, "Updated Participant");
  assert.equal(profile.body.profile.working_model, "collaborative");

  const skills = await participantAgent
    .put("/api/participants/skills")
    .set("x-csrf-token", participantCsrf)
    .send({
      items: [
        {
          skillName: "Customer communication",
          proficiency: "developing",
          evidenceNotes: "Practised through simulated exercises."
        },
        {
          skillName: "Spreadsheet management",
          proficiency: "beginner"
        }
      ]
    });
  assert.equal(skills.status, 200, JSON.stringify(skills.body));
  assert.equal(skills.body.skills.length, 2);

  const interests = await participantAgent
    .put("/api/participants/interests")
    .set("x-csrf-token", participantCsrf)
    .send({ items: ["Digital marketing", "Business operations"] });
  assert.equal(interests.status, 200);
  assert.equal(interests.body.interests.length, 2);

  const portfolio = await participantAgent
    .post("/api/participants/portfolio")
    .set("x-csrf-token", participantCsrf)
    .send({
      title: "Sample menu redesign",
      description: "A simulated menu redesign exercise.",
      itemType: "exercise",
      visibility: "coordinators"
    });
  assert.equal(portfolio.status, 201, JSON.stringify(portfolio.body));
  const portfolioId = Number(portfolio.body.id);

  const portfolioUpdate = await participantAgent
    .patch(`/api/participants/portfolio/${portfolioId}`)
    .set("x-csrf-token", participantCsrf)
    .send({ title: "Updated sample menu redesign" });
  assert.equal(portfolioUpdate.status, 200);
  assert.equal(portfolioUpdate.body.item.title, "Updated sample menu redesign");

  const portfolioList = await participantAgent.get("/api/participants/portfolio");
  assert.equal(portfolioList.status, 200);
  assert.equal(portfolioList.body.items.length, 1);

  const coordinatorView = await adminAgent.get(`/api/admin/participants/${participantId}`);
  assert.equal(coordinatorView.status, 200);
  assert.equal(coordinatorView.body.skills.length, 2);

  const skillId = Number(skills.body.skills[0].id);
  const verification = await adminAgent
    .patch(`/api/admin/participants/${participantId}/skills/${skillId}/verification`)
    .set("x-csrf-token", adminCsrf)
    .send({ verified: true });
  assert.equal(verification.status, 200, JSON.stringify(verification.body));

  const [verifiedRows] = await pool.execute<RowDataPacket[]>(
    `SELECT verified_by_admin_id, verified_at FROM participant_skills WHERE id = ?`,
    [skillId]
  );
  assert.equal(Number(verifiedRows[0].verified_by_admin_id), adminId);
  assert.ok(verifiedRows[0].verified_at);

  const logout = await participantAgent
    .post("/api/participants/logout")
    .set("x-csrf-token", participantCsrf)
    .send({});
  assert.equal(logout.status, 200);

  const afterLogout = await participantAgent.get("/api/participants/me");
  assert.equal(afterLogout.status, 401);

  const loginAgent = request.agent(app);
  const login = await loginAgent
    .post("/api/participants/login")
    .send({ email: PARTICIPANT_EMAIL, password: PARTICIPANT_PASSWORD });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  participantCsrf = login.body.csrfToken;

  const authenticatedAgain = await loginAgent.get("/api/participants/me");
  assert.equal(authenticatedAgain.status, 200);

  const badPasswordAgent = request.agent(app);
  const badPassword = await badPasswordAgent
    .post("/api/participants/login")
    .send({ email: PARTICIPANT_EMAIL, password: "incorrect-password" });
  assert.equal(badPassword.status, 401);

  const secondLogout = await loginAgent
    .post("/api/participants/logout")
    .set("x-csrf-token", participantCsrf)
    .send({});
  assert.equal(secondLogout.status, 200);
});
