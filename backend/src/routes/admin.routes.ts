import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";

import { pool } from "../config/database.js";
import { requireAdminSession } from "../middleware/requireAdminSession.js";
import { requireCsrf } from "../middleware/requireCsrf.js";

const router = Router();

router.use(requireAdminSession);

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const idSchema = z.coerce.number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

const statusSchema = z.object({
  status: z.enum([
    "new",
    "reviewed",
    "qualified",
    "not_qualified",
    "follow_up"
  ]),
  changeReason: z.string().trim().max(500).optional().nullable()
}).strict();

// GET /api/admin/submissions
router.get("/submissions", async (req, res, next) => {
  const validation = paginationSchema.safeParse(req.query);

  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid pagination parameters",
      details: validation.error.issues
    });
  }

  const { page, limit } = validation.data;
  const offset = (page - 1) * limit;

  try {
    const [countRows] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM business_diagnostic_submissions"
    );

    const [submissions] = await pool.execute<RowDataPacket[]>(
      `
        SELECT
          id,
          submission_uuid,
          pilot_location,
          participant_name,
          business_name,
          business_type,
          pain_frequency,
          willingness_to_pay,
          follow_up_consent,
          submission_status,
          created_at
        FROM business_diagnostic_submissions
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `,
      [limit, offset]
    );

    const total = Number(countRows[0]?.total ?? 0);

    return res.status(200).json({
      submissions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/submissions/:id/history
router.get("/submissions/:id/history", async (req, res, next) => {
  const idValidation = idSchema.safeParse(req.params.id);
  const paginationValidation = paginationSchema.safeParse(req.query);

  if (!idValidation.success) {
    return res.status(400).json({
      error: "Invalid submission ID"
    });
  }

  if (!paginationValidation.success) {
    return res.status(400).json({
      error: "Invalid pagination parameters",
      details: paginationValidation.error.issues
    });
  }

  const { page, limit } = paginationValidation.data;
  const offset = (page - 1) * limit;

  try {
    const [submissionRows] = await pool.execute<RowDataPacket[]>(
      `
        SELECT id
        FROM business_diagnostic_submissions
        WHERE id = ?
        LIMIT 1
      `,
      [idValidation.data]
    );

    if (submissionRows.length === 0) {
      return res.status(404).json({
        error: "Submission not found"
      });
    }

    const [countRows] = await pool.execute<RowDataPacket[]>(
      `
        SELECT COUNT(*) AS total
        FROM business_diagnostic_status_history
        WHERE submission_id = ?
      `,
      [idValidation.data]
    );

    const [history] = await pool.execute<RowDataPacket[]>(
      `
        SELECT
          id,
          submission_id,
          previous_status,
          new_status,
          changed_by,
          change_reason,
          changed_at
        FROM business_diagnostic_status_history
        WHERE submission_id = ?
        ORDER BY changed_at ASC, id ASC
        LIMIT ? OFFSET ?
      `,
      [idValidation.data, limit, offset]
    );

    const total = Number(countRows[0]?.total ?? 0);

    return res.status(200).json({
      submissionId: idValidation.data,
      history,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/submissions/:id
router.get("/submissions/:id", async (req, res, next) => {
  const validation = idSchema.safeParse(req.params.id);

  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid submission ID"
    });
  }

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `
        SELECT
          id,
          submission_uuid,
          pilot_location,
          participant_name,
          business_name,
          business_type,
          current_tools,
          biggest_operational_pain,
          pain_frequency,
          willingness_to_pay,
          budget_amount,
          budget_currency,
          follow_up_consent,
          contact_name,
          contact_method,
          contact_value,
          submission_status,
          created_at,
          updated_at
        FROM business_diagnostic_submissions
        WHERE id = ?
        LIMIT 1
      `,
      [validation.data]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Submission not found"
      });
    }

    return res.status(200).json({
      submission: rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/submissions/:id/status
router.patch(
  "/submissions/:id/status",
  requireCsrf,
  async (req, res, next) => {
    const idValidation = idSchema.safeParse(req.params.id);
    const bodyValidation = statusSchema.safeParse(req.body);

    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid submission ID"
      });
    }

    if (!bodyValidation.success) {
      return res.status(400).json({
        error: "Invalid submission status or change reason",
        details: bodyValidation.error.issues
      });
    }

    const authenticatedAdminId = Number(res.locals.admin?.id);

    if (
      !Number.isSafeInteger(authenticatedAdminId) ||
      authenticatedAdminId < 1
    ) {
      return res.status(401).json({
        error: "Authenticated administrator identity is unavailable"
      });
    }

    let connection;

    try {
      connection = await pool.getConnection();

      await connection.beginTransaction();

      const [existing] = await connection.execute<RowDataPacket[]>(
        `
          SELECT submission_status
          FROM business_diagnostic_submissions
          WHERE id = ?
          FOR UPDATE
        `,
        [idValidation.data]
      );

      if (existing.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          error: "Submission not found"
        });
      }

      const previousStatus = String(existing[0].submission_status);
      const newStatus = bodyValidation.data.status;

      if (previousStatus === newStatus) {
        await connection.commit();

        return res.status(200).json({
          message: "Submission status is already set to this value",
          submission: {
            id: idValidation.data,
            status: newStatus
          },
          historyRecorded: false
        });
      }

      await connection.execute(
        `
          UPDATE business_diagnostic_submissions
          SET submission_status = ?
          WHERE id = ?
        `,
        [newStatus, idValidation.data]
      );

      await connection.execute(
        `
          INSERT INTO business_diagnostic_status_history (
            submission_id,
            previous_status,
            new_status,
            changed_by,
            change_reason
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          idValidation.data,
          previousStatus,
          newStatus,
          `admin:${authenticatedAdminId}`,
          bodyValidation.data.changeReason?.trim() || null
        ]
      );

      await connection.commit();

      return res.status(200).json({
        message: "Submission status updated successfully",
        submission: {
          id: idValidation.data,
          previousStatus,
          status: newStatus
        },
        historyRecorded: true
      });
    } catch (error) {
      if (connection) {
        await connection.rollback().catch(() => undefined);
      }

      next(error);
    } finally {
      connection?.release();
    }
  }
);

export default router;
