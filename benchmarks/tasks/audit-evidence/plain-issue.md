# Preserve Refund Audit Evidence

Refund approvals should leave enough audit metadata for support and compliance review.

Update refund approval so the approval audit event keeps the useful context from the request. The refund should still be approved, existing audit events should remain in place, and the new approval audit event should identify who approved the refund and why.

Please update the implementation and run the refund tests and lint before finishing.
