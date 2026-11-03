import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { env } from "../config/env.js";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  createAdminSession,
  revokeAdminSession,
  rotateAdminCsrfToken,
  verifyAdminCredentials
} from "../services/adminAuth.service.js";
import { requireAdminSession } from "../middleware/requireAdminSession.js";
import { requireCsrf } from "../middleware/requireCsrf.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Please try again later."
  }
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128)
}).strict();

function originIsAllowed(origin: string | undefined): boolean {
  if (!origin) return true;

  const allowedOrigins = env.CORS_ORIGINS
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return allowedOrigins.includes(origin);
}

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api"
};

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res, next) => {
  const origin = req.get("origin");

  if (!originIsAllowed(origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  const validation = loginSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: "Invalid login credentials format"
    });
  }

  try {
    const admin = await verifyAdminCredentials(
      validation.data.email,
      validation.data.password
    );

    if (!admin) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const session = await createAdminSession(admin.id);

    res.cookie(
      ADMIN_SESSION_COOKIE,
      session.sessionToken,
      {
        ...cookieOptions,
        maxAge: ADMIN_SESSION_TTL_MS
      }
    );

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      admin,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get("/me", requireAdminSession, (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    authenticated: true,
    admin: res.locals.admin
  });
});

// GET /api/auth/csrf
router.get("/csrf", requireAdminSession, async (req, res, next) => {
  try {
    const sessionId = Number(res.locals.adminSessionId);

    if (!Number.isSafeInteger(sessionId) || sessionId < 1) {
      return res.status(401).json({
        error: "Administrator session is unavailable"
      });
    }

    const csrfToken = await rotateAdminCsrfToken(sessionId);

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({ csrfToken });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post(
  "/logout",
  requireAdminSession,
  requireCsrf,
  async (req, res, next) => {
    try {
      const sessionToken = req.cookies?.[ADMIN_SESSION_COOKIE];

      if (typeof sessionToken === "string") {
        await revokeAdminSession(sessionToken);
      }

      res.clearCookie(ADMIN_SESSION_COOKIE, cookieOptions);
      res.setHeader("Cache-Control", "no-store");

      return res.status(200).json({
        message: "Logged out successfully"
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;