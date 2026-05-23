# Benchmark Notes

The fixture baseline passed `npm test -- auth` and `npm run lint`, but failed `npm run proof:check` because serialized auth logs included raw token values.

The Agentfile worker changed `src/auth/logging.js` and `tests/auth/logging.test.js`. It reported running all required proof commands, including `npm run proof:check`.

Independent verification after the worker finished:

- `npm test -- auth`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This is the second redaction `agentfile-pact` receipt. It keeps the proof-command and regression-test signal, while giving the redaction task a repeated comparator against strong Markdown instructions.
