import assert from "node:assert/strict";
import { test } from "node:test";
import { customerRecordForSupport } from "../../src/crm/customer-records.js";

test("keeps CRM contact records complete for support workflows", () => {
  assert.deepEqual(customerRecordForSupport({
    id: "cus-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+1-555-0100",
    tags: ["vip"]
  }), {
    id: "cus-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+1-555-0100",
    tags: ["vip"]
  });
});
