import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

import { env } from "../config/env.js";
import { hashToken } from "../services/adminAuth.service.js";

export function requireCsrf(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const allowedOrigins = env.CORS_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const origin = req.get("origin");

  if (origin && !allowedOrigins.includes(origin)) {
    res.status(403).json({
      error: "Request origin is not allowed"
    });
    return;
  }

  const suppliedToken = req.get("x-csrf-token");
  const expectedHash = res.locals.adminCsrfTokenHash;

  if (
    typeof suppliedToken !== "string" ||
    !/^[A-Za-z0-9_-]{40,100}$/.test(suppliedToken) ||
    typeof expectedHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(expectedHash)
  ) {
    res.status(403).json({
      error: "CSRF validation failed"
    });
    return;
  }

  const suppliedHash = Buffer.from(
    hashToken(suppliedToken),
    "hex"
  );

  const expectedBuffer = Buffer.from(
    expectedHash,
    "hex"
  );

  if (
    suppliedHash.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedHash, expectedBuffer)
  ) {
    res.status(403).json({
      error: "Invalid CSRF token"
    });
    return;
  }

  next();
}
