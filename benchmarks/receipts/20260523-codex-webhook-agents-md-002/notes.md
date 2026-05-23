# Benchmark Notes

The fixture baseline passed `npm test -- webhooks` and `npm run lint`, but failed `npm run proof:check` because it normalized JSON before HMAC verification and did not provide the required constant-time comparison.

The `agents-md` worker changed only `src/webhooks/verify.js` and `tests/webhooks/verify.test.js`. It reported running all required commands, including the dedicated proof check.

Independent verification after the worker finished:

- `npm test -- webhooks`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This second generic instruction-file webhook run matched the Agentfile webhook runs on proof reporting, proof-check success, and raw-body regression coverage. That makes the current public-readiness interpretation more disciplined: Agentfile can compile and audit this work as structured source, but strong `AGENTS.md` instructions remain a serious comparator on task behavior.
