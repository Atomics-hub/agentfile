# Benchmark Notes

The fixture baseline passed `npm test -- webhooks` and `npm run lint`, but failed `npm run proof:check` because it parsed and reserialized JSON before computing the HMAC.

The Agentfile worker changed `src/webhooks/verify.js` and `tests/webhooks/verify.test.js`. It reported running all required proof commands, including `npm run proof:check`.

Independent verification after the worker finished:

- `npm test -- webhooks`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This run confirms the Agentfile condition made the exact raw-body and constant-time proof obligations explicit. The matched plain-issue worker also ran the proof check, so this pair does not create a proof-command differential signal. It does show a qualitative difference: the Agentfile worker added explicit regression tests for whitespace-sensitive raw bodies and malformed signatures.
