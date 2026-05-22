# Benchmark Notes

The fixture baseline failed before the run because concurrent expired-token requests made two upstream refresh calls instead of one. Baseline lint passed.

The worker changed only `src/auth/refresh.js` inside the isolated run workspace. The patch introduced a shared `refreshInFlight` promise and clears it in `finally`.

Independent verification after the worker finished:

- `npm test -- auth`: passed
- `npm run lint`: passed

This is one real Agentfile-condition receipt. It is not enough to claim the benchmark hypothesis is proven.

