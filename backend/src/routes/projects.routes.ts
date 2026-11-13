import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { pool } from "../config/database.js";
import { hashToken } from "../services/adminAuth.service.js";
import { requireAdminSession } from "../middleware/requireAdminSession.js";
import { requireCsrf } from "../middleware/requireCsrf.js";
import { requireParticipantSession } from "../middleware/requireParticipantSession.js";
import { requireParticipantCsrf } from "../middleware/requireParticipantCsrf.js";

export const projectAdminRouter = Router();
export const projectParticipantRouter = Router();
export const businessReviewRouter = Router();

const idSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const projectStatuses = [
  "proposed", "demonstration", "business_review", "agreement_pending",
  "agreed", "in_progress", "delivered", "business_verification",
  "completed", "correction_requested", "disputed", "cancelled"
] as const;

const transitions: Record<string, string[]> = {
  proposed: ["demonstration", "business_review", "agreement_pending", "cancelled"],
  demonstration: ["business_review", "agreement_pending", "cancelled"],
  business_review: ["demonstration", "agreement_pending", "cancelled"],
  agreement_pending: ["agreed", "cancelled"],
  agreed: ["in_progress", "cancelled"],
  in_progress: ["delivered", "disputed", "cancelled"],
  delivered: ["business_verification", "correction_requested", "disputed"],
  business_verification: ["completed", "correction_requested", "disputed"],
  correction_requested: ["in_progress", "delivered", "disputed", "cancelled"],
  disputed: ["in_progress", "completed", "cancelled"],
  completed: [],
  cancelled: []
};

type Actor = {
  type: "admin" | "participant" | "business" | "system";
  id?: number;
  tokenId?: number;
};

function adminId(res: { locals: Record<string, any> }): number {
  return Number(res.locals.admin?.id);
}
function participantId(res: { locals: Record<string, any> }): number {
  return Number(res.locals.participant?.id);
}
function isDate(value: string): boolean {
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function audit(
  db: any,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: number,
  metadata: unknown = null
): Promise<void> {
  await db.execute(
    `INSERT INTO digital_youth_audit_events
      (actor_type, admin_user_id, participant_id, event_action,
       entity_type, entity_id, event_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      actor.type,
      actor.type === "admin" ? actor.id ?? null : null,
      actor.type === "participant" ? actor.id ?? null : null,
      action,
      entityType,
      entityId,
      metadata === null ? null : JSON.stringify(metadata)
    ]
  );
}

async function transitionProject(
  db: any,
  projectId: number,
  newStatus: typeof projectStatuses[number],
  actor: Actor,
  reason: string,
  metadata: unknown = null
): Promise<void> {
  const [rows] = await db.execute(
    "SELECT project_status FROM digital_youth_projects WHERE id = ? FOR UPDATE",
    [projectId]
  );
  if (!rows.length) throw new Error("PROJECT_NOT_FOUND");

  const previous = String(rows[0].project_status);
  if (previous === newStatus) return;
  if (!transitions[previous]?.includes(newStatus)) {
    throw new Error(`INVALID_PROJECT_TRANSITION:${previous}:${newStatus}`);
  }

  await db.execute(
    `UPDATE digital_youth_projects
     SET project_status = ?,
         completed_at = CASE WHEN ? = 'completed' THEN UTC_TIMESTAMP() ELSE completed_at END,
         updated_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [newStatus, newStatus, projectId]
  );

  await db.execute(
    `INSERT INTO digital_youth_project_status_history
     (project_id, previous_status, new_status, actor_type,
      admin_user_id, participant_id, business_review_token_id, reason, event_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      projectId,
      previous,
      newStatus,
      actor.type,
      actor.type === "admin" ? actor.id ?? null : null,
      actor.type === "participant" ? actor.id ?? null : null,
      actor.type === "business" ? actor.tokenId ?? null : null,
      reason,
      metadata === null ? null : JSON.stringify(metadata)
    ]
  );

  await audit(db, actor, "project_status_changed", "digital_youth_project", projectId, {
    previousStatus: previous,
    newStatus,
    reason
  });
}

async function validBusinessToken(token: string): Promise<RowDataPacket | null> {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, diagnostic_submission_id, project_id
     FROM business_review_tokens
     WHERE token_hash = ?
       AND expires_at > UTC_TIMESTAMP()
       AND revoked_at IS NULL
       AND project_id IS NOT NULL
     LIMIT 1`,
    [hashToken(token)]
  );
  return rows[0] ?? null;
}

async function participantHasProjectAccess(
  db: any,
  projectId: number,
  participant: number
): Promise<boolean> {
  const [rows] = await db.execute(
    `SELECT pp.id
     FROM project_participants pp
     WHERE pp.project_id = ?
       AND pp.assignment_status IN ('accepted', 'active')
       AND (
         pp.participant_id = ?
         OR pp.team_id IN (
           SELECT tm.team_id FROM participant_team_members tm
           WHERE tm.participant_id = ? AND tm.left_at IS NULL
         )
       )
     LIMIT 1`,
    [projectId, participant, participant]
  );
  return rows.length > 0;
}

async function assignedParticipantIds(db: any, projectId: number): Promise<number[]> {
  const [rows] = await db.execute(
    `SELECT DISTINCT assigned.participant_id
     FROM (
       SELECT pp.participant_id
       FROM project_participants pp
       WHERE pp.project_id = ?
         AND pp.participant_id IS NOT NULL
         AND pp.assignment_status IN ('accepted', 'active')
       UNION
       SELECT tm.participant_id
       FROM project_participants pp
       INNER JOIN participant_team_members tm
         ON tm.team_id = pp.team_id AND tm.left_at IS NULL
       WHERE pp.project_id = ?
         AND pp.team_id IS NOT NULL
         AND pp.assignment_status IN ('accepted', 'active')
     ) assigned
     WHERE assigned.participant_id IS NOT NULL`,
    [projectId, projectId]
  );
  return rows.map((row: RowDataPacket) => Number(row.participant_id));
}

async function latestDecision(
  db: any,
  agreementId: number,
  approverType: "business" | "participant",
  participant?: number
): Promise<string | null> {
  const participantClause = approverType === "participant" ? "AND participant_id = ?" : "";
  const values = approverType === "participant" ? [agreementId, approverType, participant] : [agreementId, approverType];

  const [rows] = await db.execute(
    `SELECT decision
     FROM project_agreement_approvals
     WHERE agreement_id = ? AND approver_type = ? ${participantClause}
     ORDER BY decided_at DESC, id DESC LIMIT 1`,
    values
  );
  return rows[0] ? String(rows[0].decision) : null;
}

// =====================================================================
// ADMIN / COORDINATOR ROUTES
// Mounted at /api/admin
// =====================================================================

projectAdminRouter.use(requireAdminSession);

// GET /api/admin/diagnostics
projectAdminRouter.get("/diagnostics", async (req, res, next) => {
  const page = z.coerce.number().int().min(1).max(100000).default(1).safeParse(req.query.page);
  const limit = z.coerce.number().int().min(1).max(100).default(20).safeParse(req.query.limit);
  const status = z.enum(["new", "under_review", "prioritised", "deferred", "rejected", "matched", "resolved"])
    .optional().safeParse(req.query.status);

  if (!page.success || !limit.success || !status.success) {
    return res.status(400).json({ error: "Invalid diagnostic filters." });
  }

  try {
    const where = status.data ? "WHERE d.review_status = ?" : "";
    const values: any[] = status.data ? [status.data] : [];
    const offset = (page.data - 1) * limit.data;

    const [[count], [diagnostics]] = await Promise.all([
      pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM field_visit_diagnostic_submissions d ${where}`,
        values
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT d.id, d.submission_uuid, d.business_name, d.business_type,
                d.business_type_other, d.current_tools, d.tools_other,
                d.biggest_operational_pain, d.problem_areas,
                d.contact_name, d.whatsapp_number, d.follow_up_consent,
                d.pilot_site_id, s.code AS pilot_site_code, s.name AS pilot_site,
                d.review_status, d.priority, d.coordinator_notes,
                d.created_at, d.reviewed_at,
                pr.decision AS prioritisation_decision,
                pr.usefulness, pr.solvable, pr.safe_to_deliver,
                pr.measurable, pr.skills_available
         FROM field_visit_diagnostic_submissions d
         INNER JOIN pilot_sites s ON s.id = d.pilot_site_id
         LEFT JOIN diagnostic_prioritisations pr ON pr.diagnostic_submission_id = d.id
         ${where}
         ORDER BY d.created_at DESC, d.id DESC
         LIMIT ? OFFSET ?`,
        [...values, limit.data, offset]
      )
    ]);

    const total = Number(count[0]?.total ?? 0);
    return res.json({
      diagnostics,
      pagination: { page: page.data, limit: limit.data, total, totalPages: Math.ceil(total / limit.data) }
    });
  } catch (error) { return next(error); }
});

// GET /api/admin/diagnostics/:diagnosticId
projectAdminRouter.get("/diagnostics/:diagnosticId", async (req, res, next) => {
  const id = idSchema.safeParse(req.params.diagnosticId);
  if (!id.success) return res.status(400).json({ error: "Invalid diagnostic ID." });

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT d.*, s.code AS pilot_site_code, s.name AS pilot_site,
              pr.id AS prioritisation_id, pr.usefulness, pr.solvable,
              pr.safe_to_deliver, pr.measurable, pr.skills_available,
              pr.decision AS prioritisation_decision, pr.rationale,
              pr.assessed_by_admin_id, pr.assessed_at
       FROM field_visit_diagnostic_submissions d
       INNER JOIN pilot_sites s ON s.id = d.pilot_site_id
       LEFT JOIN diagnostic_prioritisations pr ON pr.diagnostic_submission_id = d.id
       WHERE d.id = ? LIMIT 1`,
      [id.data]
    );
    if (!rows.length) return res.status(404).json({ error: "Diagnostic not found." });

    const [projects] = await pool.execute<RowDataPacket[]>(
      "SELECT id, project_code, title, project_status FROM digital_youth_projects WHERE diagnostic_submission_id = ? ORDER BY id DESC",
      [id.data]
    );

    return res.json({ diagnostic: rows[0], projects });
  } catch (error) { return next(error); }
});

// POST /api/admin/diagnostics/:diagnosticId/prioritisation
projectAdminRouter.post("/diagnostics/:diagnosticId/prioritisation", requireCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.diagnosticId);
  const body = z.object({
    usefulness: z.boolean(),
    solvable: z.boolean(),
    safeToDeliver: z.boolean(),
    measurable: z.boolean(),
    skillsAvailable: z.boolean(),
    decision: z.enum(["prioritised", "deferred", "rejected"]),
    rationale: z.string().trim().min(10).max(5000),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    coordinatorNotes: z.string().trim().max(5000).nullable().optional()
  }).strict().safeParse(req.body);

  if (!id.success || !body.success) {
    return res.status(400).json({ error: "Invalid prioritisation assessment.", details: body.success ? undefined : body.error.issues });
  }
  const d = body.data;
  const allCriteriaPass = d.usefulness && d.solvable && d.safeToDeliver && d.measurable && d.skillsAvailable;

  if (d.decision === "prioritised" && !allCriteriaPass) {
    return res.status(422).json({
      error: "A problem can only be prioritised when all five human assessment criteria pass."
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [diagnostics] = await connection.execute<RowDataPacket[]>(
      "SELECT id, review_status FROM field_visit_diagnostic_submissions WHERE id = ? FOR UPDATE",
      [id.data]
    );
    if (!diagnostics.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Diagnostic not found." });
    }
    if (["matched", "resolved"].includes(String(diagnostics[0].review_status))) {
      await connection.rollback();
      return res.status(409).json({ error: "A matched or resolved diagnostic cannot be re-prioritised." });
    }

    await connection.execute(
      `INSERT INTO diagnostic_prioritisations
       (diagnostic_submission_id, usefulness, solvable, safe_to_deliver,
        measurable, skills_available, decision, rationale, assessed_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         usefulness = VALUES(usefulness),
         solvable = VALUES(solvable),
         safe_to_deliver = VALUES(safe_to_deliver),
         measurable = VALUES(measurable),
         skills_available = VALUES(skills_available),
         decision = VALUES(decision),
         rationale = VALUES(rationale),
         assessed_by_admin_id = VALUES(assessed_by_admin_id),
         assessed_at = UTC_TIMESTAMP(),
         updated_at = UTC_TIMESTAMP()`,
      [
        id.data, d.usefulness, d.solvable, d.safeToDeliver,
        d.measurable, d.skillsAvailable, d.decision, d.rationale, adminId(res)
      ]
    );

    const reviewStatus = d.decision;
    await connection.execute(
      `UPDATE field_visit_diagnostic_submissions
       SET review_status = ?, priority = ?, coordinator_notes = ?,
           reviewed_by_admin_id = ?, reviewed_at = UTC_TIMESTAMP(),
           updated_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [reviewStatus, d.priority, d.coordinatorNotes ?? null, adminId(res), id.data]
    );

    await audit(connection, { type: "admin", id: adminId(res) },
      "diagnostic_prioritised", "field_visit_diagnostic_submission", id.data, d);

    await connection.commit();
    return res.status(200).json({ message: "Human prioritisation saved.", decision: d.decision });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    return next(error);
  } finally { connection.release(); }
});

// GET /api/admin/projects
projectAdminRouter.get("/projects", async (req, res, next) => {
  const page = z.coerce.number().int().min(1).max(100000).default(1).safeParse(req.query.page);
  const limit = z.coerce.number().int().min(1).max(100).default(20).safeParse(req.query.limit);
  const status = z.enum(projectStatuses).optional().safeParse(req.query.status);
  const site = z.coerce.number().int().positive().optional().safeParse(req.query.pilotSiteId);

  if (!page.success || !limit.success || !status.success || !site.success) {
    return res.status(400).json({ error: "Invalid project filters." });
  }

  try {
    const clauses: string[] = [];
    const values: any[] = [];
    if (status.data) { clauses.push("p.project_status = ?"); values.push(status.data); }
    if (site.data) { clauses.push("p.pilot_site_id = ?"); values.push(site.data); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const offset = (page.data - 1) * limit.data;

    const [[count], [projects]] = await Promise.all([
      pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM digital_youth_projects p ${where}`,
        values
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT p.id, p.project_code, p.title, p.objective, p.project_status,
                p.target_completion_date, p.created_at, s.name AS pilot_site,
                d.id AS diagnostic_id, d.business_name, d.business_type,
                (SELECT COUNT(*) FROM project_participants pp WHERE pp.project_id = p.id) AS assignment_count,
                (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id) AS task_count
         FROM digital_youth_projects p
         INNER JOIN pilot_sites s ON s.id = p.pilot_site_id
         INNER JOIN field_visit_diagnostic_submissions d ON d.id = p.diagnostic_submission_id
         ${where}
         ORDER BY p.updated_at DESC, p.id DESC
         LIMIT ? OFFSET ?`,
        [...values, limit.data, offset]
      )
    ]);

    const total = Number(count[0]?.total ?? 0);
    return res.json({
      projects,
      pagination: { page: page.data, limit: limit.data, total, totalPages: Math.ceil(total / limit.data) }
    });
  } catch (error) { return next(error); }
});

// POST /api/admin/projects
projectAdminRouter.post("/projects", requireCsrf, async (req, res, next) => {
  const body = z.object({
    diagnosticSubmissionId: z.number().int().positive(),
    title: z.string().trim().min(3).max(180),
    objective: z.string().trim().min(10).max(10000),
    proposedSolution: z.string().trim().min(10).max(10000),
    riskNotes: z.string().trim().max(5000).nullable().optional(),
    targetCompletionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
  }).strict().safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "Invalid project details.", details: body.error.issues });
  if (body.data.targetCompletionDate && !isDate(body.data.targetCompletionDate)) {
    return res.status(400).json({ error: "Invalid target completion date." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [diagnostics] = await connection.execute<RowDataPacket[]>(
      `SELECT d.id, d.pilot_site_id, d.review_status, pr.decision
       FROM field_visit_diagnostic_submissions d
       INNER JOIN diagnostic_prioritisations pr ON pr.diagnostic_submission_id = d.id
       WHERE d.id = ? FOR UPDATE`,
      [body.data.diagnosticSubmissionId]
    );

    if (!diagnostics.length || diagnostics[0].decision !== "prioritised") {
      await connection.rollback();
      return res.status(409).json({ error: "Only a human-prioritised business problem can become a project." });
    }

    const projectCode = `DY-${Number(diagnostics[0].pilot_site_id)}-${randomBytes(5).toString("hex").toUpperCase()}`;

    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO digital_youth_projects
       (project_code, pilot_site_id, diagnostic_submission_id, title, objective,
        proposed_solution, risk_notes, project_status, target_completion_date, created_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)`,
      [
        projectCode, diagnostics[0].pilot_site_id, body.data.diagnosticSubmissionId,
        body.data.title, body.data.objective, body.data.proposedSolution,
        body.data.riskNotes ?? null, body.data.targetCompletionDate ?? null, adminId(res)
      ]
    );

    const projectId = Number(insert.insertId);

    await connection.execute(
      `INSERT INTO digital_youth_project_status_history
       (project_id, previous_status, new_status, actor_type, admin_user_id, reason)
       VALUES (?, NULL, 'proposed', 'admin', ?, 'Project created from human-prioritised diagnostic')`,
      [projectId, adminId(res)]
    );

    await connection.execute(
      "UPDATE field_visit_diagnostic_submissions SET review_status = 'matched', updated_at = UTC_TIMESTAMP() WHERE id = ?",
      [body.data.diagnosticSubmissionId]
    );

    await audit(connection, { type: "admin", id: adminId(res) },
      "project_created", "digital_youth_project", projectId, {
        projectCode, diagnosticSubmissionId: body.data.diagnosticSubmissionId
      });

    await connection.commit();
    return res.status(201).json({ projectId, projectCode, projectStatus: "proposed" });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    return next(error);
  } finally { connection.release(); }
});

// GET /api/admin/projects/:projectId
projectAdminRouter.get("/projects/:projectId", async (req, res, next) => {
  const id = idSchema.safeParse(req.params.projectId);
  if (!id.success) return res.status(400).json({ error: "Invalid project ID." });

  try {
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.*, s.code AS pilot_site_code, s.name AS pilot_site,
              d.business_name, d.business_type, d.biggest_operational_pain,
              d.problem_areas, d.contact_name, d.whatsapp_number, d.follow_up_consent
       FROM digital_youth_projects p
       INNER JOIN pilot_sites s ON s.id = p.pilot_site_id
       INNER JOIN field_visit_diagnostic_submissions d ON d.id = p.diagnostic_submission_id
       WHERE p.id = ? LIMIT 1`,
      [id.data]
    );
    if (!projects.length) return res.status(404).json({ error: "Project not found." });

    const [assignments] = await pool.execute<RowDataPacket[]>(
      `SELECT pp.id, pp.participant_id, pp.team_id, pp.assignment_role, pp.assignment_status,
              p.display_name AS participant_name, t.name AS team_name, pp.assigned_at, pp.accepted_at
       FROM project_participants pp
       LEFT JOIN participant_accounts p ON p.id = pp.participant_id
       LEFT JOIN participant_teams t ON t.id = pp.team_id
       WHERE pp.project_id = ? ORDER BY pp.assigned_at`,
      [id.data]
    );
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.*, p.display_name AS assignee_name
       FROM project_tasks t
       LEFT JOIN participant_accounts p ON p.id = t.assigned_participant_id
       WHERE t.project_id = ? ORDER BY t.created_at, t.id`,
      [id.data]
    );
    const [agreements] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM project_agreements WHERE project_id = ? ORDER BY version_number DESC",
      [id.data]
    );
    const [deliverables] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM project_deliverables WHERE project_id = ? ORDER BY submitted_at DESC",
      [id.data]
    );
    const [history] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM digital_youth_project_status_history WHERE project_id = ? ORDER BY created_at, id",
      [id.data]
    );
    const [disputes] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM project_disputes WHERE project_id = ? ORDER BY created_at DESC",
      [id.data]
    );
    const [payments] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM project_payments WHERE project_id = ? ORDER BY created_at DESC",
      [id.data]
    );

    return res.json({
      project: projects[0], assignments, tasks, agreements, deliverables, history, disputes, payments
    });
  } catch (error) { return next(error); }
});

// PATCH /api/admin/projects/:projectId/status
projectAdminRouter.patch("/projects/:projectId/status", requireCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.projectId);
  const body = z.object({
    status: z.enum(projectStatuses),
    reason: z.string().trim().min(5).max(1000)
  }).strict().safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ error: "Invalid project status update." });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await transitionProject(connection, id.data, body.data.status,
      { type: "admin", id: adminId(res) }, body.data.reason);
    await connection.commit();
    return res.json({ message: "Project status updated.", status: body.data.status });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") return res.status(404).json({ error: "Project not found." });
    if (error instanceof Error && error.message.startsWith("INVALID_PROJECT_TRANSITION:")) return res.status(409).json({ error: error.message });
    return next(error);
  } finally { connection.release(); }
});

// POST /api/admin/projects/:projectId/assignments
projectAdminRouter.post("/projects/:projectId/assignments", requireCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.projectId);
  const body = z.object({
    participantId: z.number().int().positive().optional(),
    teamId: z.number().int().positive().optional(),
    assignmentRole: z.string().trim().min(2).max(120).default("contributor")
  }).strict().refine(value => Boolean(value.participantId) !== Boolean(value.teamId)).safeParse(req.body);

  if (!id.success || !body.success) return res.status(400).json({ error: "Provide exactly one participantId or teamId.", details: body.success ? undefined : body.error.issues });

  try {
    const [projects] = await pool.execute<RowDataPacket[]>(
      "SELECT pilot_site_id FROM digital_youth_projects WHERE id = ? LIMIT 1",
      [id.data]
    );
    if (!projects.length) return res.status(404).json({ error: "Project not found." });

    if (body.data.participantId) {
      const [people] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM participant_accounts WHERE id = ? AND pilot_site_id = ? AND account_status = 'active' LIMIT 1",
        [body.data.participantId, projects[0].pilot_site_id]
      );
      if (!people.length) return res.status(400).json({ error: "Participant must be active and belong to the project's pilot site." });

      const [existing] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM project_participants WHERE project_id = ? AND participant_id = ? AND assignment_status <> 'removed' LIMIT 1",
        [id.data, body.data.participantId]
      );
      if (existing.length) return res.status(409).json({ error: "Participant is already assigned." });
    }

    if (body.data.teamId) {
      const [teams] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM participant_teams WHERE id = ? AND pilot_site_id = ? AND team_status = 'active' LIMIT 1",
        [body.data.teamId, projects[0].pilot_site_id]
      );
      if (!teams.length) return res.status(400).json({ error: "Team must be active and belong to the project's pilot site." });

      const [existing] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM project_participants WHERE project_id = ? AND team_id = ? AND assignment_status <> 'removed' LIMIT 1",
        [id.data, body.data.teamId]
      );
      if (existing.length) return res.status(409).json({ error: "Team is already assigned." });
    }

    const [insert] = await pool.execute<ResultSetHeader>(
      `INSERT INTO project_participants
       (project_id, participant_id, team_id, assignment_role, assignment_status, assigned_by_admin_id)
       VALUES (?, ?, ?, ?, 'invited', ?)`,
      [id.data, body.data.participantId ?? null, body.data.teamId ?? null, body.data.assignmentRole, adminId(res)]
    );

    await audit(pool, { type: "admin", id: adminId(res) },
      "project_assignment_created", "project_participant", Number(insert.insertId), body.data);

    return res.status(201).json({ assignmentId: Number(insert.insertId), assignmentStatus: "invited" });
  } catch (error) { return next(error); }
});

// POST /api/admin/projects/:projectId/tasks
projectAdminRouter.post("/projects/:projectId/tasks", requireCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.projectId);
  const body = z.object({
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(5).max(5000),
    assignedParticipantId: z.number().int().positive().nullable().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
  }).strict().safeParse(req.body);

  if (!id.success || !body.success) return res.status(400).json({ error: "Invalid project task.", details: body.success ? undefined : body.error.issues });
  if (body.data.dueDate && !isDate(body.data.dueDate)) return res.status(400).json({ error: "Invalid task due date." });

  try {
    const [projects] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM digital_youth_projects WHERE id = ? LIMIT 1", [id.data]
    );
    if (!projects.length) return res.status(404).json({ error: "Project not found." });

    if (body.data.assignedParticipantId) {
      const [assignment] = await pool.execute<RowDataPacket[]>(
        `SELECT pp.id FROM project_participants pp
         WHERE pp.project_id = ?
           AND pp.assignment_status <> 'removed'
           AND (
             pp.participant_id = ?
             OR pp.team_id IN (
               SELECT team_id FROM participant_team_members
               WHERE participant_id = ? AND left_at IS NULL
             )
           )
         LIMIT 1`,
        [id.data, body.data.assignedParticipantId, body.data.assignedParticipantId]
      );
      if (!assignment.length) return res.status(400).json({ error: "Task assignee must be assigned to this project." });
    }

    const [insert] = await pool.execute<ResultSetHeader>(
      `INSERT INTO project_tasks
       (project_id, title, description, assigned_participant_id, due_date, created_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id.data, body.data.title, body.data.description, body.data.assignedParticipantId ?? null, body.data.dueDate ?? null, adminId(res)]
    );

    await audit(pool, { type: "admin", id: adminId(res) },
      "project_task_created", "project_task", Number(insert.insertId), { projectId: id.data });

    return res.status(201).json({ taskId: Number(insert.insertId) });
  } catch (error) { return next(error); }
});

// PATCH /api/admin/projects/:projectId/tasks/:taskId
projectAdminRouter.patch("/projects/:projectId/tasks/:taskId", requireCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const task = idSchema.safeParse(req.params.taskId);
  const body = z.object({
    title: z.string().trim().min(3).max(180).optional(),
    description: z.string().trim().min(5).max(5000).optional(),
    assignedParticipantId: z.number().int().positive().nullable().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    taskStatus: z.enum(["todo", "in_progress", "blocked", "submitted", "completed"]).optional()
  }).strict().refine(value => Object.keys(value).length > 0).safeParse(req.body);

  if (!project.success || !task.success || !body.success) return res.status(400).json({ error: "Invalid task update." });
  if (body.data.dueDate && !isDate(body.data.dueDate)) return res.status(400).json({ error: "Invalid due date." });

  const mapping: Record<string, string> = {
    title: "title",
    description: "description",
    assignedParticipantId: "assigned_participant_id",
    dueDate: "due_date",
    taskStatus: "task_status"
  };

  try {
    const [existing] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM project_tasks WHERE id = ? AND project_id = ? LIMIT 1",
      [task.data, project.data]
    );
    if (!existing.length) return res.status(404).json({ error: "Task not found." });

    const entries = Object.entries(body.data);
    const sets = entries.map(([key]) => `${mapping[key]} = ?`);
    const values = entries.map(([, value]) => value);
    if (body.data.taskStatus) {
      sets.push("completed_at = ?");
      values.push(body.data.taskStatus === "completed" ? new Date().toISOString().slice(0, 19).replace("T", " ") : null);
    }
    sets.push("updated_at = UTC_TIMESTAMP()");

    await pool.execute(
      `UPDATE project_tasks SET ${sets.join(", ")} WHERE id = ? AND project_id = ?`,
      [...values, task.data, project.data]
    );

    await audit(pool, { type: "admin", id: adminId(res) },
      "project_task_updated", "project_task", task.data, body.data);

    return res.json({ message: "Task updated." });
  } catch (error) { return next(error); }
});

// POST /api/admin/projects/:projectId/agreements
projectAdminRouter.post("/projects/:projectId/agreements", requireCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.projectId);
  const body = z.object({
    scopeOfWork: z.string().trim().min(10).max(20000),
    deliverables: z.array(z.object({
      title: z.string().trim().min(2).max(180),
      description: z.string().trim().max(2000).optional()
    }).strict()).min(1).max(50),
    price: z.number().min(0).max(9999999999.99),
    currency: z.enum(["INR", "IDR"]),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    acceptanceCriteria: z.string().trim().min(10).max(10000),
    responsiblePayer: z.string().trim().min(2).max(180),
    paymentTerms: z.string().trim().max(5000).nullable().optional()
  }).strict().safeParse(req.body);

  if (!id.success || !body.success) return res.status(400).json({ error: "Invalid project agreement.", details: body.success ? undefined : body.error.issues });
  if (!isDate(body.data.deadline) || new Date(`${body.data.deadline}T00:00:00Z`).getTime() < Date.now() - 86400000) {
    return res.status(400).json({ error: "Agreement deadline must be a valid date." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [projects] = await connection.execute<RowDataPacket[]>(
      "SELECT id, project_status FROM digital_youth_projects WHERE id = ? FOR UPDATE",
      [id.data]
    );
    if (!projects.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Project not found." });
    }
    if (!["proposed", "demonstration", "business_review", "agreement_pending"].includes(String(projects[0].project_status))) {
      await connection.rollback();
      return res.status(409).json({ error: "A new agreement can only be drafted before commercial work begins." });
    }

    const [activeDrafts] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM project_agreements
       WHERE project_id = ? AND agreement_status IN ('draft', 'pending_approval')
       LIMIT 1`,
      [id.data]
    );
    if (activeDrafts.length) {
      await connection.rollback();
      return res.status(409).json({ error: "Resolve or withdraw the existing draft/pending agreement first." });
    }

    const [versions] = await connection.execute<RowDataPacket[]>(
      "SELECT COALESCE(MAX(version_number), 0) AS current_version FROM project_agreements WHERE project_id = ?",
      [id.data]
    );
    const version = Number(versions[0].current_version) + 1;
    const d = body.data;

    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO project_agreements
       (project_id, version_number, scope_of_work, deliverables, price, currency,
        deadline, acceptance_criteria, responsible_payer, payment_terms,
        agreement_status, created_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [
        id.data, version, d.scopeOfWork, JSON.stringify(d.deliverables),
        d.price, d.currency, d.deadline, d.acceptanceCriteria,
        d.responsiblePayer, d.paymentTerms ?? null, adminId(res)
      ]
    );

    await audit(connection, { type: "admin", id: adminId(res) },
      "project_agreement_drafted", "project_agreement", Number(insert.insertId), { version });

    await connection.commit();
    return res.status(201).json({ agreementId: Number(insert.insertId), version, status: "draft" });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    return next(error);
  } finally { connection.release(); }
});

// POST /api/admin/projects/:projectId/agreements/:agreementId/send
projectAdminRouter.post("/projects/:projectId/agreements/:agreementId/send", requireCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const agreement = idSchema.safeParse(req.params.agreementId);
  if (!project.success || !agreement.success) return res.status(400).json({ error: "Invalid project or agreement ID." });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [agreements] = await connection.execute<RowDataPacket[]>(
      `SELECT a.id, a.agreement_status, p.diagnostic_submission_id, p.project_status
       FROM project_agreements a
       INNER JOIN digital_youth_projects p ON p.id = a.project_id
       WHERE a.id = ? AND a.project_id = ? FOR UPDATE`,
      [agreement.data, project.data]
    );
    if (!agreements.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Project agreement not found." });
    }
    if (agreements[0].agreement_status !== "draft") {
      await connection.rollback();
      return res.status(409).json({ error: "Only a draft agreement can be sent for approval." });
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 19).replace("T", " ");

    await connection.execute(
      `INSERT INTO business_review_tokens
       (diagnostic_submission_id, project_id, token_hash, expires_at, created_by_admin_id)
       VALUES (?, ?, ?, ?, ?)`,
      [agreements[0].diagnostic_submission_id, project.data, hashToken(token), expiresAt, adminId(res)]
    );

    await connection.execute(
      "UPDATE project_agreements SET agreement_status = 'pending_approval' WHERE id = ?",
      [agreement.data]
    );

    if (agreements[0].project_status !== "agreement_pending") {
      await transitionProject(connection, project.data, "agreement_pending",
        { type: "admin", id: adminId(res) }, "Agreement sent for business and participant approval.");
    }

    await audit(connection, { type: "admin", id: adminId(res) },
      "project_agreement_sent", "project_agreement", agreement.data, { expiresAt });

    await connection.commit();

    return res.status(201).json({
      message: "Agreement sent for approval.",
      expiresAt,
      businessReviewPath: `/business/review/${token}`,
      businessReviewToken: token
    });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (error instanceof Error && error.message.startsWith("INVALID_PROJECT_TRANSITION:")) {
      return res.status(409).json({ error: error.message });
    }
    return next(error);
  } finally { connection.release(); }
});

// POST /api/admin/projects/:projectId/agreements/:agreementId/activate
projectAdminRouter.post("/projects/:projectId/agreements/:agreementId/activate", requireCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const agreement = idSchema.safeParse(req.params.agreementId);
  if (!project.success || !agreement.success) return res.status(400).json({ error: "Invalid project or agreement ID." });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [agreements] = await connection.execute<RowDataPacket[]>(
      `SELECT id, agreement_status FROM project_agreements
       WHERE id = ? AND project_id = ? FOR UPDATE`,
      [agreement.data, project.data]
    );
    if (!agreements.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Agreement not found." });
    }
    if (agreements[0].agreement_status !== "pending_approval") {
      await connection.rollback();
      return res.status(409).json({ error: "Only a pending agreement can be activated." });
    }

    const businessDecision = await latestDecision(connection, agreement.data, "business");
    if (businessDecision !== "approved") {
      await connection.rollback();
      return res.status(409).json({ error: "Business approval is required before activation." });
    }

    const assigned = await assignedParticipantIds(connection, project.data);
    if (!assigned.length) {
      await connection.rollback();
      return res.status(409).json({ error: "At least one participant must accept the project before agreement activation." });
    }

    for (const personId of assigned) {
      const decision = await latestDecision(connection, agreement.data, "participant", personId);
      if (decision !== "approved") {
        await connection.rollback();
        return res.status(409).json({ error: `Participant ${personId} has not approved the agreement.` });
      }
    }

    await connection.execute(
      `UPDATE project_agreements
       SET agreement_status = 'superseded'
       WHERE project_id = ? AND id <> ? AND agreement_status = 'approved'`,
      [project.data, agreement.data]
    );
    await connection.execute(
      `UPDATE project_agreements
       SET agreement_status = 'approved', approved_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [agreement.data]
    );

    await transitionProject(connection, project.data, "agreed",
      { type: "admin", id: adminId(res) }, "Business and all assigned participants approved the agreement.");

    await connection.commit();
    return res.json({ message: "Agreement activated. Commercial work may begin.", status: "approved" });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (error instanceof Error && error.message.startsWith("INVALID_PROJECT_TRANSITION:")) {
      return res.status(409).json({ error: error.message });
    }
    return next(error);
  } finally { connection.release(); }
});

// GET /api/admin/projects/:projectId/deliverables
projectAdminRouter.get("/projects/:projectId/deliverables", async (req, res, next) => {
  const id = idSchema.safeParse(req.params.projectId);
  if (!id.success) return res.status(400).json({ error: "Invalid project ID." });

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT d.*, p.display_name AS submitted_by
       FROM project_deliverables d
       INNER JOIN participant_accounts p ON p.id = d.submitted_by_participant_id
       WHERE d.project_id = ? ORDER BY d.submitted_at DESC`,
      [id.data]
    );
    return res.json({ deliverables: rows });
  } catch (error) { return next(error); }
});

// POST /api/admin/projects/:projectId/verification
projectAdminRouter.post("/projects/:projectId/verification", requireCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const body = z.object({
    deliverableId: z.number().int().positive().nullable().optional(),
    decision: z.enum(["accepted", "revision_requested", "disputed"]),
    feedback: z.string().trim().min(5).max(10000)
  }).strict().safeParse(req.body);

  if (!project.success || !body.success) return res.status(400).json({ error: "Invalid coordinator verification.", details: body.success ? undefined : body.error.issues });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [projects] = await connection.execute<RowDataPacket[]>(
      "SELECT project_status FROM digital_youth_projects WHERE id = ? FOR UPDATE",
      [project.data]
    );
    if (!projects.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Project not found." });
    }

    if (body.data.deliverableId) {
      const [deliverables] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM project_deliverables WHERE id = ? AND project_id = ? FOR UPDATE",
        [body.data.deliverableId, project.data]
      );
      if (!deliverables.length) {
        await connection.rollback();
        return res.status(404).json({ error: "Deliverable not found for this project." });
      }
    }

    await connection.execute(
      `INSERT INTO project_verification_reviews
       (project_id, deliverable_id, reviewer_type, reviewed_by_admin_id, decision, feedback)
       VALUES (?, ?, 'coordinator', ?, ?, ?)`,
      [project.data, body.data.deliverableId ?? null, adminId(res), body.data.decision, body.data.feedback]
    );

    if (body.data.deliverableId) {
      const deliveryStatus = body.data.decision === "accepted"
        ? "accepted"
        : "revision_requested";
      await connection.execute(
        "UPDATE project_deliverables SET delivery_status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?",
        [deliveryStatus, body.data.deliverableId]
      );
    }

    if (body.data.decision === "disputed") {
      await connection.execute(
        `INSERT INTO project_disputes
         (project_id, raised_by_type, raised_by_admin_id, reason)
         VALUES (?, 'coordinator', ?, ?)`,
        [project.data, adminId(res), body.data.feedback]
      );
      await transitionProject(connection, project.data, "disputed",
        { type: "admin", id: adminId(res) }, body.data.feedback);
    } else if (body.data.decision === "revision_requested") {
      await transitionProject(connection, project.data, "correction_requested",
        { type: "admin", id: adminId(res) }, body.data.feedback);
    } else {
      const [pending] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM project_deliverables
         WHERE project_id = ? AND delivery_status <> 'accepted'`,
        [project.data]
      );
      const [total] = await connection.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM project_deliverables WHERE project_id = ?",
        [project.data]
      );

      if (Number(total[0].total) > 0 && Number(pending[0].total) === 0) {
        const current = String(projects[0].project_status);
        if (current === "in_progress") {
          await transitionProject(connection, project.data, "delivered",
            { type: "admin", id: adminId(res) }, "All submitted deliverables accepted by coordinator.");
          await transitionProject(connection, project.data, "business_verification",
            { type: "admin", id: adminId(res) }, "Project ready for business verification.");
        } else if (current === "delivered") {
          await transitionProject(connection, project.data, "business_verification",
            { type: "admin", id: adminId(res) }, "Project ready for business verification.");
        }
      }
    }

    await audit(connection, { type: "admin", id: adminId(res) },
      "coordinator_verification_recorded", "digital_youth_project", project.data, body.data);

    await connection.commit();
    return res.json({ message: "Coordinator verification recorded.", decision: body.data.decision });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (error instanceof Error && error.message.startsWith("INVALID_PROJECT_TRANSITION:")) {
      return res.status(409).json({ error: error.message });
    }
    return next(error);
  } finally { connection.release(); }
});

// POST /api/admin/projects/:projectId/disputes/:disputeId/resolve
projectAdminRouter.post("/projects/:projectId/disputes/:disputeId/resolve", requireCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const dispute = idSchema.safeParse(req.params.disputeId);
  const body = z.object({
    resolutionStatus: z.enum(["investigating", "resolved", "closed"]),
    resolutionNotes: z.string().trim().min(5).max(10000)
  }).strict().safeParse(req.body);

  if (!project.success || !dispute.success || !body.success) return res.status(400).json({ error: "Invalid dispute resolution." });

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE project_disputes
       SET resolution_status = ?, resolution_notes = ?,
           resolved_by_admin_id = ?, resolved_at = CASE WHEN ? IN ('resolved','closed') THEN UTC_TIMESTAMP() ELSE resolved_at END
       WHERE id = ? AND project_id = ? AND resolution_status IN ('open','investigating')`,
      [body.data.resolutionStatus, body.data.resolutionNotes, adminId(res),
        body.data.resolutionStatus, dispute.data, project.data]
    );

    if (!result.affectedRows) return res.status(404).json({ error: "Open dispute not found." });

    await audit(pool, { type: "admin", id: adminId(res) },
      "project_dispute_updated", "project_dispute", dispute.data, body.data);

    if (["resolved", "closed"].includes(body.data.resolutionStatus)) {
      const [open] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM project_disputes
         WHERE project_id = ? AND resolution_status IN ('open','investigating')`,
        [project.data]
      );

      if (Number(open[0].total) === 0) {
        const [projects] = await pool.execute<RowDataPacket[]>(
          "SELECT project_status FROM digital_youth_projects WHERE id = ?",
          [project.data]
        );
        if (projects[0]?.project_status === "disputed") {
          const connection = await pool.getConnection();
          try {
            await connection.beginTransaction();
            await transitionProject(connection, project.data, "in_progress",
              { type: "admin", id: adminId(res) }, "All project disputes resolved.");
            await connection.commit();
          } catch (error) {
            await connection.rollback().catch(() => undefined);
            throw error;
          } finally { connection.release(); }
        }
      }
    }

    return res.json({ message: "Dispute updated.", resolutionStatus: body.data.resolutionStatus });
  } catch (error) { return next(error); }
});

// POST /api/admin/projects/:projectId/payments
projectAdminRouter.post("/projects/:projectId/payments", requireCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const body = z.object({
    agreementId: z.number().int().positive(),
    payerName: z.string().trim().min(2).max(180),
    recipientDescription: z.string().trim().min(2).max(255),
    amount: z.number().positive().max(9999999999.99),
    currency: z.enum(["INR", "IDR"]),
    paymentReference: z.string().trim().max(180).nullable().optional(),
    paymentEvidenceUrl: z.string().url().max(1000).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional()
  }).strict().safeParse(req.body);

  if (!project.success || !body.success) return res.status(400).json({ error: "Invalid payment record.", details: body.success ? undefined : body.error.issues });
  if (body.data.paymentEvidenceUrl && !validHttpUrl(body.data.paymentEvidenceUrl)) {
    return res.status(400).json({ error: "Payment evidence URL must use HTTP or HTTPS." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [agreements] = await connection.execute<RowDataPacket[]>(
      `SELECT a.id, a.price, a.currency, a.agreement_status, p.project_status
       FROM project_agreements a
       INNER JOIN digital_youth_projects p ON p.id = a.project_id
       WHERE a.id = ? AND a.project_id = ? FOR UPDATE`,
      [body.data.agreementId, project.data]
    );
    if (!agreements.length || agreements[0].agreement_status !== "approved") {
      await connection.rollback();
      return res.status(409).json({ error: "Payment must reference an approved agreement for this project." });
    }
    if (!["agreed", "in_progress", "delivered", "business_verification", "completed"].includes(String(agreements[0].project_status))) {
      await connection.rollback();
      return res.status(409).json({ error: "Project is not at a stage where commercial payment can be recorded." });
    }
    if (agreements[0].currency !== body.data.currency) {
      await connection.rollback();
      return res.status(400).json({ error: "Payment currency must match the approved agreement." });
    }

    const [sums] = await connection.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount), 0) AS recorded
       FROM project_payments
       WHERE agreement_id = ? AND payment_status <> 'refunded'`,
      [body.data.agreementId]
    );
    const recorded = Math.round(Number(sums[0].recorded) * 100);
    const requested = Math.round(body.data.amount * 100);
    const agreed = Math.round(Number(agreements[0].price) * 100);
    if (recorded + requested > agreed) {
      await connection.rollback();
      return res.status(422).json({ error: "Recorded business payments cannot exceed the approved agreement price." });
    }

    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO project_payments
       (project_id, agreement_id, payer_name, recipient_description,
        amount, currency, payment_status, payment_reference,
        payment_evidence_url, recorded_by_admin_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [
        project.data, body.data.agreementId, body.data.payerName,
        body.data.recipientDescription, body.data.amount, body.data.currency,
        body.data.paymentReference ?? null, body.data.paymentEvidenceUrl ?? null,
        adminId(res), body.data.notes ?? null
      ]
    );

    await audit(connection, { type: "admin", id: adminId(res) },
      "business_payment_recorded", "project_payment", Number(insert.insertId), {
        amount: body.data.amount, currency: body.data.currency
      });

    await connection.commit();
    return res.status(201).json({
      paymentId: Number(insert.insertId),
      paymentStatus: "pending",
      message: "Payment recorded as pending verification."
    });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    return next(error);
  } finally { connection.release(); }
});

// PATCH /api/admin/projects/:projectId/payments/:paymentId/verify
projectAdminRouter.patch("/projects/:projectId/payments/:paymentId/verify", requireCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const payment = idSchema.safeParse(req.params.paymentId);
  const body = z.object({
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    paymentReference: z.string().trim().max(180).nullable().optional()
  }).strict().safeParse(req.body);

  if (!project.success || !payment.success || !body.success) return res.status(400).json({ error: "Invalid payment verification." });
  if (!isDate(body.data.paymentDate) || new Date(`${body.data.paymentDate}T00:00:00Z`).getTime() > Date.now()) {
    return res.status(400).json({ error: "Payment date must be valid and cannot be in the future." });
  }

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT payment_status, payment_reference FROM project_payments WHERE id = ? AND project_id = ? LIMIT 1",
      [payment.data, project.data]
    );
    if (!rows.length) return res.status(404).json({ error: "Payment not found." });
    if (rows[0].payment_status !== "pending") return res.status(409).json({ error: "Only pending payments can be verified." });

    const reference = body.data.paymentReference ?? rows[0].payment_reference;
    if (!reference) return res.status(422).json({ error: "A payment reference is required to verify receipt." });

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE project_payments
       SET payment_status = 'received', payment_date = ?,
           payment_reference = ?, verified_by_admin_id = ?, verified_at = UTC_TIMESTAMP(),
           updated_at = UTC_TIMESTAMP()
       WHERE id = ? AND project_id = ? AND payment_status = 'pending'`,
      [body.data.paymentDate, reference, adminId(res), payment.data, project.data]
    );
    if (!result.affectedRows) return res.status(409).json({ error: "Payment was changed by another request." });

    await audit(pool, { type: "admin", id: adminId(res) },
      "business_payment_verified", "project_payment", payment.data, { paymentDate: body.data.paymentDate });

    return res.json({ message: "Business payment receipt verified.", paymentStatus: "received" });
  } catch (error) { return next(error); }
});

// PUT /api/admin/projects/:projectId/payments/:paymentId/allocations
projectAdminRouter.put("/projects/:projectId/payments/:paymentId/allocations", requireCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const payment = idSchema.safeParse(req.params.paymentId);
  const body = z.object({
    allocations: z.array(z.object({
      participantId: z.number().int().positive(),
      amount: z.number().positive().max(9999999999.99)
    }).strict()).min(1).max(100)
  }).strict().safeParse(req.body);

  if (!project.success || !payment.success || !body.success) return res.status(400).json({ error: "Invalid participant income allocations.", details: body.success ? undefined : body.error.issues });

  const recipientIds = body.data.allocations.map(item => item.participantId);
  if (new Set(recipientIds).size !== recipientIds.length) {
    return res.status(400).json({ error: "Each participant can only appear once in an allocation." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [payments] = await connection.execute<RowDataPacket[]>(
      `SELECT id, amount, currency, payment_status
       FROM project_payments WHERE id = ? AND project_id = ? FOR UPDATE`,
      [payment.data, project.data]
    );
    if (!payments.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Payment not found." });
    }
    if (payments[0].payment_status !== "received") {
      await connection.rollback();
      return res.status(409).json({ error: "Only verified received payments can be allocated." });
    }

    const totalCents = body.data.allocations.reduce(
      (sum, item) => sum + Math.round(item.amount * 100), 0
    );
    const paymentCents = Math.round(Number(payments[0].amount) * 100);
    if (totalCents !== paymentCents) {
      await connection.rollback();
      return res.status(422).json({
        error: "Participant allocations must equal the full verified payment amount exactly.",
        paymentAmount: Number(payments[0].amount),
        allocationTotal: totalCents / 100
      });
    }

    const [existingPaid] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM project_payment_allocations
       WHERE project_payment_id = ? AND allocation_status = 'paid' LIMIT 1`,
      [payment.data]
    );
    if (existingPaid.length) {
      await connection.rollback();
      return res.status(409).json({ error: "Payment allocations cannot be replaced after any participant has been paid." });
    }

    for (const item of body.data.allocations) {
      const access = await participantHasProjectAccess(connection, project.data, item.participantId);
      if (!access) {
        await connection.rollback();
        return res.status(400).json({ error: `Participant ${item.participantId} is not an accepted project member.` });
      }
    }

    await connection.execute(
      "DELETE FROM project_payment_allocations WHERE project_payment_id = ?",
      [payment.data]
    );

    for (const item of body.data.allocations) {
      await connection.execute(
        `INSERT INTO project_payment_allocations
         (project_payment_id, participant_id, allocation_amount, currency, allocation_status, recorded_by_admin_id)
         VALUES (?, ?, ?, ?, 'allocated', ?)`,
        [payment.data, item.participantId, item.amount, payments[0].currency, adminId(res)]
      );
    }

    await audit(connection, { type: "admin", id: adminId(res) },
      "participant_payment_allocations_created", "project_payment", payment.data, {
        allocations: body.data.allocations,
        total: totalCents / 100,
        currency: payments[0].currency
      });

    await connection.commit();
    return res.status(200).json({
      message: "100% of the verified payment has been allocated to project participants.",
      allocationCount: body.data.allocations.length,
      totalAllocated: totalCents / 100,
      currency: payments[0].currency,
      platformCommission: 0
    });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    return next(error);
  } finally { connection.release(); }
});

// PATCH /api/admin/projects/:projectId/payments/:paymentId/allocations/:allocationId/payout
projectAdminRouter.patch("/projects/:projectId/payments/:paymentId/allocations/:allocationId/payout", requireCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const payment = idSchema.safeParse(req.params.paymentId);
  const allocation = idSchema.safeParse(req.params.allocationId);
  const body = z.object({
    payoutMethod: z.enum(["bank_transfer", "upi", "cash", "other"]),
    payoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    payoutReference: z.string().trim().max(180).nullable().optional(),
    payoutEvidenceUrl: z.string().url().max(1000).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional()
  }).strict().safeParse(req.body);

  if (!project.success || !payment.success || !allocation.success || !body.success) return res.status(400).json({ error: "Invalid participant payout." });
  if (!isDate(body.data.payoutDate) || new Date(`${body.data.payoutDate}T00:00:00Z`).getTime() > Date.now()) {
    return res.status(400).json({ error: "Payout date must be valid and cannot be in the future." });
  }
  if (body.data.payoutEvidenceUrl && !validHttpUrl(body.data.payoutEvidenceUrl)) {
    return res.status(400).json({ error: "Payout evidence URL must use HTTP or HTTPS." });
  }

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE project_payment_allocations a
       INNER JOIN project_payments p ON p.id = a.project_payment_id
       SET a.allocation_status = 'paid',
           a.payout_method = ?,
           a.payout_date = ?,
           a.payout_reference = ?,
           a.payout_evidence_url = ?,
           a.notes = ?,
           a.verified_by_admin_id = ?,
           a.verified_at = UTC_TIMESTAMP(),
           a.updated_at = UTC_TIMESTAMP()
       WHERE a.id = ? AND a.project_payment_id = ?
         AND p.project_id = ?
         AND p.payment_status = 'received'
         AND a.allocation_status = 'allocated'`,
      [
        body.data.payoutMethod, body.data.payoutDate, body.data.payoutReference ?? null,
        body.data.payoutEvidenceUrl ?? null, body.data.notes ?? null, adminId(res),
        allocation.data, payment.data, project.data
      ]
    );

    if (!result.affectedRows) return res.status(404).json({ error: "Unpaid allocation for this received project payment was not found." });

    await audit(pool, { type: "admin", id: adminId(res) },
      "participant_payout_verified", "project_payment_allocation", allocation.data, body.data);

    return res.json({ message: "Participant payout recorded and verified.", allocationStatus: "paid" });
  } catch (error) { return next(error); }
});

// GET /api/admin/projects/:projectId/payments
projectAdminRouter.get("/projects/:projectId/payments", async (req, res, next) => {
  const id = idSchema.safeParse(req.params.projectId);
  if (!id.success) return res.status(400).json({ error: "Invalid project ID." });

  try {
    const [payments] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM project_payments WHERE project_id = ? ORDER BY created_at DESC",
      [id.data]
    );
    const [allocations] = await pool.execute<RowDataPacket[]>(
      `SELECT a.*, p.display_name, p.email
       FROM project_payment_allocations a
       INNER JOIN project_payments pm ON pm.id = a.project_payment_id
       INNER JOIN participant_accounts p ON p.id = a.participant_id
       WHERE pm.project_id = ?
       ORDER BY a.created_at, a.id`,
      [id.data]
    );
    return res.json({ payments, allocations });
  } catch (error) { return next(error); }
});

// =====================================================================
// PARTICIPANT PROJECT ROUTES
// Mounted at /api/projects
// =====================================================================

projectParticipantRouter.use(requireParticipantSession);

// GET /api/projects
projectParticipantRouter.get("/", async (req, res, next) => {
  try {
    const id = participantId(res);
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT p.id, p.project_code, p.title, p.objective,
              p.proposed_solution, p.project_status, p.target_completion_date,
              pp.id AS assignment_id, pp.assignment_role, pp.assignment_status,
              pp.assigned_at, pp.accepted_at,
              d.business_name, s.name AS pilot_site
       FROM project_participants pp
       INNER JOIN digital_youth_projects p ON p.id = pp.project_id
       INNER JOIN field_visit_diagnostic_submissions d ON d.id = p.diagnostic_submission_id
       INNER JOIN pilot_sites s ON s.id = p.pilot_site_id
       WHERE pp.assignment_status <> 'removed'
         AND (
           pp.participant_id = ?
           OR pp.team_id IN (
             SELECT team_id FROM participant_team_members
             WHERE participant_id = ? AND left_at IS NULL
           )
         )
       ORDER BY pp.assigned_at DESC`,
      [id, id]
    );
    return res.json({ projects });
  } catch (error) { return next(error); }
});

// POST /api/projects/:projectId/assignments/:assignmentId/respond
projectParticipantRouter.post("/:projectId/assignments/:assignmentId/respond", requireParticipantCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const assignment = idSchema.safeParse(req.params.assignmentId);
  const body = z.object({ response: z.enum(["accepted", "declined"]) }).strict().safeParse(req.body);

  if (!project.success || !assignment.success || !body.success) return res.status(400).json({ error: "Invalid project assignment response." });

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE project_participants pp
       SET pp.assignment_status = ?,
           pp.accepted_at = CASE WHEN ? = 'accepted' THEN UTC_TIMESTAMP() ELSE NULL END
       WHERE pp.id = ? AND pp.project_id = ?
         AND pp.assignment_status = 'invited'
         AND (
           pp.participant_id = ?
           OR pp.team_id IN (
             SELECT team_id FROM participant_team_members
             WHERE participant_id = ? AND left_at IS NULL
           )
         )`,
      [
        body.data.response, body.data.response, assignment.data,
        project.data, participantId(res), participantId(res)
      ]
    );

    if (!result.affectedRows) return res.status(404).json({ error: "Pending assignment for this participant was not found." });

    await audit(pool, { type: "participant", id: participantId(res) },
      "project_assignment_responded", "project_participant", assignment.data, body.data);

    return res.json({ message: "Project assignment response saved.", status: body.data.response });
  } catch (error) { return next(error); }
});

// PATCH /api/projects/tasks/:taskId
projectParticipantRouter.patch("/tasks/:taskId", requireParticipantCsrf, async (req, res, next) => {
  const task = idSchema.safeParse(req.params.taskId);
  const body = z.object({
    taskStatus: z.enum(["in_progress", "blocked", "submitted", "completed"])
  }).strict().safeParse(req.body);

  if (!task.success || !body.success) return res.status(400).json({ error: "Invalid task update." });

  try {
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.id, t.project_id
       FROM project_tasks t
       WHERE t.id = ? AND t.assigned_participant_id = ? LIMIT 1`,
      [task.data, participantId(res)]
    );
    if (!tasks.length) return res.status(404).json({ error: "Task is not assigned to this participant." });

    if (!await participantHasProjectAccess(pool, Number(tasks[0].project_id), participantId(res))) {
      return res.status(403).json({ error: "Participant has not accepted this project assignment." });
    }

    await pool.execute(
      `UPDATE project_tasks SET task_status = ?,
       completed_at = CASE WHEN ? = 'completed' THEN UTC_TIMESTAMP() ELSE NULL END,
       updated_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [body.data.taskStatus, body.data.taskStatus, task.data]
    );

    await audit(pool, { type: "participant", id: participantId(res) },
      "project_task_updated_by_participant", "project_task", task.data, body.data);

    return res.json({ message: "Task updated.", status: body.data.taskStatus });
  } catch (error) { return next(error); }
});

// POST /api/projects/:projectId/deliverables
projectParticipantRouter.post("/:projectId/deliverables", requireParticipantCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const body = z.object({
    taskId: z.number().int().positive().nullable().optional(),
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(5).max(10000),
    resourceUrl: z.string().url().max(1000).nullable().optional(),
    evidenceNotes: z.string().trim().max(5000).nullable().optional()
  }).strict().safeParse(req.body);

  if (!project.success || !body.success) return res.status(400).json({ error: "Invalid deliverable.", details: body.success ? undefined : body.error.issues });
  if (body.data.resourceUrl && !validHttpUrl(body.data.resourceUrl)) return res.status(400).json({ error: "Resource URL must use HTTP or HTTPS." });

  try {
    if (!await participantHasProjectAccess(pool, project.data, participantId(res))) {
      return res.status(403).json({ error: "An accepted project assignment is required." });
    }

    const [projects] = await pool.execute<RowDataPacket[]>(
      "SELECT project_status FROM digital_youth_projects WHERE id = ? LIMIT 1",
      [project.data]
    );
    if (!projects.length) return res.status(404).json({ error: "Project not found." });
    if (!["in_progress", "correction_requested"].includes(String(projects[0].project_status))) {
      return res.status(409).json({ error: "Project is not accepting deliverables at this stage." });
    }

    if (body.data.taskId) {
      const [tasks] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM project_tasks WHERE id = ? AND project_id = ? LIMIT 1",
        [body.data.taskId, project.data]
      );
      if (!tasks.length) return res.status(400).json({ error: "Task does not belong to this project." });
    }

    const [insert] = await pool.execute<ResultSetHeader>(
      `INSERT INTO project_deliverables
       (project_id, task_id, submitted_by_participant_id, title, description, resource_url, evidence_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        project.data, body.data.taskId ?? null, participantId(res),
        body.data.title, body.data.description, body.data.resourceUrl ?? null,
        body.data.evidenceNotes ?? null
      ]
    );

    await audit(pool, { type: "participant", id: participantId(res) },
      "project_deliverable_submitted", "project_deliverable", Number(insert.insertId), { projectId: project.data });

    return res.status(201).json({ deliverableId: Number(insert.insertId), deliveryStatus: "submitted" });
  } catch (error) { return next(error); }
});

// POST /api/projects/:projectId/work-logs
projectParticipantRouter.post("/:projectId/work-logs", requireParticipantCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const body = z.object({
    workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    minutesWorked: z.number().int().min(1).max(1440),
    workType: z.enum(["demonstration", "commercial"]),
    description: z.string().trim().min(5).max(3000)
  }).strict().safeParse(req.body);

  if (!project.success || !body.success) return res.status(400).json({ error: "Invalid project work log." });
  if (!isDate(body.data.workDate) || new Date(`${body.data.workDate}T00:00:00Z`).getTime() > Date.now()) {
    return res.status(400).json({ error: "Work date must be valid and not in the future." });
  }

  try {
    if (!await participantHasProjectAccess(pool, project.data, participantId(res))) {
      return res.status(403).json({ error: "An accepted project assignment is required." });
    }

    const [projects] = await pool.execute<RowDataPacket[]>(
      "SELECT project_status FROM digital_youth_projects WHERE id = ? LIMIT 1",
      [project.data]
    );
    if (!projects.length) return res.status(404).json({ error: "Project not found." });
    if (body.data.workType === "commercial" && !["agreed", "in_progress", "delivered", "business_verification"].includes(String(projects[0].project_status))) {
      return res.status(409).json({ error: "Commercial work can only be logged after an approved agreement is activated." });
    }
    if (body.data.workType === "demonstration" && !["demonstration", "business_review", "agreement_pending"].includes(String(projects[0].project_status))) {
      return res.status(409).json({ error: "Demonstration work is not allowed at this project stage." });
    }

    const [insert] = await pool.execute<ResultSetHeader>(
      `INSERT INTO project_work_logs
       (project_id, participant_id, work_date, minutes_worked, work_type, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        project.data, participantId(res), body.data.workDate,
        body.data.minutesWorked, body.data.workType, body.data.description
      ]
    );

    await audit(pool, { type: "participant", id: participantId(res) },
      "project_work_logged", "project_work_log", Number(insert.insertId), body.data);

    return res.status(201).json({ workLogId: Number(insert.insertId), approvalStatus: "pending" });
  } catch (error) { return next(error); }
});

// POST /api/projects/:projectId/agreements/:agreementId/approval
projectParticipantRouter.post("/:projectId/agreements/:agreementId/approval", requireParticipantCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const agreement = idSchema.safeParse(req.params.agreementId);
  const body = z.object({
    decision: z.enum(["approved", "rejected", "changes_requested"]),
    comments: z.string().trim().max(5000).nullable().optional()
  }).strict().safeParse(req.body);

  if (!project.success || !agreement.success || !body.success) return res.status(400).json({ error: "Invalid agreement approval." });

  try {
    const member = await participantHasProjectAccess(pool, project.data, participantId(res));
    if (!member) return res.status(403).json({ error: "Only accepted project members can approve the agreement." });

    const [agreements] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM project_agreements WHERE id = ? AND project_id = ? AND agreement_status = 'pending_approval' LIMIT 1",
      [agreement.data, project.data]
    );
    if (!agreements.length) return res.status(404).json({ error: "Pending agreement not found." });

    await pool.execute(
      `INSERT INTO project_agreement_approvals
       (agreement_id, approver_type, participant_id, decision, comments)
       VALUES (?, 'participant', ?, ?, ?)`,
      [agreement.data, participantId(res), body.data.decision, body.data.comments ?? null]
    );

    await audit(pool, { type: "participant", id: participantId(res) },
      "project_agreement_decided", "project_agreement", agreement.data, body.data);

    return res.status(201).json({ message: "Participant agreement decision recorded.", decision: body.data.decision });
  } catch (error) { return next(error); }
});

// POST /api/projects/:projectId/disputes
projectParticipantRouter.post("/:projectId/disputes", requireParticipantCsrf, async (req, res, next) => {
  const project = idSchema.safeParse(req.params.projectId);
  const body = z.object({ reason: z.string().trim().min(10).max(10000) }).strict().safeParse(req.body);
  if (!project.success || !body.success) return res.status(400).json({ error: "Invalid dispute reason." });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (!await participantHasProjectAccess(connection, project.data, participantId(res))) {
      await connection.rollback();
      return res.status(403).json({ error: "An accepted project assignment is required." });
    }
    const [projects] = await connection.execute<RowDataPacket[]>(
      "SELECT project_status FROM digital_youth_projects WHERE id = ? FOR UPDATE",
      [project.data]
    );
    if (!projects.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Project not found." });
    }
    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO project_disputes
       (project_id, raised_by_type, raised_by_participant_id, reason)
       VALUES (?, 'participant', ?, ?)`,
      [project.data, participantId(res), body.data.reason]
    );
    await transitionProject(connection, project.data, "disputed",
      { type: "participant", id: participantId(res) }, body.data.reason);
    await audit(connection, { type: "participant", id: participantId(res) },
      "project_dispute_raised", "project_dispute", Number(insert.insertId));
    await connection.commit();
    return res.status(201).json({ disputeId: Number(insert.insertId), status: "open" });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (error instanceof Error && error.message.startsWith("INVALID_PROJECT_TRANSITION:")) return res.status(409).json({ error: error.message });
    return next(error);
  } finally { connection.release(); }
});

// =====================================================================
// BUSINESS REVIEW ROUTES
// Mounted at /api/business
// A high-entropy, expiring URL token is the business's bearer credential.
// =====================================================================

// GET /api/business/review/:token
businessReviewRouter.get("/review/:token", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const token = await validBusinessToken(req.params.token);
    if (!token) return res.status(401).json({ error: "Business review link is invalid, expired or revoked." });

    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.id, p.project_code, p.title, p.objective, p.proposed_solution,
              p.project_status, p.target_completion_date,
              d.business_name, d.business_type, s.name AS pilot_site
       FROM digital_youth_projects p
       INNER JOIN field_visit_diagnostic_submissions d ON d.id = p.diagnostic_submission_id
       INNER JOIN pilot_sites s ON s.id = p.pilot_site_id
       WHERE p.id = ? LIMIT 1`,
      [token.project_id]
    );
    if (!projects.length) return res.status(404).json({ error: "Project not found." });

    const [agreements] = await pool.execute<RowDataPacket[]>(
      `SELECT id, version_number, scope_of_work, deliverables, price, currency,
              deadline, acceptance_criteria, responsible_payer, payment_terms, agreement_status
       FROM project_agreements
       WHERE project_id = ? AND agreement_status IN ('pending_approval', 'approved')
       ORDER BY version_number DESC LIMIT 1`,
      [token.project_id]
    );
    const [deliverables] = await pool.execute<RowDataPacket[]>(
      `SELECT id, title, description, resource_url, evidence_notes, delivery_status, submitted_at
       FROM project_deliverables WHERE project_id = ?
       ORDER BY submitted_at DESC`,
      [token.project_id]
    );

    await pool.execute("UPDATE business_review_tokens SET last_used_at = UTC_TIMESTAMP() WHERE id = ?", [token.id]);

    return res.json({
      project: projects[0],
      agreement: agreements[0] ?? null,
      deliverables
    });
  } catch (error) { return next(error); }
});

// POST /api/business/review/:token/agreements/:agreementId/decision
businessReviewRouter.post("/review/:token/agreements/:agreementId/decision", async (req, res, next) => {
  const agreement = idSchema.safeParse(req.params.agreementId);
  const body = z.object({
    decision: z.enum(["approved", "rejected", "changes_requested"]),
    comments: z.string().trim().max(5000).nullable().optional()
  }).strict().safeParse(req.body);
  if (!agreement.success || !body.success) return res.status(400).json({ error: "Invalid business agreement decision." });

  try {
    const token = await validBusinessToken(req.params.token);
    if (!token) return res.status(401).json({ error: "Business review link is invalid, expired or revoked." });

    const [agreements] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM project_agreements
       WHERE id = ? AND project_id = ? AND agreement_status = 'pending_approval'
       LIMIT 1`,
      [agreement.data, token.project_id]
    );
    if (!agreements.length) return res.status(404).json({ error: "Pending agreement not found for this business link." });

    await pool.execute(
      `INSERT INTO project_agreement_approvals
       (agreement_id, approver_type, business_review_token_id, decision, comments)
       VALUES (?, 'business', ?, ?, ?)`,
      [agreement.data, token.id, body.data.decision, body.data.comments ?? null]
    );

    await pool.execute("UPDATE business_review_tokens SET last_used_at = UTC_TIMESTAMP() WHERE id = ?", [token.id]);

    await audit(pool, { type: "business", tokenId: Number(token.id) },
      "business_agreement_decided", "project_agreement", agreement.data, body.data);

    return res.status(201).json({ message: "Business agreement decision recorded.", decision: body.data.decision });
  } catch (error) { return next(error); }
});

// POST /api/business/review/:token/verification
businessReviewRouter.post("/review/:token/verification", async (req, res, next) => {
  const body = z.object({
    deliverableId: z.number().int().positive().nullable().optional(),
    decision: z.enum(["accepted", "revision_requested", "disputed"]),
    feedback: z.string().trim().min(5).max(10000)
  }).strict().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid business verification.", details: body.error.issues });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const token = await validBusinessToken(req.params.token);
    if (!token) {
      await connection.rollback();
      return res.status(401).json({ error: "Business review link is invalid, expired or revoked." });
    }

    const [projects] = await connection.execute<RowDataPacket[]>(
      "SELECT project_status FROM digital_youth_projects WHERE id = ? FOR UPDATE",
      [token.project_id]
    );
    if (!projects.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Project not found." });
    }
    if (projects[0].project_status !== "business_verification") {
      await connection.rollback();
      return res.status(409).json({ error: "Project is not awaiting business verification." });
    }

    if (body.data.deliverableId) {
      const [deliverables] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM project_deliverables WHERE id = ? AND project_id = ? FOR UPDATE",
        [body.data.deliverableId, token.project_id]
      );
      if (!deliverables.length) {
        await connection.rollback();
        return res.status(404).json({ error: "Deliverable not found for this project." });
      }
    }

    await connection.execute(
      `INSERT INTO project_verification_reviews
       (project_id, deliverable_id, reviewer_type, business_review_token_id, decision, feedback)
       VALUES (?, ?, 'business', ?, ?, ?)`,
      [token.project_id, body.data.deliverableId ?? null, token.id, body.data.decision, body.data.feedback]
    );

    if (body.data.deliverableId) {
      const status = body.data.decision === "accepted" ? "accepted" : "revision_requested";
      await connection.execute(
        "UPDATE project_deliverables SET delivery_status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?",
        [status, body.data.deliverableId]
      );
    }

    if (body.data.decision === "disputed") {
      await connection.execute(
        `INSERT INTO project_disputes
         (project_id, raised_by_type, business_review_token_id, reason)
         VALUES (?, 'business', ?, ?)`,
        [token.project_id, token.id, body.data.feedback]
      );
      await transitionProject(connection, Number(token.project_id), "disputed",
        { type: "business", tokenId: Number(token.id) }, body.data.feedback);
    } else if (body.data.decision === "revision_requested") {
      await transitionProject(connection, Number(token.project_id), "correction_requested",
        { type: "business", tokenId: Number(token.id) }, body.data.feedback);
    } else {
      const [pending] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM project_deliverables
         WHERE project_id = ? AND delivery_status <> 'accepted'`,
        [token.project_id]
      );
      const [total] = await connection.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM project_deliverables WHERE project_id = ?",
        [token.project_id]
      );
      if (Number(total[0].total) > 0 && Number(pending[0].total) === 0) {
        await transitionProject(connection, Number(token.project_id), "completed",
          { type: "business", tokenId: Number(token.id) }, "Business accepted all project deliverables.");
      } else if (Number(total[0].total) === 0 && !body.data.deliverableId) {
        await connection.rollback();
        return res.status(409).json({ error: "A project without deliverables cannot be marked as accepted." });
      }
    }

    await connection.execute("UPDATE business_review_tokens SET last_used_at = UTC_TIMESTAMP() WHERE id = ?", [token.id]);
    await audit(connection, { type: "business", tokenId: Number(token.id) },
      "business_verification_recorded", "digital_youth_project", Number(token.project_id), body.data);

    await connection.commit();
    return res.status(201).json({ message: "Business verification recorded.", decision: body.data.decision });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (error instanceof Error && error.message.startsWith("INVALID_PROJECT_TRANSITION:")) return res.status(409).json({ error: error.message });
    return next(error);
  } finally { connection.release(); }
});

// POST /api/business/review/:token/disputes
businessReviewRouter.post("/review/:token/disputes", async (req, res, next) => {
  const body = z.object({ reason: z.string().trim().min(10).max(10000) }).strict().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid dispute reason." });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const token = await validBusinessToken(req.params.token);
    if (!token) {
      await connection.rollback();
      return res.status(401).json({ error: "Business review link is invalid, expired or revoked." });
    }

    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO project_disputes
       (project_id, raised_by_type, business_review_token_id, reason)
       VALUES (?, 'business', ?, ?)`,
      [token.project_id, token.id, body.data.reason]
    );

    await transitionProject(connection, Number(token.project_id), "disputed",
      { type: "business", tokenId: Number(token.id) }, body.data.reason);

    await audit(connection, { type: "business", tokenId: Number(token.id) },
      "business_dispute_raised", "project_dispute", Number(insert.insertId));

    await connection.commit();
    return res.status(201).json({ disputeId: Number(insert.insertId), status: "open" });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (error instanceof Error && error.message.startsWith("INVALID_PROJECT_TRANSITION:")) return res.status(409).json({ error: error.message });
    return next(error);
  } finally { connection.release(); }
});
