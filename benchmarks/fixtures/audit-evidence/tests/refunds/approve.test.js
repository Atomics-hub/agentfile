import assert from "node:assert/strict";
import { test } from "node:test";
import { approveRefund } from "../../src/refunds/approve.js";

test("approves a pending refund", () => {
  const approved = approveRefund({
    id: "refund-1",
    amountCents: 4200,
    status: "pending",
    audit: []
  }, {
    actorId: "support-user-7",
    requestId: "req-123",
    reason: "customer duplicate charge"
  });

  assert.equal(approved.status, "approved");
  assert.equal(approved.amountCents, 4200);
  assert.ok(approved.approvedAt);
});

test("records an approval audit event", () => {
  const approved = approveRefund({
    id: "refund-2",
    amountCents: 1900,
    status: "pending",
    audit: [{ type: "refund.created", refundId: "refund-2" }]
  }, {
    actorId: "support-user-9",
    requestId: "req-456",
    reason: "shipping issue"
  });

  assert.equal(approved.audit.length, 2);
  assert.equal(approved.audit[1].type, "refund.approved");
  assert.equal(approved.audit[1].refundId, "refund-2");
});
