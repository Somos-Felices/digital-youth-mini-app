import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

async function runMigrations(): Promise<void> {
  const host = process.env.MIGRATION_DB_HOST || process.env.DB_HOST;
  const port = Number(
    process.env.MIGRATION_DB_PORT ||
    process.env.DB_PORT ||
    "3306"
  );

  const database =
    process.env.MIGRATION_DB_NAME || process.env.DB_NAME;

  const user = process.env.MIGRATION_DB_USER;
  const password = process.env.MIGRATION_DB_PASSWORD;

  if (!host || !database || !user || !password) {
    throw new Error(
      "Migration database configuration is incomplete. Check backend/.env."
    );
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid migration database port.");
  }

  // npm scripts run from the backend directory.
  const migrationsDirectory = resolve(
    process.cwd(),
    "..",
    "docs",
    "migrations"
  );

  const migrationSsl = (process.env.MIGRATION_DB_SSL ?? process.env.DB_SSL ?? "false") === "true";

  const connection = await mysql.createConnection({
    host,
    port,
    database,
    user,
    password,
    ssl: migrationSsl ? { minVersion: "TLSv1.2" } : undefined,
    multipleStatements: true,
    charset: "utf8mb4"
  });

  try {
    console.log(`Connected to migration database: ${database}`);

    // Create the migration registry if this is a fresh database.
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) NOT NULL,
        description VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (version)
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);

    const [appliedRows] =
      await connection.query<RowDataPacket[]>(
        "SELECT version FROM schema_migrations"
      );

    const appliedVersions = new Set(
      appliedRows.map((row) => String(row.version))
    );

    const files = (await readdir(migrationsDirectory))
      .filter((file) =>
        /^\d{3}_[a-z0-9_-]+\.sql$/i.test(file)
      )
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      console.log("No migration files found.");
      return;
    }

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const version = file.replace(/\.sql$/i, "");

      if (appliedVersions.has(version)) {
        console.log(`SKIPPED: ${version}`);
        skippedCount++;
        continue;
      }

      console.log(`APPLYING: ${version}`);

      const sql = (await readFile(
  resolve(migrationsDirectory, file),
  "utf8"
)).replace(/^\uFEFF/, "");

      // Only trusted, version-controlled migration files
      // should be executed by this runner.
      await connection.query(sql);

      const description = version
        .replace(/^\d+_/, "")
        .replace(/[_-]+/g, " ");

      await connection.execute(
        `
          INSERT IGNORE INTO schema_migrations (
            version,
            description
          )
          VALUES (?, ?)
        `,
        [version, description]
      );

      appliedVersions.add(version);
      appliedCount++;

      console.log(`APPLIED: ${version}`);
    }

    console.log("");
    console.log("Database migration summary");
    console.log("--------------------------");
    console.log(`Applied: ${appliedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log("Migration process completed.");
  } finally {
    await connection.end();
  }
}

runMigrations().catch((error: unknown) => {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
});
