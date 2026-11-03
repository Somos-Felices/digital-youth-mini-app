import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";

import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";

import { env } from "./config/env.js";
import { pool } from "./config/database.js";

import authRouter from "./routes/auth.routes.js";
import adminRouter from "./routes/admin.routes.js";
import diagnosticSubmissionRouter from "./routes/diagnosticSubmission.routes.js";

export function createApp() {
  const app = express();

  const allowedOrigins = env.CORS_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Security headers and application configuration.
  app.disable("x-powered-by");
  app.use(helmet());

  // CORS configuration for credentialed browser requests.
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "X-CSRF-Token"
    ]
  }));

  // Request parsing middleware.
  app.use(express.json({ limit: "25kb" }));
  app.use(cookieParser());

  // General API rate limiting.
  app.use("/api", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false
  }));

  // Authentication routes.
  app.use("/api/auth", authRouter);

  // API health.
  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "digital-youth-mini-app-api",
      timestamp: new Date().toISOString()
    });
  });

  // Database health.
  app.get("/api/health/db", async (_req, res, next) => {
    try {
      await pool.query("SELECT 1");

      res.status(200).json({
        status: "ok",
        database: "connected"
      });
    } catch (error) {
      next(error);
    }
  });

  // Public business diagnostic submissions.
  app.use(
    "/api/diagnostic-submissions",
    diagnosticSubmissionRouter
  );

  // Existing admin routes.
  // Admin endpoints use database-backed administrator sessions.
  app.use("/api/admin", adminRouter);

  // 404 handler.
  app.use((_req, res) => {
    res.status(404).json({
      error: "Route not found"
    });
  });

  // Centralized error handler.
  app.use((
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    if (
      error instanceof Error &&
      error.message === "Origin not allowed by CORS"
    ) {
      return res.status(403).json({
        error: "Request origin is not allowed"
      });
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.parse.failed"
    ) {
      return res.status(400).json({
        error: "Invalid JSON request body"
      });
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      return res.status(413).json({
        error: "Request body is too large"
      });
    }

    console.error("API error:", error);

    res.status(500).json({
      error: "Internal server error"
    });
  });

  return app;
}