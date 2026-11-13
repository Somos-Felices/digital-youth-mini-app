import assert from "node:assert/strict";
import { test } from "node:test";
import { getSessionCookieOptions } from "../src/config/sessionCookies.js";

test("development session cookies use same-site protection", () => {
  assert.deepEqual(getSessionCookieOptions("development"), {
    httpOnly: true, secure: false, sameSite: "lax", path: "/api"
  });
});

test("production session cookies support cross-site HTTPS hosting securely", () => {
  assert.deepEqual(getSessionCookieOptions("production"), {
    httpOnly: true, secure: true, sameSite: "none", path: "/api"
  });
});
