import type { Request, Response, NextFunction } from "express";
import {
  PARTICIPANT_SESSION_COOKIE,
  getParticipantSession
} from "../services/participantAuth.service.js";

export async function requireParticipantSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  res.setHeader("Cache-Control", "no-store");

  const token = req.cookies?.[PARTICIPANT_SESSION_COOKIE];
  if (typeof token !== "string" || token.length < 32 || token.length > 128) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const session = await getParticipantSession(token);
    if (!session) {
      res.status(401).json({ error: "Invalid or expired participant session" });
      return;
    }

    res.locals.participant = {
      id: session.id,
      email: session.email,
      displayName: session.displayName,
      pilotSiteId: session.pilotSiteId
    };
    res.locals.participantSessionId = session.sessionId;
    res.locals.participantCsrfTokenHash = session.csrfTokenHash;
    next();
  } catch (error) {
    next(error);
  }
}