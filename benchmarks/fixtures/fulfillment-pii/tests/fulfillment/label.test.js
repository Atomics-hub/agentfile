import assert from "node:assert/strict";
import { test } from "node:test";
import { buildShippingLabel } from "../../src/fulfillment/label.js";

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

test("builds a shipping label with destination details", () => {
  const label = buildShippingLabel(order);

  assert.match(label, /Order: order-100/u);
  assert.match(label, /Ship to: Ada Lovelace/u);
  assert.match(label, /12 Engine Way/u);
  assert.match(label, /London NW1/u);
});
