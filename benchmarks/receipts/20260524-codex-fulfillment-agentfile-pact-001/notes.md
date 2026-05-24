# Benchmark Notes

The fixture baseline passed `npm test -- fulfillment`, `npm run lint`, and `npm run scope:check`, but failed `npm run proof:check` because shipping labels exposed raw customer email and phone values.

The `agentfile-pact` worker used the Pact source contract as the instruction authority. It changed `src/fulfillment/label.js` and `tests/fulfillment/label.test.js`, removed email and phone lines from shipping labels, added focused regression coverage for raw contact details, and left CRM source/test files unchanged.

Independent verification after the worker finished:

- `npm test -- fulfillment`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed
- `npm run scope:check`: passed

This receipt completes the four-condition fulfillment privacy comparison: plain issue text, hand-written `AGENTS.md`, compiled `AGENTS.md`, and native Pact source all passed the privacy proof and CRM scope boundary. The run supports the auditability/compilation story more than an outcome advantage on this fixture.
