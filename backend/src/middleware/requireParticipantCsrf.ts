import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { hashToken } from "../services/participantAuth.service.js";

export function requireParticipantCsrf(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const origins = env.CORS_ORIGINS.split(",").map(v => v.trim()).filter(Boolean);
  const origin = req.get("origin");

  if (origin && !origins.includes(origin)) {
    res.status(403).json({ error: "Request origin is not allowed" });
    return;
  }

  const supplied = req.get("x-csrf-token");
  const expected = res.locals.participantCsrfTokenHash;

  if (
    typeof supplied !== "string" ||
    !/^[A-Za-z0-9_-]{40,100}$/.test(supplied) ||
    typeof expected !== "string" ||
    !/^[a-f0-9]{64}$/i.test(expected)
  ) {
    res.status(403).json({ error: "CSRF validation failed" });
    return;
  }

  const suppliedHash = Buffer.from(hashToken(supplied), "hex");
  const expectedHash = Buffer.from(expected, "hex");

  if (
    suppliedHash.length !== expectedHash.length ||
    !timingSafeEqual(suppliedHash, expectedHash)
  ) {
    res.status(403).json({ error: "Invalid CSRF token" });
    return;
  }

  next();
}