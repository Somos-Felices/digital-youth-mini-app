import { createHash } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/database.js";
import type { FieldVisitDiagnosticInput } from "../schemas/fieldVisitDiagnostic.schema.js";

export class IdempotencyConflictError extends Error {
  constructor() {
    super("This submission identifier was already used for different answers.");
    this.name = "IdempotencyConflictError";
  }
}

export async function createFieldVisitDiagnostic(input: FieldVisitDiagnosticInput) {
  const canonical = {
    businessName: input.businessName,
    businessType: input.businessType,
    businessTypeOther: input.businessType === "other" ? input.businessTypeOther?.trim() || null : null,
    currentTools: input.currentTools,
    toolsOther: input.currentTools.includes("other") ? input.toolsOther?.trim() || null : null,
    biggestOperationalPain: input.biggestOperationalPain,
    problemAreas: input.problemAreas,
    contactName: input.followUpConsent ? input.contactName?.trim() || null : null,
    whatsappNumber: input.followUpConsent ? input.whatsappNumber?.trim() || null : null,
    followUpConsent: input.followUpConsent
  };
  const payloadHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  try {
    await pool.execute<ResultSetHeader>(
      `INSERT INTO field_visit_diagnostic_submissions (
        submission_uuid, payload_hash, business_name, business_type, business_type_other,
        current_tools, tools_other, biggest_operational_pain, problem_areas,
        contact_name, whatsapp_number, follow_up_consent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.submissionUuid,
        payloadHash,
        input.businessName,
        input.businessType,
        input.businessType === "other" ? input.businessTypeOther?.trim() || null : null,
        JSON.stringify(input.currentTools),
        input.currentTools.includes("other") ? input.toolsOther?.trim() || null : null,
        input.biggestOperationalPain,
        JSON.stringify(input.problemAreas),
        input.followUpConsent ? input.contactName?.trim() || null : null,
        input.followUpConsent ? input.whatsappNumber?.trim() || null : null,
        input.followUpConsent
      ]
    );
    return { submissionUuid: input.submissionUuid, duplicate: false };
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ER_DUP_ENTRY") throw error;
    const [rows] = await pool.execute<(RowDataPacket & { payload_hash: string })[]>(
      "SELECT payload_hash FROM field_visit_diagnostic_submissions WHERE submission_uuid = ? LIMIT 1",
      [input.submissionUuid]
    );
    if (!rows[0] || rows[0].payload_hash !== payloadHash) throw new IdempotencyConflictError();
    return { submissionUuid: input.submissionUuid, duplicate: true };
  }
}
