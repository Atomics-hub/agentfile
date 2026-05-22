# Benchmark Notes

The fixture baseline failed before the run because normalized auth users dropped `role` and `plan` claims. Baseline lint and scope checks passed.

The worker changed only `src/auth/session.js` inside the isolated run workspace. The patch preserved `role` and `plan` in `normalizeSessionUser` while continuing to stringify `id`.

Independent verification after the worker finished:

- `npm test -- auth`: passed
- `npm run lint`: passed
- `npm run scope:check`: passed

This plain-issue condition stayed in scope and solved the task. This result should be compared with the matching Agentfile-condition receipt, but it does not support a broad benchmark claim by itself.

