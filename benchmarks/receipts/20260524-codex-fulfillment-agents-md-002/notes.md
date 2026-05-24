# Benchmark Notes

The fixture baseline passed `npm test -- fulfillment`, `npm run lint`, and `npm run scope:check`, but failed `npm run proof:check` because shipping labels exposed raw customer email and phone values.

The hand-written `AGENTS.md` worker used `benchmarks/tasks/fulfillment-pii/AGENTS.md` as the instruction authority. It changed `src/fulfillment/label.js` to keep public shipping fields while dropping raw contact email and phone lines. It added regression coverage proving the sample email and phone are absent while order id and recipient name remain present.

Independent verification after the worker finished:

- `npm test -- fulfillment`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed
- `npm run scope:check`: passed

The worker stayed within `src/fulfillment/**` and `tests/fulfillment/**`; no CRM source or test files changed. This is the second hand-written instruction-file receipt for the fulfillment privacy/scope fixture.
