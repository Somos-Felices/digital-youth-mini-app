import type { Request, Response, NextFunction } from "express";

import {
  ADMIN_SESSION_COOKIE,
  getAdminSession
} from "../services/adminAuth.service.js";

export async function requireAdminSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  res.setHeader("Cache-Control", "no-store");

  const sessionToken = req.cookies?.[ADMIN_SESSION_COOKIE];

  if (
    typeof sessionToken !== "string" ||
    sessionToken.length < 32 ||
    sessionToken.length > 128
  ) {
    res.status(401).json({
      error: "Authentication required"
    });
    return;
  }

  try {
    const session = await getAdminSession(sessionToken);

    if (!session) {
      res.status(401).json({
        error: "Invalid or expired session"
      });
      return;
    }

    res.locals.admin = {
      id: session.id,
      email: session.email,
      displayName: session.displayName
    };

    res.locals.adminSessionId = session.sessionId;
    res.locals.adminCsrfTokenHash = session.csrfTokenHash;

    next();
  } catch (error) {
    next(error);
  }
}
