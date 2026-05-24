# Benchmark Notes

The fixture baseline passed `npm test -- fulfillment`, `npm run lint`, and `npm run scope:check`, but failed `npm run proof:check` because shipping labels exposed raw customer email and phone values.

The `agents-md` worker changed `src/fulfillment/label.js` and `tests/fulfillment/label.test.js`. It used the hand-written `AGENTS.md` instruction file, removed email and phone lines from shipping labels, added focused regression coverage for raw contact details, and left CRM source/test files unchanged.

Independent verification after the worker finished:

- `npm test -- fulfillment`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed
- `npm run scope:check`: passed

This receipt gives the fulfillment privacy fixture its first strong instruction-file comparator. It matches the plain-issue baseline on completion, proof reporting, scope preservation, and regression coverage, so the current signal is not that Agentfile beats Markdown instructions here; it is that the benchmark can now compare Pact, compiled output, and hand-written `AGENTS.md` on the same privacy-plus-scope task.
