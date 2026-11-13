import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/database.js";

export const PARTICIPANT_SESSION_COOKIE = "dy_participant_session";
export const PARTICIPANT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ParticipantIdentity {
  id: number;
  email: string;
  displayName: string;
  pilotSiteId: number;
}

export interface ParticipantSession extends ParticipantIdentity {
  sessionId: number;
  csrfTokenHash: string;
}

interface ParticipantUserRow extends RowDataPacket {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
  pilot_site_id: number;
  account_status: string;
}

interface ParticipantSessionRow extends RowDataPacket {
  session_id: number;
  participant_id: number;
  email: string;
  display_name: string;
  pilot_site_id: number;
  csrf_token_hash: string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function verifyParticipantCredentials(
  email: string,
  password: string
): Promise<ParticipantIdentity | null> {
  const [rows] = await pool.execute<ParticipantUserRow[]>(
    `SELECT id, email, display_name, password_hash, pilot_site_id, account_status
     FROM participant_accounts WHERE email = ? LIMIT 1`,
    [email.trim().toLowerCase()]
  );

  const participant = rows[0];
  if (!participant || participant.account_status !== "active") return null;

  try {
    if (!await argon2.verify(participant.password_hash, password)) return null;
  } catch {
    return null;
  }

  return {
    id: Number(participant.id),
    email: participant.email,
    displayName: participant.display_name,
    pilotSiteId: Number(participant.pilot_site_id)
  };
}

export async function createParticipantSession(participantId: number): Promise<{
  sessionToken: string;
  csrfToken: string;
  expiresAt: string;
}> {
  const sessionToken = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PARTICIPANT_SESSION_TTL_MS)
    .toISOString().slice(0, 19).replace("T", " ");

  const [accounts] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM participant_accounts WHERE id = ? AND account_status = 'active' LIMIT 1",
    [participantId]
  );

  if (!accounts.length) throw new Error("Participant account is unavailable.");

  await pool.execute<ResultSetHeader>(
    `INSERT INTO participant_sessions
      (participant_id, session_token_hash, csrf_token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [participantId, hashToken(sessionToken), hashToken(csrfToken), expiresAt]
  );

  await pool.execute(
    "UPDATE participant_accounts SET last_login_at = UTC_TIMESTAMP() WHERE id = ?",
    [participantId]
  );

  return { sessionToken, csrfToken, expiresAt };
}

export async function getParticipantSession(
  sessionToken: string
): Promise<ParticipantSession | null> {
  const [rows] = await pool.execute<ParticipantSessionRow[]>(
    `SELECT s.id AS session_id, s.participant_id, s.csrf_token_hash,
            p.email, p.display_name, p.pilot_site_id
     FROM participant_sessions s
     INNER JOIN participant_accounts p ON p.id = s.participant_id
     WHERE s.session_token_hash = ?
       AND s.expires_at > UTC_TIMESTAMP()
       AND s.revoked_at IS NULL
       AND p.account_status = 'active'
     LIMIT 1`,
    [hashToken(sessionToken)]
  );

  const row = rows[0];
  if (!row) return null;

  return {
    sessionId: Number(row.session_id),
    id: Number(row.participant_id),
    email: row.email,
    displayName: row.display_name,
    pilotSiteId: Number(row.pilot_site_id),
    csrfTokenHash: row.csrf_token_hash
  };
}

export async function rotateParticipantCsrfToken(sessionId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE participant_sessions SET csrf_token_hash = ?
     WHERE id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
    [hashToken(token), sessionId]
  );

  if (result.affectedRows !== 1) throw new Error("Unable to rotate CSRF token.");
  return token;
}

export async function revokeParticipantSession(sessionToken: string): Promise<void> {
  await pool.execute(
    `UPDATE participant_sessions SET revoked_at = UTC_TIMESTAMP()
     WHERE session_token_hash = ? AND revoked_at IS NULL`,
    [hashToken(sessionToken)]
  );
}