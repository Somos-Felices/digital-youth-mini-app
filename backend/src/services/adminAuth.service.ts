import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { pool } from "../config/database.js";

export const ADMIN_SESSION_COOKIE = "dy_admin_session";

export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface AdminIdentity {
  id: number;
  email: string;
  displayName: string;
}

export interface AdminSession extends AdminIdentity {
  sessionId: number;
  csrfTokenHash: string;
}

interface AdminUserRow extends RowDataPacket {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
  is_active: number;
}

interface AdminSessionRow extends RowDataPacket {
  session_id: number;
  admin_id: number;
  email: string;
  display_name: string;
  csrf_token_hash: string;
}

export function hashToken(token: string): string {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

export async function verifyAdminCredentials(
  email: string,
  password: string
): Promise<AdminIdentity | null> {
  const [rows] = await pool.execute<AdminUserRow[]>(
    `
      SELECT
        id,
        email,
        display_name,
        password_hash,
        is_active
      FROM admin_users
      WHERE email = ?
      LIMIT 1
    `,
    [email.toLowerCase().trim()]
  );

  const admin = rows[0];

  if (!admin || admin.is_active !== 1) {
    return null;
  }

  let passwordValid = false;

  try {
    passwordValid = await argon2.verify(
      admin.password_hash,
      password
    );
  } catch {
    return null;
  }

  if (!passwordValid) {
    return null;
  }

  return {
    id: Number(admin.id),
    email: admin.email,
    displayName: admin.display_name
  };
}

export async function createAdminSession(
  adminUserId: number
): Promise<{
  sessionToken: string;
  csrfToken: string;
  expiresAt: string;
}> {
  const sessionToken = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");

  const sessionTokenHash = hashToken(sessionToken);
  const csrfTokenHash = hashToken(csrfToken);

  const expiresAt = new Date(
    Date.now() + ADMIN_SESSION_TTL_MS
  ).toISOString().slice(0, 19).replace("T", " ");

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [adminRows] = await connection.execute<RowDataPacket[]>(
      `
        SELECT id
        FROM admin_users
        WHERE id = ? AND is_active = 1
        FOR UPDATE
      `,
      [adminUserId]
    );

    if (adminRows.length === 0) {
      throw new Error("Administrator account is unavailable.");
    }

    await connection.execute<ResultSetHeader>(
      `
        INSERT INTO admin_sessions (
          admin_user_id,
          session_token_hash,
          csrf_token_hash,
          expires_at
        )
        VALUES (?, ?, ?, ?)
      `,
      [
        adminUserId,
        sessionTokenHash,
        csrfTokenHash,
        expiresAt
      ]
    );

    await connection.execute(
      `
        UPDATE admin_users
        SET last_login_at = UTC_TIMESTAMP()
        WHERE id = ?
      `,
      [adminUserId]
    );

    await connection.commit();

    return {
      sessionToken,
      csrfToken,
      expiresAt
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export async function getAdminSession(
  sessionToken: string
): Promise<AdminSession | null> {
  const tokenHash = hashToken(sessionToken);

  const [rows] = await pool.execute<AdminSessionRow[]>(
    `
      SELECT
        s.id AS session_id,
        s.csrf_token_hash,
        a.id AS admin_id,
        a.email,
        a.display_name
      FROM admin_sessions s
      INNER JOIN admin_users a
        ON a.id = s.admin_user_id
      WHERE s.session_token_hash = ?
        AND s.expires_at > UTC_TIMESTAMP()
        AND s.revoked_at IS NULL
        AND a.is_active = 1
      LIMIT 1
    `,
    [tokenHash]
  );

  const session = rows[0];

  if (!session) {
    return null;
  }

  return {
    sessionId: Number(session.session_id),
    id: Number(session.admin_id),
    email: session.email,
    displayName: session.display_name,
    csrfTokenHash: session.csrf_token_hash
  };
}

export async function rotateAdminCsrfToken(
  sessionId: number
): Promise<string> {
  const csrfToken = randomBytes(32).toString("base64url");
  const csrfTokenHash = hashToken(csrfToken);

  const [result] = await pool.execute<ResultSetHeader>(
    `
      UPDATE admin_sessions
      SET csrf_token_hash = ?
      WHERE id = ?
        AND revoked_at IS NULL
        AND expires_at > UTC_TIMESTAMP()
    `,
    [csrfTokenHash, sessionId]
  );

  if (result.affectedRows !== 1) {
    throw new Error("Unable to rotate CSRF token.");
  }

  return csrfToken;
}

export async function revokeAdminSession(
  sessionToken: string
): Promise<void> {
  await pool.execute(
    `
      UPDATE admin_sessions
      SET revoked_at = UTC_TIMESTAMP()
      WHERE session_token_hash = ?
        AND revoked_at IS NULL
    `,
    [hashToken(sessionToken)]
  );
}
