import { createHmac } from "node:crypto";

export function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  const parsedBody = JSON.parse(rawBody);
  const normalizedBody = JSON.stringify(parsedBody);
  const expected = `sha256=${createHmac("sha256", secret).update(normalizedBody, "utf8").digest("hex")}`;

  return signatureHeader === expected;
}
