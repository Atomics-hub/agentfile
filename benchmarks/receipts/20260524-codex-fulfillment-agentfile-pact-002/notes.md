# Benchmark Notes

The fixture baseline passed `npm test -- fulfillment`, `npm run lint`, and `npm run scope:check`, but failed `npm run proof:check` because shipping labels exposed raw customer email and phone values.

The native Pact worker used `benchmarks/tasks/fulfillment-pii/fulfillment-pii.agent` as the source contract. It changed `src/fulfillment/label.js` to emit only public shipping label lines and removed raw contact email and phone output. It added regression coverage proving raw email and phone values are absent while recipient and destination data remain present.

Independent verification after the worker finished:

- `npm test -- fulfillment`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed
- `npm run scope:check`: passed

The worker stayed within `src/fulfillment/**` and `tests/fulfillment/**`; no CRM source or test files changed. This is the second native Pact receipt for the fulfillment privacy/scope fixture.
