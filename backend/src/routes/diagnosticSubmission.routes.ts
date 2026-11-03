import { Router } from "express";

import { diagnosticSubmissionSchema } from "../schemas/diagnosticSubmission.schema.js";
import { createDiagnosticSubmission } from "../services/diagnosticSubmission.service.js";

const router = Router();

router.post("/", async (req, res, next) => {
  const validation = diagnosticSubmissionSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message
      }))
    });
  }

  try {
    const submission = await createDiagnosticSubmission(
      validation.data
    );

    return res.status(201).json({
      message: "Business diagnostic submitted successfully",
      submission: {
        id: submission.id,
        submissionUuid: submission.submissionUuid,
        status: "received"
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
