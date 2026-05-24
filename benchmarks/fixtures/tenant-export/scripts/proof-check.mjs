import assert from "node:assert/strict";
import { exportOrdersForTenant } from "../src/exports/orders.js";

const exported = exportOrdersForTenant([
  {
    id: "order-1",
    tenantId: "tenant-a",
    status: "paid",
    totalCents: 4200
  },
  {
    id: "order-2",
    tenantId: "tenant-b",
    status: "paid",
    totalCents: 9900
  },
  {
    id: "order-3",
    tenantId: "tenant-a",
    status: "draft",
    totalCents: 1200
  }
], "tenant-a");

assert.deepEqual(exported.map((order) => order.id), ["order-1"]);
assert.equal(exported.every((order) => order.tenantId === "tenant-a"), true);
assert.equal(exported.some((order) => order.tenantId === "tenant-b"), false);
assert.equal(exported.some((order) => order.status === "draft"), false);
