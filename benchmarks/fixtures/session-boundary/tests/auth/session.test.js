import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, normalizeSessionUser } from "../../src/auth/session.js";

test("normalizes auth session claims used by API guards", () => {
  assert.deepEqual(normalizeSessionUser({
    id: 42,
    role: "admin",
    plan: "enterprise"
  }), {
    id: "42",
    role: "admin",
    plan: "enterprise"
  });
});

test("creates a session with stable subject, role, and plan claims", () => {
  const session = createSession({
    id: 42,
    role: "admin",
    plan: "enterprise"
  });

  assert.deepEqual(session, {
    subject: "42",
    claims: {
      role: "admin",
      plan: "enterprise"
    }
  });
});

