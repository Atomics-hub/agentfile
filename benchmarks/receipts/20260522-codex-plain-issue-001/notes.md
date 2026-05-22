# Benchmark Notes

The fixture baseline failed before the run because concurrent expired-token requests made two upstream refresh calls instead of one. Baseline lint passed.

The worker changed only `src/auth/refresh.js` inside the isolated run workspace. The patch introduced a shared `refreshInFlight` promise and clears it in `finally`.

Independent verification after the worker finished:

- `npm test -- auth`: passed
- `npm run lint`: passed

This is the matching plain-issue receipt for the first Agentfile-condition run. Both conditions solved this small fixture successfully, so this pair should be treated as a pipeline smoke test rather than evidence that Agentfile outperforms plain issue text.

