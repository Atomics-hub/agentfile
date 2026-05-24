# Benchmark Notes

The fixture baseline passed `npm test -- fulfillment`, `npm run lint`, and `npm run scope:check`, but failed `npm run proof:check` because shipping labels exposed raw customer email and phone values.

The `compiled-agents-md` worker used the generated `compiled-agentfile.AGENTS.md` instruction file. It changed `src/fulfillment/label.js` and `tests/fulfillment/label.test.js`, removed email and phone lines from shipping labels, added focused regression coverage for raw contact details, and left CRM source/test files unchanged.

Independent verification after the worker finished:

- `npm test -- fulfillment`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed
- `npm run scope:check`: passed

The worker reported an initial `npm run proof:check` failure before making the redaction explicit through `redactedContact`, then reran proof successfully. This receipt supports the compiled-output bridge claim while honestly recording one correction turn.
