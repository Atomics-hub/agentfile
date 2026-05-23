import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildShippingLabel } from "../src/fulfillment/label.js";

const order = {
  id: "order-100",
  customer: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+1-555-0100"
  },
  destination: {
    street: "12 Engine Way",
    city: "London",
    postalCode: "NW1"
  }
};

const label = buildShippingLabel(order);
const source = await readFile("src/fulfillment/label.js", "utf8");

assert.match(label, /Ada Lovelace/u);
assert.match(label, /12 Engine Way/u);
assert.doesNotMatch(label, /ada@example\.com/u, "shipping labels must not expose customer email");
assert.doesNotMatch(label, /\+1-555-0100/u, "shipping labels must not expose customer phone");
assert.match(source, /mask|redact|public/i, "implementation should make the privacy transform explicit");
