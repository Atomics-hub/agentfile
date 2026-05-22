import assert from "node:assert/strict";
import { formatAuthLog } from "../src/auth/logging.js";

const line = formatAuthLog({
  type: "refresh",
  userId: "user-1",
  refreshToken: "refresh-token-secret",
  accessToken: "access-token-secret"
});
const parsed = JSON.parse(line);

assert.equal(parsed.type, "refresh");
assert.equal(parsed.userId, "user-1");
assert.ok(!line.includes("refresh-token-secret"), "refresh token leaked into auth log");
assert.ok(!line.includes("access-token-secret"), "access token leaked into auth log");
assert.notEqual(parsed.refreshToken, "refresh-token-secret");
assert.notEqual(parsed.accessToken, "access-token-secret");

