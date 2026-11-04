import { randomUUID } from "node:crypto";
import type { ResultSetHeader } from "mysql2";

import { pool } from "../config/database.js";
import type { DiagnosticSubmissionInput } from "../schemas/diagnosticSubmission.schema.js";

export async function createDiagnosticSubmission(
  input: DiagnosticSubmissionInput
) {
  const submissionUuid = randomUUID();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO business_diagnostic_submissions (
          submission_uuid,
          pilot_location,
          participant_name,
          business_name,
          business_type,
          current_tools,
          problem_areas,
          biggest_operational_pain,
          pain_frequency,
          willingness_to_pay,
          budget_amount,
          budget_currency,
          follow_up_consent,
          contact_name,
          contact_method,
          contact_value
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        submissionUuid,
        input.pilotLocation,
        input.participantName,
        input.businessName?.trim() || null,
        input.businessType,
        JSON.stringify(input.currentTools),
        JSON.stringify(input.problemAreas),
        input.biggestOperationalPain,
        input.painFrequency,
        input.willingnessToPay,
        input.budgetAmount ?? null,
        input.budgetCurrency ?? null,
        input.followUpConsent,
        input.followUpConsent ? input.contactName || null : null,
        input.followUpConsent ? input.contactMethod || null : null,
        input.followUpConsent ? input.contactValue || null : null
      ]
    );

    // Test-only fault injection. Never active outside NODE_ENV=test.
    if (
      process.env.NODE_ENV === "test" &&
      process.env.TEST_FAIL_INITIAL_AUDIT_INSERT === "true"
    ) {
      // Intentionally violate the audit table foreign key.
      // This must fail after the business record has been inserted.
      await connection.execute(
        `
          INSERT INTO business_diagnostic_status_history (
            submission_id,
            previous_status,
            new_status,
            changed_by,
            change_reason
          )
          VALUES (?, NULL, 'new', 'system', ?)
        `,
        [
          Number(result.insertId) + 1000000000,
          "Intentional integration-test foreign-key failure"
        ]
      );
    }

    await connection.execute(
      `
        INSERT INTO business_diagnostic_status_history (
          submission_id,
          previous_status,
          new_status,
          changed_by,
          change_reason
        )
        VALUES (?, NULL, 'new', 'system', ?)
      `,
      [
        result.insertId,
        "Initial status recorded when diagnostic submission was received"
      ]
    );

    await connection.commit();

    return {
      id: result.insertId,
      submissionUuid
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

