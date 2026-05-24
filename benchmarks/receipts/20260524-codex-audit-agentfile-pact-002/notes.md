# Benchmark Notes

The fixture baseline passed `npm test -- refunds` and `npm run lint`, but failed `npm run proof:check` because the refund approval audit event did not preserve `requestId` evidence.

The native Pact worker changed `src/refunds/approve.js` and `tests/refunds/approve.test.js`. It preserved refund approval behavior, kept the existing audit event sequence, added `requestId` to the approval audit event, and expanded regression coverage for actor, request, reason, timestamp, and non-system actor evidence.

Verification after the worker finished:

- `npm test -- refunds`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This receipt starts the repeated non-auth proof-sensitive audit fixture for the native Pact condition. It strengthens evidence that Pact proof obligations are useful beyond auth log redaction; the next matching comparator should repeat the plain-issue audit condition.
