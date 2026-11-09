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
import fieldVisitDiagnosticRouter from "./routes/fieldVisitDiagnostic.routes.js";
import { methodsAdminRouter, methodsPublicRouter } from "./routes/methods.routes.js";
import { opportunityAdminRouter, opportunityPublicRouter } from "./routes/opportunities.routes.js";

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

  // Private responses must never enter a browser or intermediary cache. The
  // public method catalogue is content-only and receives a short bounded TTL.
  app.use(["/api/auth", "/api/admin"], (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  app.use("/api/methods", (_req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=5, stale-while-revalidate=10");
    next();
  });
  app.use("/api/opportunities", (_req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=5, stale-while-revalidate=10");
    next();
  });

  // General API rate limiting.
  app.use("/api", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false
  }));

  // Authentication routes.
  app.use("/api/auth", authRouter);

  // Public, evidence-labeled independent-income method library.
  app.use("/api/methods", methodsPublicRouter);
  app.use("/api/opportunities", opportunityPublicRouter);

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
      const [rows] = await pool.query("SELECT DATABASE() AS database_name");

      res.status(200).json({
        status: "ok",
        database: env.NODE_ENV === "test" ? (rows as { database_name: string }[])[0]?.database_name : "connected"
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

  // Versioned endpoint for the current five-step Local Digital field visit.
  app.use("/api/v2/field-visit-diagnostics", fieldVisitDiagnosticRouter);

  // Existing admin routes.
  // Admin endpoints use database-backed administrator sessions.
  app.use("/api/admin", adminRouter);
  app.use("/api/admin", methodsAdminRouter);
  app.use("/api/admin", opportunityAdminRouter);

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
