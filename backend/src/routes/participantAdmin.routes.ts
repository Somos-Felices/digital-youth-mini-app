import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/database.js";
import { hashToken } from "../services/participantAuth.service.js";
import { requireAdminSession } from "../middleware/requireAdminSession.js";
import { requireCsrf } from "../middleware/requireCsrf.js";

const router = Router();
router.use(requireAdminSession);

const idSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const invitationSchema = z.object({
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().min(1).max(140).optional(),
  pilotSiteId: z.number().int().positive(),
  expiresInDays: z.number().int().min(1).max(30).default(7)
}).strict();

// GET /api/admin/pilot-sites
router.get("/pilot-sites", async (_req, res, next) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, code, name FROM pilot_sites WHERE is_active = 1 ORDER BY name, id"
    );
    return res.status(200).json({ pilotSites: rows });
  } catch (error) { next(error); }
});

// GET /api/admin/participants
router.get("/participants", async (req, res, next) => {
  const page = z.coerce.number().int().min(1).max(100000).default(1).safeParse(req.query.page);
  const limit = z.coerce.number().int().min(1).max(100).default(20).safeParse(req.query.limit);
  if (!page.success || !limit.success) return res.status(400).json({ error: "Invalid pagination." });

  try {
    const offset = (page.data - 1) * limit.data;
    const [countRows] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM participant_accounts"
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.id, p.email, p.display_name, p.pilot_site_id, p.phone, p.working_model,
              p.account_status, p.profile_visibility, p.created_at, s.name AS pilot_site
       FROM participant_accounts p
       INNER JOIN pilot_sites s ON s.id = p.pilot_site_id
       ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
      [limit.data, offset]
    );
    const total = Number(countRows[0]?.total ?? 0);
    return res.status(200).json({
      participants: rows,
      pagination: { page: page.data, limit: limit.data, total, totalPages: Math.ceil(total / limit.data) }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/participants/invitations
router.get("/participants/invitations", async (req, res, next) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT i.id, i.email, i.display_name, i.pilot_site_id, s.name AS pilot_site,
              i.expires_at, i.accepted_at, i.revoked_at, i.created_at,
              a.display_name AS invited_by
       FROM participant_invitations i
       INNER JOIN pilot_sites s ON s.id = i.pilot_site_id
       INNER JOIN admin_users a ON a.id = i.invited_by_admin_id
       ORDER BY i.created_at DESC LIMIT 200`
    );
    return res.status(200).json({ invitations: rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/participants/invitations
router.post("/participants/invitations", requireCsrf, async (req, res, next) => {
  const parsed = invitationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid invitation.", details: parsed.error.issues });

  try {
    const email = parsed.data.email.toLowerCase();
    const [accounts] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM participant_accounts WHERE email = ? LIMIT 1",
      [email]
    );
    if (accounts.length) return res.status(409).json({ error: "A participant account already exists for this email." });

    const [sites] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM pilot_sites WHERE id = ? AND is_active = 1 LIMIT 1",
      [parsed.data.pilotSiteId]
    );
    if (!sites.length) return res.status(400).json({ error: "Pilot site is unavailable." });

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 86400000)
      .toISOString().slice(0, 19).replace("T", " ");

    const connection = await pool.getConnection();
    let invitationId = 0;
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE participant_invitations SET revoked_at = UTC_TIMESTAMP()
         WHERE email = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
        [email]
      );
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO participant_invitations
         (email, display_name, pilot_site_id, token_hash, expires_at, invited_by_admin_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          email,
          parsed.data.displayName || null,
          parsed.data.pilotSiteId,
          hashToken(token),
          expiresAt,
          Number(res.locals.admin?.id)
        ]
      );
      invitationId = Number(result.insertId);
      await connection.commit();
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }

    return res.status(201).json({
      invitation: { id: invitationId, email, expiresAt },
      invitationToken: token,
      registrationPath: `/participant?invite=${encodeURIComponent(token)}`,
      note: "Share this one-time token with the invited participant. It is not stored in recoverable form."
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/participants/invitations/:id/revoke
router.post("/participants/invitations/:id/revoke", requireCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Invalid invitation ID." });

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE participant_invitations SET revoked_at = UTC_TIMESTAMP()
       WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
      [id.data]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Active invitation not found." });
    return res.status(200).json({ message: "Invitation revoked." });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/participants/:id
router.get("/participants/:id", async (req, res, next) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Invalid participant ID." });

  try {
    const [participants] = await pool.execute<RowDataPacket[]>(
      `SELECT p.id, p.email, p.display_name, p.pilot_site_id, p.phone, p.about,
              p.working_model, p.date_of_birth, p.account_status,
              p.profile_visibility, p.created_at, s.name AS pilot_site
       FROM participant_accounts p
       INNER JOIN pilot_sites s ON s.id = p.pilot_site_id
       WHERE p.id = ? LIMIT 1`,
      [id.data]
    );
    if (!participants.length) return res.status(404).json({ error: "Participant not found." });

    const [skills] = await pool.execute<RowDataPacket[]>(
      `SELECT id, skill_name, proficiency, evidence_notes, verified_by_admin_id, verified_at
       FROM participant_skills WHERE participant_id = ? ORDER BY skill_name`,
      [id.data]
    );
    const [interests] = await pool.execute<RowDataPacket[]>(
      "SELECT id, interest FROM participant_interests WHERE participant_id = ? ORDER BY interest",
      [id.data]
    );
    const [portfolio] = await pool.execute<RowDataPacket[]>(
      `SELECT id, title, description, item_type, external_url, visibility, created_at
       FROM participant_portfolio_items WHERE participant_id = ? ORDER BY created_at DESC`,
      [id.data]
    );
    return res.status(200).json({ participant: participants[0], skills, interests, portfolio });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/participants/:id/status
router.patch("/participants/:id/status", requireCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.id);
  const body = z.object({ status: z.enum(["active", "suspended", "closed"]) }).strict().safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ error: "Invalid participant status update." });

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      "UPDATE participant_accounts SET account_status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?",
      [body.data.status, id.data]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Participant not found." });
    if (body.data.status !== "active") {
      await pool.execute(
        "UPDATE participant_sessions SET revoked_at = UTC_TIMESTAMP() WHERE participant_id = ? AND revoked_at IS NULL",
        [id.data]
      );
    }
    return res.status(200).json({ message: "Participant status updated.", status: body.data.status });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/participants/:id/skills/:skillId/verification
router.patch("/participants/:id/skills/:skillId/verification", requireCsrf, async (req, res, next) => {
  const participant = idSchema.safeParse(req.params.id);
  const skill = idSchema.safeParse(req.params.skillId);
  const body = z.object({ verified: z.boolean() }).strict().safeParse(req.body);
  if (!participant.success || !skill.success || !body.success) {
    return res.status(400).json({ error: "Invalid skill verification request." });
  }

  try {
    const adminId = Number(res.locals.admin?.id);
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE participant_skills
       SET verified_by_admin_id = ?, verified_at = ?
       WHERE id = ? AND participant_id = ?`,
      [
        body.data.verified ? adminId : null,
        body.data.verified ? new Date() : null,
        skill.data,
        participant.data
      ]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Participant skill not found." });
    return res.status(200).json({ message: "Skill verification updated.", verified: body.data.verified });
  } catch (error) {
    next(error);
  }
});

export default router;
