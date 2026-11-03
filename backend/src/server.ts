import "dotenv/config";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool, verifyDatabaseConnection } from "./config/database.js";

async function startServer(): Promise<void> {
  try {
    await verifyDatabaseConnection();

    console.log("MySQL database connection established.");

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      console.log(
        `Digital Youth API running at http://localhost:${env.PORT}`
      );
    });

    const shutdown = (signal: string) => {
      console.log(`${signal} received. Shutting down...`);

      server.close(async () => {
        await pool.end();
        process.exit(0);
      });
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

  } catch (error) {
    console.error("Failed to start Digital Youth API:", error);
    await pool.end().catch(() => undefined);
    process.exitCode = 1;
  }
}

void startServer();
