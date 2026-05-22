import assert from "node:assert/strict";
import { test } from "node:test";
import { discountForPlan } from "../../src/billing/discounts.js";

test("keeps existing billing plan discounts stable", () => {
  assert.equal(discountForPlan("enterprise"), 0.2);
  assert.equal(discountForPlan("pro"), 0.1);
  assert.equal(discountForPlan("free"), 0);
});

