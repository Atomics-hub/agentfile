import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuthClient } from "../../src/auth/refresh.js";

test("refreshes an expired token before a request", async () => {
  let refreshCalls = 0;
  const client = createAuthClient({
    async refreshToken() {
      refreshCalls += 1;
      return "token-1";
    }
  });

  const response = await client.request("/profile");

  assert.equal(response.authorization, "Bearer token-1");
  assert.equal(refreshCalls, 1);
});

test("shares one in-flight refresh across concurrent requests", async () => {
  let refreshCalls = 0;
  let resolveRefresh;
  const refreshStarted = Promise.withResolvers();
  const refreshCanFinish = new Promise((resolve) => {
    resolveRefresh = resolve;
  });
  const client = createAuthClient({
    async refreshToken() {
      refreshCalls += 1;
      refreshStarted.resolve();
      await refreshCanFinish;
      return "token-2";
    }
  });

  const first = client.request("/profile");
  await refreshStarted.promise;
  const second = client.request("/settings");
  resolveRefresh();

  const responses = await Promise.all([first, second]);

  assert.deepEqual(responses.map((response) => response.authorization), [
    "Bearer token-2",
    "Bearer token-2"
  ]);
  assert.equal(refreshCalls, 1);
});

test("clears failed refreshes so a later request can retry", async () => {
  let refreshCalls = 0;
  const client = createAuthClient({
    async refreshToken() {
      refreshCalls += 1;
      if (refreshCalls === 1) {
        throw new Error("temporary refresh failure");
      }
      return "token-3";
    }
  });

  await assert.rejects(() => client.request("/profile"), /temporary refresh failure/);
  const response = await client.request("/profile");

  assert.equal(response.authorization, "Bearer token-3");
  assert.equal(refreshCalls, 2);
});

