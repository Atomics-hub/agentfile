# Benchmark Notes

The fixture baseline passed `npm test -- webhooks` and `npm run lint`, but failed `npm run proof:check` because it parsed and reserialized JSON before computing the HMAC.

The Agentfile worker changed `src/webhooks/verify.js` and `tests/webhooks/verify.test.js`. It reported running all required proof commands, including `npm run proof:check`.

Independent verification after the worker finished:

- `npm test -- webhooks`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This repeat matches the first webhook Agentfile run on the key evidence-quality dimension: the worker added an explicit raw-body regression test in addition to satisfying the proof check.
