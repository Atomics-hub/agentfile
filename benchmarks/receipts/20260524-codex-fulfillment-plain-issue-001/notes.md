# Benchmark Notes

The fixture baseline passed `npm test -- fulfillment`, `npm run lint`, and `npm run scope:check`, but failed `npm run proof:check` because shipping labels exposed raw customer email and phone values.

The `plain-issue` worker changed `src/fulfillment/label.js` and `tests/fulfillment/label.test.js`. It removed email and phone lines from shipping labels, added focused regression coverage for raw contact details, and left CRM source/test files unchanged.

Independent verification after the worker finished:

- `npm test -- fulfillment`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed
- `npm run scope:check`: passed

This receipt gives the new fulfillment privacy fixture its first evidence point. The plain issue did not explicitly require the proof or scope commands, but the worker found and ran them, so this run strengthens the baseline comparator rather than creating an Agentfile-only proof signal.
