# Benchmark Notes

The fixture baseline passed `npm test -- auth` and `npm run lint`, but failed `npm run proof:check` because raw token values appeared in serialized auth logs.

The plain-issue worker changed `src/auth/logging.js` and `tests/auth/logging.test.js`. It reported running tests and lint, but did not report running `npm run proof:check` because the plain issue did not name that command.

Independent verification after the worker finished:

- `npm test -- auth`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This run is a useful proof-discipline signal: the patch satisfied the proof check, but the worker did not report executing the proof command.

