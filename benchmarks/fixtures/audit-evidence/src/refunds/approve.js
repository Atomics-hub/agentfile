export function approveRefund(refund, context = {}) {
  const approvalEvent = {
    type: "refund.approved",
    refundId: refund.id,
    actorId: context.actorId ?? "system",
    reason: context.reason ?? "not-provided",
    at: new Date().toISOString()
  };

  return {
    ...refund,
    status: "approved",
    approvedAt: approvalEvent.at,
    audit: [...(refund.audit ?? []), approvalEvent]
  };
}
