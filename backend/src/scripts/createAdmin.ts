import "dotenv/config";

import argon2 from "argon2";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { pool } from "../config/database.js";

async function main(): Promise<void> {
  const rl = createInterface({
    input: stdin,
    output: stdout
  });

  try {
    const email = (
      await rl.question("Administrator email: ")
    ).trim().toLowerCase();

    const displayName = (
      await rl.question("Administrator display name: ")
    ).trim();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254
    ) {
      throw new Error("Invalid administrator email.");
    }

    if (displayName.length < 2 || displayName.length > 120) {
      throw new Error("Display name must be between 2 and 120 characters.");
    }

    const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

    if (!password || password.length < 12 || password.length > 128) {
      throw new Error(
        "Provide ADMIN_BOOTSTRAP_PASSWORD securely. It must be 12–128 characters."
      );
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1
    });

    const [result] = await pool.execute(
      `
        INSERT INTO admin_users (
          email,
          display_name,
          password_hash
        )
        VALUES (?, ?, ?)
      `,
      [email, displayName, passwordHash]
    );

    console.log("Administrator account created successfully.");
    console.log(`Account email: ${email}`);
    console.log("Plaintext password was not stored.");
    console.log("Account ID:", (result as { insertId: number }).insertId);
  } finally {
    rl.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Administrator provisioning failed:", error);
  process.exitCode = 1;
});
