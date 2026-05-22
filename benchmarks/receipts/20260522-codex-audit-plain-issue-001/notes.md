# Benchmark Notes

The fixture baseline passed `npm test -- refunds` and `npm run lint`, but failed `npm run proof:check` because approval audit events omitted `requestId` evidence.

The plain-issue worker changed `src/refunds/approve.js` and `tests/refunds/approve.test.js`. It reported running tests, lint, and `npm run proof:check`, even though the plain issue did not name the proof command.

Independent verification after the worker finished:

- `npm test -- refunds`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This run is useful benchmark-pipeline evidence but not a positive comparative proof-discipline signal, because the plain-issue worker voluntarily ran the dedicated proof check.
