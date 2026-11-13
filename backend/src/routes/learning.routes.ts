import { Router } from "express";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { pool } from "../config/database.js";
import { requireAdminSession } from "../middleware/requireAdminSession.js";
import { requireCsrf } from "../middleware/requireCsrf.js";
import { requireParticipantSession } from "../middleware/requireParticipantSession.js";
import { requireParticipantCsrf } from "../middleware/requireParticipantCsrf.js";

export const learningPublicRouter = Router();
export const learningAdminRouter = Router();

const idSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const moduleCreateSchema = z.object({
  slug: z.string().trim().min(2).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(3).max(180),
  summary: z.string().trim().min(5).max(500),
  contentMarkdown: z.string().trim().min(10).max(50000),
  skillCategory: z.string().trim().min(2).max(120),
  difficulty: z.enum(["introductory", "beginner", "intermediate"]).default("introductory"),
  estimatedMinutes: z.number().int().positive().max(1440).nullable().optional()
}).strict();

const modulePatchSchema = moduleCreateSchema.partial().extend({
  publicationStatus: z.enum(["draft", "published", "archived"]).optional()
}).strict().refine(value => Object.keys(value).length > 0);

const exerciseCreateSchema = z.object({
  title: z.string().trim().min(3).max(180),
  instructions: z.string().trim().min(10).max(20000),
  simulatedMaterials: z.unknown().optional(),
  expectedOutcome: z.string().trim().min(5).max(5000),
  reviewCriteria: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  sortOrder: z.number().int().min(1).max(1000).default(1)
}).strict();

const exercisePatchSchema = exerciseCreateSchema.partial().strict()
  .refine(value => Object.keys(value).length > 0);

const submissionSchema = z.object({
  responseText: z.string().trim().min(5).max(20000),
  resourceUrl: z.string().url().max(1000)
    .refine(value => /^https?:\/\//i.test(value))
    .nullable().optional()
}).strict();

const timeLogSchema = z.object({
  moduleId: z.number().int().positive().nullable().optional(),
  exerciseId: z.number().int().positive().nullable().optional(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minutesSpent: z.number().int().min(1).max(1440),
  activityType: z.enum(["training", "practice"]),
  description: z.string().trim().min(5).max(2000)
}).strict().refine(value => !value.exerciseId || value.moduleId);

const reviewSubmissionSchema = z.object({
  reviewStatus: z.enum(["under_review", "revision_requested", "accepted", "rejected"]),
  feedback: z.string().trim().min(5).max(5000).nullable().optional()
}).strict().refine(value =>
  !["revision_requested", "rejected"].includes(value.reviewStatus) ||
  Boolean(value.feedback && value.feedback.trim().length >= 5)
);

const reviewTimeLogSchema = z.object({
  approvalStatus: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(5).max(1000)
}).strict();

function getParticipantId(res: { locals: Record<string, any> }): number {
  return Number(res.locals.participant?.id);
}

function getAdminId(res: { locals: Record<string, any> }): number {
  return Number(res.locals.admin?.id);
}

function isValidDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function audit(
  actorType: "admin" | "participant" | "system",
  actorId: number | null,
  action: string,
  entityType: string,
  entityId: number,
  metadata: unknown = null
): Promise<void> {
  await pool.execute(
    `INSERT INTO digital_youth_audit_events
      (actor_type, admin_user_id, participant_id, event_action,
       entity_type, entity_id, event_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      actorType,
      actorType === "admin" ? actorId : null,
      actorType === "participant" ? actorId : null,
      action,
      entityType,
      entityId,
      metadata === null ? null : JSON.stringify(metadata)
    ]
  );
}

async function refreshEnrollmentCompletion(
  participantId: number,
  moduleId: number
): Promise<void> {
  await pool.execute(
    `UPDATE learning_enrollments le
     SET enrollment_status = 'completed',
         completed_at = COALESCE(completed_at, UTC_TIMESTAMP())
     WHERE le.participant_id = ?
       AND le.module_id = ?
       AND le.enrollment_status <> 'completed'
       AND EXISTS (
         SELECT 1 FROM learning_exercises e WHERE e.module_id = le.module_id
       )
       AND NOT EXISTS (
         SELECT 1
         FROM learning_exercises e
         WHERE e.module_id = le.module_id
           AND NOT EXISTS (
             SELECT 1 FROM exercise_submissions s
             WHERE s.exercise_id = e.id
               AND s.participant_id = le.participant_id
               AND s.review_status = 'accepted'
           )
       )`,
    [participantId, moduleId]
  );
}

// ---------------------------------------------------------------------
// PUBLIC LEARNING CATALOGUE
// ---------------------------------------------------------------------

learningPublicRouter.get("/modules", async (req, res, next) => {
  const filters = z.object({
    category: z.string().trim().min(1).max(120).optional(),
    difficulty: z.enum(["introductory", "beginner", "intermediate"]).optional()
  }).safeParse(req.query);

  if (!filters.success) {
    return res.status(400).json({ error: "Invalid learning catalogue filters." });
  }

  try {
    const where = ["publication_status = 'published'"];
    const values: any[] = [];

    if (filters.data.category) {
      where.push("skill_category = ?");
      values.push(filters.data.category);
    }
    if (filters.data.difficulty) {
      where.push("difficulty = ?");
      values.push(filters.data.difficulty);
    }

    const [modules] = await pool.execute<RowDataPacket[]>(
      `SELECT m.id, m.slug, m.title, m.summary, m.skill_category,
              m.difficulty, m.estimated_minutes, m.created_at,
              (SELECT COUNT(*) FROM learning_exercises e WHERE e.module_id = m.id) AS exercise_count
       FROM learning_modules m
       WHERE ${where.join(" AND ")}
       ORDER BY m.skill_category, m.title`,
      values
    );

    return res.status(200).json({ modules });
  } catch (error) {
    next(error);
  }
});

learningPublicRouter.get("/modules/:slug", async (req, res, next) => {
  const slug = z.string().min(2).max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).safeParse(req.params.slug);

  if (!slug.success) return res.status(400).json({ error: "Invalid module slug." });

  try {
    const [modules] = await pool.execute<RowDataPacket[]>(
      `SELECT id, slug, title, summary, content_markdown, skill_category,
              difficulty, estimated_minutes
       FROM learning_modules
       WHERE slug = ? AND publication_status = 'published'
       LIMIT 1`,
      [slug.data]
    );

    if (!modules.length) return res.status(404).json({ error: "Learning module not found." });

    const [exercises] = await pool.execute<RowDataPacket[]>(
      `SELECT id, title, instructions, simulated_materials, expected_outcome,
              review_criteria, sort_order
       FROM learning_exercises
       WHERE module_id = ?
       ORDER BY sort_order, id`,
      [modules[0].id]
    );

    return res.status(200).json({ module: modules[0], exercises });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------
// PARTICIPANT LEARNING ACTIONS
// ---------------------------------------------------------------------

learningPublicRouter.use(requireParticipantSession);

learningPublicRouter.post("/modules/:moduleId/enroll", requireParticipantCsrf, async (req, res, next) => {
  const moduleId = idSchema.safeParse(req.params.moduleId);
  if (!moduleId.success) return res.status(400).json({ error: "Invalid module ID." });

  try {
    const [modules] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM learning_modules WHERE id = ? AND publication_status = 'published' LIMIT 1",
      [moduleId.data]
    );

    if (!modules.length) return res.status(404).json({ error: "Published module not found." });

    const participantId = getParticipantId(res);

    await pool.execute(
      `INSERT IGNORE INTO learning_enrollments (participant_id, module_id)
       VALUES (?, ?)`,
      [participantId, moduleId.data]
    );

    const [enrollments] = await pool.execute<RowDataPacket[]>(
      `SELECT id, participant_id, module_id, enrollment_status, enrolled_at, completed_at
       FROM learning_enrollments
       WHERE participant_id = ? AND module_id = ?
       LIMIT 1`,
      [participantId, moduleId.data]
    );

    if (!enrollments.length) {
      return res.status(500).json({ error: "Unable to create learning enrolment." });
    }

    await audit("participant", participantId, "learning_module_enrolled", "learning_enrollment",
      Number(enrollments[0].id), { moduleId: moduleId.data });

    return res.status(200).json({ enrollment: enrollments[0] });
  } catch (error) {
    next(error);
  }
});

learningPublicRouter.get("/enrollments", async (req, res, next) => {
  try {
    const [enrollments] = await pool.execute<RowDataPacket[]>(
      `SELECT e.id, e.enrollment_status, e.enrolled_at, e.completed_at,
              m.id AS module_id, m.slug, m.title, m.summary,
              m.skill_category, m.difficulty, m.estimated_minutes,
              (SELECT COUNT(*) FROM learning_exercises x WHERE x.module_id = m.id) AS exercise_count,
              (SELECT COUNT(DISTINCT x.id)
               FROM learning_exercises x
               INNER JOIN exercise_submissions s
                 ON s.exercise_id = x.id
                AND s.participant_id = e.participant_id
                AND s.review_status = 'accepted'
               WHERE x.module_id = m.id) AS accepted_exercise_count
       FROM learning_enrollments e
       INNER JOIN learning_modules m ON m.id = e.module_id
       WHERE e.participant_id = ?
       ORDER BY e.enrolled_at DESC`,
      [getParticipantId(res)]
    );

    return res.status(200).json({ enrollments });
  } catch (error) {
    next(error);
  }
});

learningPublicRouter.get("/enrollments/:enrollmentId", async (req, res, next) => {
  const id = idSchema.safeParse(req.params.enrollmentId);
  if (!id.success) return res.status(400).json({ error: "Invalid enrollment ID." });

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT e.id, e.enrollment_status, e.enrolled_at, e.completed_at,
              m.id AS module_id, m.slug, m.title, m.summary, m.content_markdown,
              m.skill_category, m.difficulty
       FROM learning_enrollments e
       INNER JOIN learning_modules m ON m.id = e.module_id
       WHERE e.id = ? AND e.participant_id = ?
       LIMIT 1`,
      [id.data, getParticipantId(res)]
    );

    if (!rows.length) return res.status(404).json({ error: "Enrollment not found." });

    const [exercises] = await pool.execute<RowDataPacket[]>(
      `SELECT x.id, x.title, x.instructions, x.expected_outcome,
              x.review_criteria, x.sort_order,
              (SELECT s.review_status FROM exercise_submissions s
               WHERE s.exercise_id = x.id AND s.participant_id = ?
               ORDER BY s.submitted_at DESC, s.id DESC LIMIT 1) AS latest_review_status,
              (SELECT s.feedback FROM exercise_submissions s
               WHERE s.exercise_id = x.id AND s.participant_id = ?
               ORDER BY s.submitted_at DESC, s.id DESC LIMIT 1) AS latest_feedback
       FROM learning_exercises x
       WHERE x.module_id = ?
       ORDER BY x.sort_order, x.id`,
      [getParticipantId(res), getParticipantId(res), rows[0].module_id]
    );

    return res.status(200).json({ enrollment: rows[0], exercises });
  } catch (error) {
    next(error);
  }
});

learningPublicRouter.post("/exercises/:exerciseId/submissions", requireParticipantCsrf, async (req, res, next) => {
  const exerciseId = idSchema.safeParse(req.params.exerciseId);
  const body = submissionSchema.safeParse(req.body);

  if (!exerciseId.success || !body.success) {
    return res.status(400).json({ error: "Invalid exercise submission.", details: body.success ? undefined : body.error.issues });
  }

  try {
    const participantId = getParticipantId(res);
    const [exercises] = await pool.execute<RowDataPacket[]>(
      `SELECT e.id, e.module_id
       FROM learning_exercises e
       INNER JOIN learning_modules m ON m.id = e.module_id
       WHERE e.id = ? AND m.publication_status = 'published'
       LIMIT 1`,
      [exerciseId.data]
    );

    if (!exercises.length) return res.status(404).json({ error: "Published exercise not found." });

    const moduleId = Number(exercises[0].module_id);
    const [enrollments] = await pool.execute<RowDataPacket[]>(
      `SELECT id, enrollment_status
       FROM learning_enrollments
       WHERE participant_id = ? AND module_id = ?
       LIMIT 1`,
      [participantId, moduleId]
    );

    if (!enrollments.length) return res.status(403).json({ error: "Enroll in this module before submitting work." });
    if (enrollments[0].enrollment_status === "completed") {
      return res.status(409).json({ error: "This learning module is already completed." });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO exercise_submissions (exercise_id, participant_id, response_text, resource_url)
       VALUES (?, ?, ?, ?)`,
      [exerciseId.data, participantId, body.data.responseText, body.data.resourceUrl || null]
    );

    await pool.execute(
      `UPDATE learning_enrollments
       SET enrollment_status = 'in_progress'
       WHERE id = ? AND enrollment_status = 'not_started'`,
      [enrollments[0].id]
    );

    await audit("participant", participantId, "learning_exercise_submitted",
      "exercise_submission", Number(result.insertId), { exerciseId: exerciseId.data, moduleId });

    return res.status(201).json({
      submissionId: Number(result.insertId),
      reviewStatus: "submitted",
      message: "Exercise submission received."
    });
  } catch (error) {
    next(error);
  }
});

learningPublicRouter.get("/submissions", async (req, res, next) => {
  try {
    const [submissions] = await pool.execute<RowDataPacket[]>(
      `SELECT s.id, s.response_text, s.resource_url, s.review_status, s.feedback,
              s.submitted_at, s.reviewed_at,
              e.id AS exercise_id, e.title AS exercise_title,
              m.id AS module_id, m.title AS module_title
       FROM exercise_submissions s
       INNER JOIN learning_exercises e ON e.id = s.exercise_id
       INNER JOIN learning_modules m ON m.id = e.module_id
       WHERE s.participant_id = ?
       ORDER BY s.submitted_at DESC, s.id DESC`,
      [getParticipantId(res)]
    );

    return res.status(200).json({ submissions });
  } catch (error) {
    next(error);
  }
});

learningPublicRouter.post("/time-logs", requireParticipantCsrf, async (req, res, next) => {
  const body = timeLogSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid learning time log.", details: body.error.issues });
  if (!isValidDate(body.data.workDate) || new Date(`${body.data.workDate}T00:00:00Z`).getTime() > Date.now()) {
    return res.status(400).json({ error: "Work date must be a valid date that is not in the future." });
  }

  try {
    const participantId = getParticipantId(res);
    const moduleId = body.data.moduleId ?? null;
    const exerciseId = body.data.exerciseId ?? null;

    if (moduleId !== null) {
      const [modules] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM learning_modules WHERE id = ? AND publication_status = 'published' LIMIT 1",
        [moduleId]
      );
      if (!modules.length) return res.status(404).json({ error: "Published module not found." });

      const [enrollments] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM learning_enrollments WHERE participant_id = ? AND module_id = ? LIMIT 1",
        [participantId, moduleId]
      );
      if (!enrollments.length) return res.status(403).json({ error: "Enroll in the module before logging its time." });
    }

    if (exerciseId !== null) {
      const [exercises] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM learning_exercises WHERE id = ? AND module_id = ? LIMIT 1",
        [exerciseId, moduleId]
      );
      if (!exercises.length) return res.status(400).json({ error: "Exercise does not belong to the selected module." });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO participant_learning_time_logs
       (participant_id, module_id, exercise_id, work_date, minutes_spent, activity_type, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        participantId, moduleId, exerciseId, body.data.workDate,
        body.data.minutesSpent, body.data.activityType, body.data.description
      ]
    );

    await audit("participant", participantId, "learning_time_logged",
      "participant_learning_time_log", Number(result.insertId),
      { minutesSpent: body.data.minutesSpent, activityType: body.data.activityType });

    return res.status(201).json({
      timeLogId: Number(result.insertId),
      approvalStatus: "pending",
      message: "Learning time submitted for coordinator review."
    });
  } catch (error) {
    next(error);
  }
});

learningPublicRouter.get("/time-logs", async (req, res, next) => {
  try {
    const [logs] = await pool.execute<RowDataPacket[]>(
      `SELECT l.id, l.work_date, l.minutes_spent, l.activity_type, l.description,
              l.approval_status, l.reviewed_at,
              m.title AS module_title, e.title AS exercise_title
       FROM participant_learning_time_logs l
       LEFT JOIN learning_modules m ON m.id = l.module_id
       LEFT JOIN learning_exercises e ON e.id = l.exercise_id
       WHERE l.participant_id = ?
       ORDER BY l.work_date DESC, l.id DESC`,
      [getParticipantId(res)]
    );
    return res.status(200).json({ timeLogs: logs });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------
// COORDINATOR LEARNING MANAGEMENT
// ---------------------------------------------------------------------

learningAdminRouter.use(requireAdminSession);

learningAdminRouter.get("/learning/modules", async (req, res, next) => {
  try {
    const [modules] = await pool.execute<RowDataPacket[]>(
      `SELECT m.id, m.slug, m.title, m.summary, m.content_markdown, m.skill_category,
              m.difficulty, m.estimated_minutes, m.publication_status,
              m.created_at, m.updated_at,
              (SELECT COUNT(*) FROM learning_exercises e WHERE e.module_id = m.id) AS exercise_count
       FROM learning_modules m
       ORDER BY m.updated_at DESC, m.id DESC`
    );
    return res.status(200).json({ modules });
  } catch (error) {
    next(error);
  }
});

learningAdminRouter.get("/learning/modules/:moduleId", async (req, res, next) => {
  const id = idSchema.safeParse(req.params.moduleId);
  if (!id.success) return res.status(400).json({ error: "Invalid module ID." });

  try {
    const [modules] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM learning_modules WHERE id = ? LIMIT 1",
      [id.data]
    );
    if (!modules.length) return res.status(404).json({ error: "Learning module not found." });

    const [exercises] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM learning_exercises WHERE module_id = ? ORDER BY sort_order, id",
      [id.data]
    );

    return res.status(200).json({ module: modules[0], exercises });
  } catch (error) {
    next(error);
  }
});

learningAdminRouter.post("/learning/modules", requireCsrf, async (req, res, next) => {
  const body = moduleCreateSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid learning module.", details: body.error.issues });

  try {
    const d = body.data;
    const adminId = getAdminId(res);
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO learning_modules
       (slug, title, summary, content_markdown, skill_category, difficulty,
        estimated_minutes, publication_status, created_by_admin_id, updated_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      [d.slug, d.title, d.summary, d.contentMarkdown, d.skillCategory,
        d.difficulty, d.estimatedMinutes ?? null, adminId, adminId]
    );

    await audit("admin", adminId, "learning_module_created", "learning_module",
      Number(result.insertId), { slug: d.slug });

    return res.status(201).json({ moduleId: Number(result.insertId), publicationStatus: "draft" });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "A learning module with this slug already exists." });
    }
    next(error);
  }
});

learningAdminRouter.patch("/learning/modules/:moduleId", requireCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.moduleId);
  const body = modulePatchSchema.safeParse(req.body);
  if (!id.success || !body.success) {
    return res.status(400).json({ error: "Invalid learning module update.", details: body.success ? undefined : body.error.issues });
  }

  const mapping: Record<string, string> = {
    slug: "slug",
    title: "title",
    summary: "summary",
    contentMarkdown: "content_markdown",
    skillCategory: "skill_category",
    difficulty: "difficulty",
    estimatedMinutes: "estimated_minutes"
  };

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [modules] = await connection.execute<RowDataPacket[]>(
      "SELECT id, publication_status FROM learning_modules WHERE id = ? FOR UPDATE",
      [id.data]
    );
    if (!modules.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Learning module not found." });
    }

    if (body.data.publicationStatus === "published") {
      const [exercises] = await connection.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM learning_exercises WHERE module_id = ?",
        [id.data]
      );
      if (Number(exercises[0].total) < 1) {
        await connection.rollback();
        return res.status(409).json({ error: "Add at least one exercise before publishing this module." });
      }
    }

    const entries = Object.entries(body.data).filter(([key]) => Boolean(mapping[key]));
    const sets = entries.map(([key]) => `${mapping[key]} = ?`);
    const values: any[] = entries.map(([, value]) => value);
    if (body.data.publicationStatus) {
      sets.push("publication_status = ?");
      values.push(body.data.publicationStatus);
    }
    sets.push("updated_by_admin_id = ?");
    values.push(getAdminId(res));
    sets.push("updated_at = UTC_TIMESTAMP()");

    await connection.execute(
      `UPDATE learning_modules SET ${sets.join(", ")} WHERE id = ?`,
      [...values, id.data]
    );

    await connection.execute(
      `INSERT INTO digital_youth_audit_events
       (actor_type, admin_user_id, event_action, entity_type, entity_id, event_metadata)
       VALUES ('admin', ?, 'learning_module_updated', 'learning_module', ?, ?)`,
      [getAdminId(res), id.data, JSON.stringify({ changes: body.data })]
    );

    await connection.commit();
    return res.status(200).json({ message: "Learning module updated." });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "A learning module with this slug already exists." });
    }
    next(error);
  } finally {
    connection.release();
  }
});

learningAdminRouter.post("/learning/modules/:moduleId/exercises", requireCsrf, async (req, res, next) => {
  const moduleId = idSchema.safeParse(req.params.moduleId);
  const body = exerciseCreateSchema.safeParse(req.body);
  if (!moduleId.success || !body.success) {
    return res.status(400).json({ error: "Invalid exercise.", details: body.success ? undefined : body.error.issues });
  }

  try {
    const [modules] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM learning_modules WHERE id = ? AND publication_status <> 'archived' LIMIT 1",
      [moduleId.data]
    );
    if (!modules.length) return res.status(404).json({ error: "Editable module not found." });

    const d = body.data;
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO learning_exercises
       (module_id, title, instructions, simulated_materials, expected_outcome, review_criteria, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        moduleId.data, d.title, d.instructions,
        d.simulatedMaterials === undefined ? null : JSON.stringify(d.simulatedMaterials),
        d.expectedOutcome, JSON.stringify(d.reviewCriteria), d.sortOrder
      ]
    );

    await audit("admin", getAdminId(res), "learning_exercise_created",
      "learning_exercise", Number(result.insertId), { moduleId: moduleId.data });

    return res.status(201).json({ exerciseId: Number(result.insertId) });
  } catch (error) {
    next(error);
  }
});

learningAdminRouter.patch("/learning/exercises/:exerciseId", requireCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.exerciseId);
  const body = exercisePatchSchema.safeParse(req.body);
  if (!id.success || !body.success) {
    return res.status(400).json({ error: "Invalid exercise update.", details: body.success ? undefined : body.error.issues });
  }

  const mapping: Record<string, string> = {
    title: "title",
    instructions: "instructions",
    expectedOutcome: "expected_outcome",
    reviewCriteria: "review_criteria",
    sortOrder: "sort_order",
    simulatedMaterials: "simulated_materials"
  };

  try {
    const entries = Object.entries(body.data).filter(([key]) => Boolean(mapping[key]));
    const sets = entries.map(([key]) => `${mapping[key]} = ?`);
    const values: any[] = entries.map(([key, value]) =>
      key === "reviewCriteria" || key === "simulatedMaterials"
        ? value === undefined ? null : JSON.stringify(value)
        : value
    );

    const [exists] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM learning_exercises WHERE id = ? LIMIT 1",
      [id.data]
    );
    if (!exists.length) return res.status(404).json({ error: "Exercise not found." });

    sets.push("updated_at = UTC_TIMESTAMP()");
    await pool.execute(
      `UPDATE learning_exercises SET ${sets.join(", ")} WHERE id = ?`,
      [...values, id.data]
    );
    await audit("admin", getAdminId(res), "learning_exercise_updated", "learning_exercise", id.data, body.data);

    return res.status(200).json({ message: "Exercise updated." });
  } catch (error) {
    next(error);
  }
});

learningAdminRouter.delete("/learning/exercises/:exerciseId", requireCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.exerciseId);
  if (!id.success) return res.status(400).json({ error: "Invalid exercise ID." });

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT e.id, m.publication_status
       FROM learning_exercises e
       INNER JOIN learning_modules m ON m.id = e.module_id
       WHERE e.id = ? LIMIT 1`,
      [id.data]
    );
    if (!rows.length) return res.status(404).json({ error: "Exercise not found." });
    if (rows[0].publication_status !== "draft") {
      return res.status(409).json({ error: "Exercises can only be deleted while the parent module is a draft." });
    }

    const [submissions] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM exercise_submissions WHERE exercise_id = ?",
      [id.data]
    );
    if (Number(submissions[0].total) > 0) {
      return res.status(409).json({ error: "An exercise with submissions cannot be deleted." });
    }

    await pool.execute("DELETE FROM learning_exercises WHERE id = ?", [id.data]);
    await audit("admin", getAdminId(res), "learning_exercise_deleted", "learning_exercise", id.data);

    return res.status(200).json({ message: "Exercise deleted." });
  } catch (error) {
    next(error);
  }
});

// Submission review queue.
learningAdminRouter.get("/learning/submissions", async (req, res, next) => {
  const page = z.coerce.number().int().min(1).max(100000).default(1).safeParse(req.query.page);
  const limit = z.coerce.number().int().min(1).max(100).default(20).safeParse(req.query.limit);
  const status = z.enum(["submitted", "under_review", "revision_requested", "accepted", "rejected"])
    .optional().safeParse(req.query.status);

  if (!page.success || !limit.success || !status.success) {
    return res.status(400).json({ error: "Invalid submission filters." });
  }

  try {
    const where = status.data ? "WHERE s.review_status = ?" : "";
    const values: any[] = status.data ? [status.data] : [];
    const offset = (page.data - 1) * limit.data;

    const [[counts], [submissions]] = await Promise.all([
      pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM exercise_submissions s ${where}`,
        values
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT s.id, s.response_text, s.resource_url, s.review_status, s.feedback,
                s.submitted_at, s.reviewed_at,
                p.id AS participant_id, p.display_name, p.email,
                e.id AS exercise_id, e.title AS exercise_title,
                m.id AS module_id, m.title AS module_title, m.skill_category
         FROM exercise_submissions s
         INNER JOIN participant_accounts p ON p.id = s.participant_id
         INNER JOIN learning_exercises e ON e.id = s.exercise_id
         INNER JOIN learning_modules m ON m.id = e.module_id
         ${where}
         ORDER BY s.submitted_at ASC, s.id ASC
         LIMIT ? OFFSET ?`,
        [...values, limit.data, offset]
      )
    ]);

    const total = Number(counts[0]?.total ?? 0);
    return res.status(200).json({
      submissions,
      pagination: { page: page.data, limit: limit.data, total, totalPages: Math.ceil(total / limit.data) }
    });
  } catch (error) {
    next(error);
  }
});

learningAdminRouter.patch("/learning/submissions/:submissionId/review", requireCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.submissionId);
  const body = reviewSubmissionSchema.safeParse(req.body);
  if (!id.success || !body.success) {
    return res.status(400).json({ error: "Invalid submission review.", details: body.success ? undefined : body.error.issues });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT s.id, s.participant_id, e.module_id
       FROM exercise_submissions s
       INNER JOIN learning_exercises e ON e.id = s.exercise_id
       WHERE s.id = ? FOR UPDATE`,
      [id.data]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Exercise submission not found." });
    }

    await connection.execute(
      `UPDATE exercise_submissions
       SET review_status = ?, feedback = ?, reviewed_by_admin_id = ?, reviewed_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [body.data.reviewStatus, body.data.feedback ?? null, getAdminId(res), id.data]
    );

    await connection.execute(
      `INSERT INTO digital_youth_audit_events
       (actor_type, admin_user_id, event_action, entity_type, entity_id, event_metadata)
       VALUES ('admin', ?, 'learning_submission_reviewed', 'exercise_submission', ?, ?)`,
      [getAdminId(res), id.data, JSON.stringify(body.data)]
    );

    await connection.commit();

    if (body.data.reviewStatus === "accepted") {
      await refreshEnrollmentCompletion(Number(rows[0].participant_id), Number(rows[0].module_id));
    }

    return res.status(200).json({ message: "Exercise submission reviewed.", reviewStatus: body.data.reviewStatus });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    next(error);
  } finally {
    connection.release();
  }
});

// Learning-time review queue.
learningAdminRouter.get("/learning/time-logs", async (req, res, next) => {
  const status = z.enum(["pending", "approved", "rejected"]).optional().safeParse(req.query.status);
  const page = z.coerce.number().int().min(1).max(100000).default(1).safeParse(req.query.page);
  const limit = z.coerce.number().int().min(1).max(100).default(20).safeParse(req.query.limit);
  if (!status.success || !page.success || !limit.success) {
    return res.status(400).json({ error: "Invalid time log filters." });
  }

  try {
    const where = status.data ? "WHERE l.approval_status = ?" : "";
    const values: any[] = status.data ? [status.data] : [];
    const offset = (page.data - 1) * limit.data;

    const [[counts], [logs]] = await Promise.all([
      pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM participant_learning_time_logs l ${where}`,
        values
      ),
      pool.execute<RowDataPacket[]>(
        `SELECT l.id, l.work_date, l.minutes_spent, l.activity_type, l.description,
                l.approval_status, l.reviewed_at,
                p.id AS participant_id, p.display_name, p.email,
                m.title AS module_title, e.title AS exercise_title
         FROM participant_learning_time_logs l
         INNER JOIN participant_accounts p ON p.id = l.participant_id
         LEFT JOIN learning_modules m ON m.id = l.module_id
         LEFT JOIN learning_exercises e ON e.id = l.exercise_id
         ${where}
         ORDER BY l.created_at ASC, l.id ASC
         LIMIT ? OFFSET ?`,
        [...values, limit.data, offset]
      )
    ]);

    const total = Number(counts[0]?.total ?? 0);
    return res.status(200).json({
      timeLogs: logs,
      pagination: { page: page.data, limit: limit.data, total, totalPages: Math.ceil(total / limit.data) }
    });
  } catch (error) {
    next(error);
  }
});

learningAdminRouter.patch("/learning/time-logs/:logId/review", requireCsrf, async (req, res, next) => {
  const id = idSchema.safeParse(req.params.logId);
  const body = reviewTimeLogSchema.safeParse(req.body);
  if (!id.success || !body.success) {
    return res.status(400).json({ error: "Invalid time log review.", details: body.success ? undefined : body.error.issues });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT id, approval_status FROM participant_learning_time_logs WHERE id = ? FOR UPDATE",
      [id.data]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Learning time log not found." });
    }
    if (rows[0].approval_status !== "pending") {
      await connection.rollback();
      return res.status(409).json({ error: "Only pending time logs can be reviewed." });
    }

    await connection.execute(
      `UPDATE participant_learning_time_logs
       SET approval_status = ?, reviewed_by_admin_id = ?, reviewed_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [body.data.approvalStatus, getAdminId(res), id.data]
    );

    await connection.execute(
      `INSERT INTO digital_youth_audit_events
       (actor_type, admin_user_id, event_action, entity_type, entity_id, event_metadata)
       VALUES ('admin', ?, 'learning_time_log_reviewed', 'participant_learning_time_log', ?, ?)`,
      [getAdminId(res), id.data, JSON.stringify(body.data)]
    );

    await connection.commit();
    return res.status(200).json({ message: "Learning time log reviewed.", approvalStatus: body.data.approvalStatus });
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    next(error);
  } finally {
    connection.release();
  }
});