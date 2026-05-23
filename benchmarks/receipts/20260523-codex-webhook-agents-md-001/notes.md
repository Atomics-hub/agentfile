# Benchmark Notes

The fixture baseline passed `npm test -- webhooks` and `npm run lint`, but failed `npm run proof:check` because it parsed and reserialized JSON before computing the HMAC.

The `agents-md` worker changed `src/webhooks/verify.js` and `tests/webhooks/verify.test.js`. It reported running all required proof commands, including `npm run proof:check`.

Independent verification after the worker finished:

- `npm test -- webhooks`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This run is an important comparison point: a well-written generic `AGENTS.md` instruction file matched the Agentfile webhook repeats on task completion, proof-command reporting, and raw-body regression-test coverage.
