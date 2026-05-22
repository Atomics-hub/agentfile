# Benchmark Notes

The fixture baseline passed `npm test -- refunds` and `npm run lint`, but failed `npm run proof:check` because approval audit events omitted `requestId` evidence.

The Agentfile worker changed `src/refunds/approve.js` and `tests/refunds/approve.test.js`. It reported running all required proof commands, including `npm run proof:check`.

Independent verification after the worker finished:

- `npm test -- refunds`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This run confirms the Agentfile condition made the proof obligation explicit and the worker reported satisfying it. The matched plain-issue worker also ran the proof check, so this pair does not create the same differential signal as `redact-auth-logs`.
