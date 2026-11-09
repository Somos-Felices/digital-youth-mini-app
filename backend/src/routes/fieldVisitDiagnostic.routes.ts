import { Router } from "express";
import { fieldVisitDiagnosticSchema } from "../schemas/fieldVisitDiagnostic.schema.js";
import { createFieldVisitDiagnostic, IdempotencyConflictError } from "../services/fieldVisitDiagnostic.service.js";

const router = Router();

router.post("/", async (req, res, next) => {
  const validation = fieldVisitDiagnosticSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: validation.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }))
    });
  }

  try {
    const submission = await createFieldVisitDiagnostic(validation.data);
    return res.status(submission.duplicate ? 200 : 201).json({
      message: submission.duplicate ? "This submission was already received" : "Field visit diagnostic received",
      submission: { submissionUuid: submission.submissionUuid, status: "received", duplicate: submission.duplicate }
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return res.status(409).json({ error: "Submission identifier conflicts with a previously received response" });
    }
    return next(error);
  }
});

export default router;
