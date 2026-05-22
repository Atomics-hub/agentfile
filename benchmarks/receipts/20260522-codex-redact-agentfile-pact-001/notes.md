# Benchmark Notes

The fixture baseline passed `npm test -- auth` and `npm run lint`, but failed `npm run proof:check` because raw token values appeared in serialized auth logs.

The Agentfile worker changed `src/auth/logging.js` and `tests/auth/logging.test.js`. It reported running all required proof commands, including `npm run proof:check`.

Independent verification after the worker finished:

- `npm test -- auth`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This run is a useful proof-discipline signal: unlike the plain-issue condition, the Agentfile condition reported the explicit proof check required by the contract.

