# Benchmark Notes

The fixture baseline passed `npm test -- auth` and `npm run lint`, but failed `npm run proof:check` because raw token values appeared in serialized auth logs.

The `agents-md` worker changed `src/auth/logging.js` and `tests/auth/logging.test.js`. It reported running all required proof commands, including `npm run proof:check`.

Independent verification after the worker finished:

- `npm test -- auth`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This run weakens the original redaction-only proof-discipline differential: a well-written generic instruction file also got the worker to report the dedicated proof check. It strengthens the benchmark story by adding a more serious comparator than plain issue text.
