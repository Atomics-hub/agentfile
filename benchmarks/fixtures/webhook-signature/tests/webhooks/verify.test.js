import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyWebhookSignature } from "../../src/webhooks/verify.js";

const secret = "whsec_test_secret";

function signRaw(body) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

test("accepts a valid webhook signature", () => {
  const body = "{\"id\":\"evt_1\",\"type\":\"invoice.paid\",\"amount\":4200}";

  assert.equal(verifyWebhookSignature(body, signRaw(body), secret), true);
});

test("rejects a tampered compact webhook body", () => {
  const body = "{\"id\":\"evt_1\",\"type\":\"invoice.paid\",\"amount\":4200}";
  const tampered = "{\"id\":\"evt_1\",\"type\":\"invoice.paid\",\"amount\":9900}";

  assert.equal(verifyWebhookSignature(tampered, signRaw(body), secret), false);
});
