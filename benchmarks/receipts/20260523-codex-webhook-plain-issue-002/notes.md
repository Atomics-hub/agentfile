# Benchmark Notes

The fixture baseline passed `npm test -- webhooks` and `npm run lint`, but failed `npm run proof:check` because it parsed and reserialized JSON before computing the HMAC.

The plain-issue worker changed only `src/webhooks/verify.js`. It reported running tests, lint, and `npm run proof:check`, even though the plain issue did not name the proof command or the exact raw-body proof vectors.

Independent verification after the worker finished:

- `npm test -- webhooks`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This repeat matches the first webhook plain-issue run: the worker found and ran the proof check, but did not add regression tests for raw-body whitespace behavior.
