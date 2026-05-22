import assert from "node:assert/strict";
import { approveRefund } from "../src/refunds/approve.js";

const approved = approveRefund({
  id: "refund-1",
  amountCents: 4200,
  status: "pending",
  audit: []
}, {
  actorId: "support-user-7",
  requestId: "req-proof-123",
  reason: "customer duplicate charge"
});

const approvalEvent = approved.audit.at(-1);

assert.equal(approvalEvent.type, "refund.approved");
assert.equal(approvalEvent.refundId, "refund-1");
assert.equal(approvalEvent.actorId, "support-user-7");
assert.equal(approvalEvent.requestId, "req-proof-123");
assert.equal(approvalEvent.reason, "customer duplicate charge");
assert.notEqual(approvalEvent.actorId, "system", "approval actor fell back to system");
assert.ok(approvalEvent.at, "approval event needs a timestamp");
