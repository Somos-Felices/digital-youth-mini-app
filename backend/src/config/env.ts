import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(50).default(10),


}).superRefine((values, context) => {
  if (values.NODE_ENV !== "production") return;

  const origins = values.CORS_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const invalidOrigin = origins.length === 0 || origins.some((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.protocol !== "https:" || parsed.origin !== origin;
    } catch {
      return true;
    }
  });

  if (invalidOrigin) {
    context.addIssue({
      code: "custom",
      path: ["CORS_ORIGINS"],
      message: "Production CORS_ORIGINS must contain explicit HTTPS origins without paths or trailing slashes."
    });
  }
});

export const env = envSchema.parse(process.env);