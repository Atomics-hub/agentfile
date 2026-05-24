import assert from "node:assert/strict";
import { test } from "node:test";
import { exportOrdersForTenant } from "../../src/exports/orders.js";

test("exports paid orders for a tenant", () => {
  const exported = exportOrdersForTenant([
    {
      id: "order-1",
      tenantId: "tenant-a",
      status: "paid",
      totalCents: 4200
    },
    {
      id: "order-2",
      tenantId: "tenant-a",
      status: "draft",
      totalCents: 1100
    }
  ], "tenant-a");

  assert.deepEqual(exported, [
    {
      id: "order-1",
      tenantId: "tenant-a",
      status: "paid",
      totalCents: 4200
    }
  ]);
});
