# Benchmark Notes

The fixture baseline passed `npm test -- webhooks` and `npm run lint`, but failed `npm run proof:check` because it parsed and reserialized JSON before computing the HMAC.

The `compiled-agents-md` worker used generated `AGENTS.md` output from the Pact contract as its actual task authority. It changed `src/webhooks/verify.js` and `tests/webhooks/verify.test.js`, reported all required proof commands, and stayed within the assigned workspace.

Independent verification after the worker finished:

- `npm test -- webhooks`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This run proves the compiled-output bridge on a second proof-sensitive task. The generated instruction file produced a passing patch with explicit raw-body regression coverage and constant-time signature comparison.
