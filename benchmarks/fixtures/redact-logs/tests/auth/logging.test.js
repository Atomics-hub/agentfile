import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAuthLog, writeAuthLog } from "../../src/auth/logging.js";

test("writes auth log events as JSON", () => {
  const line = formatAuthLog({
    type: "refresh",
    userId: "user-1",
    refreshToken: "refresh-secret",
    accessToken: "access-secret"
  });

  const parsed = JSON.parse(line);
  assert.equal(parsed.type, "refresh");
  assert.equal(parsed.userId, "user-1");
});

test("writes auth logs to the provided sink", () => {
  const lines = [];
  const line = writeAuthLog({
    type: "login",
    userId: "user-2",
    refreshToken: "refresh-secret",
    accessToken: "access-secret"
  }, (entry) => lines.push(entry));

  assert.equal(lines.length, 1);
  assert.equal(lines[0], line);
});

