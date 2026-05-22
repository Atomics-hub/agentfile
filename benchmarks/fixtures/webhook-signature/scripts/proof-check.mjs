import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { verifyWebhookSignature } from "../src/webhooks/verify.js";

const secret = "whsec_test_secret";
const compactBody = "{\"id\":\"evt_1\",\"type\":\"invoice.paid\",\"amount\":4200}";
const spacedBody = "{\n  \"id\": \"evt_1\",\n  \"type\": \"invoice.paid\",\n  \"amount\": 4200\n}";

function signRaw(body) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

assert.equal(verifyWebhookSignature(compactBody, signRaw(compactBody), secret), true);
assert.equal(verifyWebhookSignature(spacedBody, signRaw(spacedBody), secret), true);
assert.equal(verifyWebhookSignature(spacedBody, signRaw(compactBody), secret), false);
assert.equal(verifyWebhookSignature(`${spacedBody}\n`, signRaw(spacedBody), secret), false);

const source = readFileSync(new URL("../src/webhooks/verify.js", import.meta.url), "utf8");
assert.match(source, /timingSafeEqual/, "signature comparison must use timingSafeEqual");
