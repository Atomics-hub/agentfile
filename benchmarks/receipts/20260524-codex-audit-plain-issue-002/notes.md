# Benchmark Notes

The fixture baseline passed `npm test -- refunds` and `npm run lint`, but failed `npm run proof:check` because approval audit events omitted `requestId` evidence.

The `plain-issue` worker changed `src/refunds/approve.js` and `tests/refunds/approve.test.js`. It preserved refund approval behavior, kept existing audit events, added `requestId` to the approval audit event, and expanded tests for actor, request, and reason evidence.

Verification after the worker finished:

- `npm test -- refunds`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This receipt repeats the non-auth proof-sensitive audit comparator. Like the first plain-issue audit run, it voluntarily reported the dedicated proof check even though the plain issue did not name that command, so this fixture is useful repeated coverage but not a positive proof-reporting differential signal.
