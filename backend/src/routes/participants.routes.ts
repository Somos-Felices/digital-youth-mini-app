import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import argon2 from "argon2";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { getSessionCookieOptions } from "../config/sessionCookies.js";
import {
  PARTICIPANT_SESSION_COOKIE,
  PARTICIPANT_SESSION_TTL_MS,
  createParticipantSession,
  hashToken,
  revokeParticipantSession,
  rotateParticipantCsrfToken,
  verifyParticipantCredentials
} from "../services/participantAuth.service.js";
import { requireParticipantSession } from "../middleware/requireParticipantSession.js";
import { requireParticipantCsrf } from "../middleware/requireParticipantCsrf.js";

const router = Router();

const cookieOptions = getSessionCookieOptions(env.NODE_ENV);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." }
});

const invitationRegistrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Try again later." }
});

const invitationSchema = z.object({
  token: z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/),
  password: z.string().min(12).max(128),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adultParticipationConfirmed: z.literal(true),
  phone: z.string().trim().max(80).optional().nullable(),
  workingModel: z.enum(["individual", "collaborative", "both"]).default("both"),
  about: z.string().trim().max(2000).optional().nullable()
}).strict();

function isAtLeast18(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - date.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < date.getUTCDate())) age--;
  return age >= 18 && date.getTime() <= now.getTime();
}

const idSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(140).optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  about: z.string().trim().max(2000).nullable().optional(),
  workingModel: z.enum(["individual", "collaborative", "both"]).optional(),
  profileVisibility: z.enum(["private", "shared_with_coordinators", "public_portfolio"]).optional()
}).strict();

const skillListSchema = z.object({
  items: z.array(z.object({
    skillName: z.string().trim().min(1).max(120),
    proficiency: z.enum(["beginner", "developing", "competent", "advanced"]),
    evidenceNotes: z.string().trim().max(2000).optional().nullable()
  }).strict()).max(40)
}).strict();

const interestListSchema = z.object({
  items: z.array(z.string().trim().min(1).max(120)).max(30)
}).strict();

const portfolioSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().min(1).max(5000),
  itemType: z.enum(["exercise", "demonstration", "project", "other"]).default("other"),
  externalUrl: z.string().url().max(1000).refine(v => /^https?:\/\//i.test(v)).nullable().optional(),
  visibility: z.enum(["private", "coordinators", "public"]).default("private")
}).strict();

const portfolioPatchSchema = portfolioSchema.partial().strict();

function participantId(res: { locals: Record<string, any> }): number {
  return Number(res.locals.participant?.id);
}

// POST /api/participants/accept-invitation
router.post("/accept-invitation", invitationRegistrationLimiter, async (req, res, next) => {
  const parsed = invitationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid registration details", details: parsed.error.issues });
  }
  if (!isAtLeast18(parsed.data.dateOfBirth)) {
    return res.status(400).json({ error: "Participants must be at least 18 years old." });
  }

  const data = parsed.data;
  const passwordHash = await argon2.hash(data.password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });

  const connection = await pool.getConnection();
  let createdId = 0;

  try {
    await connection.beginTransaction();

    const [invites] = await connection.execute<RowDataPacket[]>(
      `SELECT id, email, display_name, pilot_site_id
       FROM participant_invitations
       WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL
         AND expires_at > UTC_TIMESTAMP()
       LIMIT 1 FOR UPDATE`,
      [hashToken(data.token)]
    );

    if (!invites.length) {
      await connection.rollback();
      return res.status(400).json({ error: "Invitation is invalid, expired, used or revoked." });
    }

    const invite = invites[0];
    const [existing] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM participant_accounts WHERE email = ? LIMIT 1",
      [invite.email]
    );

    if (existing.length) {
      await connection.rollback();
      return res.status(409).json({ error: "An account already exists for this invitation." });
    }

    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO participant_accounts
       (email, display_name, password_hash, pilot_site_id, phone, about,
        working_model, date_of_birth, adult_participation_confirmed, account_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')`,
      [
        invite.email,
        invite.display_name || invite.email.split("@")[0],
        passwordHash,
        invite.pilot_site_id,
        data.phone || null,
        data.about || null,
        data.workingModel,
        data.dateOfBirth
      ]
    );

    createdId = Number(insert.insertId);

    await connection.execute(
      "UPDATE participant_invitations SET accepted_at = UTC_TIMESTAMP() WHERE id = ? AND accepted_at IS NULL",
      [invite.id]
    );

    await connection.commit();

    const session = await createParticipantSession(createdId);
    res.cookie(PARTICIPANT_SESSION_COOKIE, session.sessionToken, {
      ...cookieOptions,
      maxAge: PARTICIPANT_SESSION_TTL_MS
    });
    res.setHeader("Cache-Control", "no-store");

    return res.status(201).json({
      authenticated: true,
      participant: {
        id: createdId,
        email: invite.email,
        displayName: invite.display_name || invite.email.split("@")[0],
        pilotSiteId: Number(invite.pilot_site_id)
      },
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt
    });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    next(error);
  } finally {
    connection.release();
  }
});

// POST /api/participants/login
router.post("/login", loginLimiter, async (req, res, next) => {
  const parsed = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(128)
  }).strict().safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Invalid login format." });

  try {
    const participant = await verifyParticipantCredentials(parsed.data.email, parsed.data.password);
    if (!participant) return res.status(401).json({ error: "Invalid email or password." });

    const session = await createParticipantSession(participant.id);
    res.cookie(PARTICIPANT_SESSION_COOKIE, session.sessionToken, {
      ...cookieOptions,
      maxAge: PARTICIPANT_SESSION_TTL_MS
    });
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      authenticated: true,
      participant,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt
    });
  } catch (error) {
    next(error);
  }
});

router.use(requireParticipantSession);

// GET /api/participants/me
router.get("/me", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ authenticated: true, participant: res.locals.participant });
});

// GET /api/participants/csrf
router.get("/csrf", async (req, res, next) => {
  try {
    const token = await rotateParticipantCsrfToken(Number(res.locals.participantSessionId));
    return res.status(200).json({ csrfToken: token });
  } catch (error) {
    next(error);
  }
});

// POST /api/participants/logout
router.post("/logout", requireParticipantCsrf, async (req, res, next) => {
  try {
    const token = req.cookies?.[PARTICIPANT_SESSION_COOKIE];
    if (typeof token === "string") await revokeParticipantSession(token);
    res.clearCookie(PARTICIPANT_SESSION_COOKIE, cookieOptions);
    return res.status(200).json({ message: "Logged out successfully." });
  } catch (error) {
    next(error);
  }
});

// GET /api/participants/profile
router.get("/profile", async (req, res, next) => {
  try {
    const id = participantId(res);
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, email, display_name, pilot_site_id, phone, about, working_model,
              date_of_birth, profile_visibility, account_status, created_at, updated_at
       FROM participant_accounts WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Participant not found." });
    return res.status(200).json({ profile: rows[0] });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/participants/profile
router.patch("/profile", requireParticipantCsrf, async (req, res, next) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid profile data.", details: parsed.error.issues });

  const mapping: Record<string, string> = {
    displayName: "display_name",
    phone: "phone",
    about: "about",
    workingModel: "working_model",
    profileVisibility: "profile_visibility"
  };

  const entries = Object.entries(parsed.data).filter(([key]) => Boolean(mapping[key]));
  if (!entries.length) return res.status(400).json({ error: "No profile fields supplied." });

  const sets = entries.map(([key]) => `${mapping[key]} = ?`);
  const values = entries.map(([, value]) => value);
  sets.push("updated_at = UTC_TIMESTAMP()");

  try {
    await pool.execute(
      `UPDATE participant_accounts SET ${sets.join(", ")} WHERE id = ?`,
      [...values, participantId(res)]
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, email, display_name, pilot_site_id, phone, about, working_model,
              date_of_birth, profile_visibility, account_status, updated_at
       FROM participant_accounts WHERE id = ?`,
      [participantId(res)]
    );
    return res.status(200).json({ profile: rows[0] });
  } catch (error) {
    next(error);
  }
});

// GET /api/participants/skills
router.get("/skills", async (req, res, next) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, skill_name, proficiency, evidence_notes, verified_by_admin_id, verified_at, created_at
       FROM participant_skills WHERE participant_id = ? ORDER BY skill_name`,
      [participantId(res)]
    );
    return res.status(200).json({ skills: rows });
  } catch (error) {
    next(error);
  }
});

// PUT /api/participants/skills
router.put("/skills", requireParticipantCsrf, async (req, res, next) => {
  const parsed = skillListSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid skills.", details: parsed.error.issues });

  const names = parsed.data.items.map(v => v.skillName.toLowerCase());
  if (new Set(names).size !== names.length) return res.status(400).json({ error: "Duplicate skills are not allowed." });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const id = participantId(res);
    await connection.execute("DELETE FROM participant_skills WHERE participant_id = ?", [id]);

    for (const skill of parsed.data.items) {
      await connection.execute(
        `INSERT INTO participant_skills (participant_id, skill_name, proficiency, evidence_notes)
         VALUES (?, ?, ?, ?)`,
        [id, skill.skillName, skill.proficiency, skill.evidenceNotes || null]
      );
    }

    await connection.commit();
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, skill_name, proficiency, evidence_notes, verified_by_admin_id, verified_at
       FROM participant_skills WHERE participant_id = ? ORDER BY skill_name`,
      [id]
    );
    return res.status(200).json({ skills: rows });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    next(error);
  } finally {
    connection.release();
  }
});

// GET /api/participants/interests
router.get("/interests", async (req, res, next) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, interest FROM participant_interests WHERE participant_id = ? ORDER BY interest",
      [participantId(res)]
    );
    return res.status(200).json({ interests: rows });
  } catch (error) {
    next(error);
  }
});

// PUT /api/participants/interests
router.put("/interests", requireParticipantCsrf, async (req, res, next) => {
  const parsed = interestListSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid interests.", details: parsed.error.issues });
  const normalized = parsed.data.items.map(v => v.trim());
  if (new Set(normalized.map(v => v.toLowerCase())).size !== normalized.length) {
    return res.status(400).json({ error: "Duplicate interests are not allowed." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const id = participantId(res);
    await connection.execute("DELETE FROM participant_interests WHERE participant_id = ?", [id]);
    for (const interest of normalized) {
      await connection.execute(
        "INSERT INTO participant_interests (participant_id, interest) VALUES (?, ?)",
        [id, interest]
      );
    }
    await connection.commit();
    return res.status(200).json({ interests: normalized });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    next(error);
  } finally {
    connection.release();
  }
});

// GET /api/participants/portfolio
router.get("/portfolio", async (req, res, next) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, title, description, item_type, external_url, visibility, created_at, updated_at
       FROM participant_portfolio_items WHERE participant_id = ? ORDER BY updated_at DESC, id DESC`,
      [participantId(res)]
    );
    return res.status(200).json({ items: rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/participants/portfolio
router.post("/portfolio", requireParticipantCsrf, async (req, res, next) => {
  const parsed = portfolioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid portfolio item.", details: parsed.error.issues });

  try {
    const d = parsed.data;
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO participant_portfolio_items
       (participant_id, title, description, item_type, external_url, visibility)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [participantId(res), d.title, d.description, d.itemType, d.externalUrl || null, d.visibility]
    );
    return res.status(201).json({ id: Number(result.insertId), message: "Portfolio item created." });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/participants/portfolio/:id
router.patch("/portfolio/:id", requireParticipantCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.id);
  const parsed = portfolioPatchSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    return res.status(400).json({ error: "Invalid portfolio update.", details: parsed.success ? undefined : parsed.error.issues });
  }

  const mapping: Record<string, string> = {
    title: "title",
    description: "description",
    itemType: "item_type",
    externalUrl: "external_url",
    visibility: "visibility"
  };
  const entries = Object.entries(parsed.data).filter(([key]) => Boolean(mapping[key]));
  if (!entries.length) return res.status(400).json({ error: "No update fields supplied." });

  try {
    const sets = entries.map(([key]) => `${mapping[key]} = ?`);
    const values = entries.map(([, value]) => value);
    await pool.execute(
      `UPDATE participant_portfolio_items SET ${sets.join(", ")}, updated_at = UTC_TIMESTAMP()
       WHERE id = ? AND participant_id = ?`,
      [...values, id.data, participantId(res)]
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, title, description, item_type, external_url, visibility, updated_at
       FROM participant_portfolio_items WHERE id = ? AND participant_id = ?`,
      [id.data, participantId(res)]
    );
    if (!rows.length) return res.status(404).json({ error: "Portfolio item not found." });
    return res.status(200).json({ item: rows[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/participants/portfolio/:id
router.delete("/portfolio/:id", requireParticipantCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Invalid portfolio item ID." });

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      "DELETE FROM participant_portfolio_items WHERE id = ? AND participant_id = ?",
      [id.data, participantId(res)]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Portfolio item not found." });
    return res.status(200).json({ message: "Portfolio item deleted." });
  } catch (error) {
    next(error);
  }
});

export default router;
