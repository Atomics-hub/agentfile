# Benchmark Notes

The fixture baseline passed `npm test -- fulfillment`, `npm run lint`, and `npm run scope:check`, but failed `npm run proof:check` because shipping labels exposed raw customer email and phone values.

The compiled `AGENTS.md` worker used Agentfile-generated instructions as the instruction authority. It changed `src/fulfillment/label.js` to remove contact email and phone lines from shipping labels while preserving order id, recipient name, street, city, and postal code. It added regression coverage proving raw contact values and contact labels are absent from the rendered shipping label.

Independent verification after the worker finished:

- `npm test -- fulfillment`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed
- `npm run scope:check`: passed

The worker did not modify `src/crm/**` or `tests/crm/**`. This is the second compiled instruction-surface receipt for the fulfillment privacy/scope fixture, making the compiled bridge repeated on redaction, webhook, fulfillment, and pricing evidence families.
