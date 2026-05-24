# Benchmark Notes

The fixture baseline failed `npm test -- pricing` because invoice summaries only discounted the first eligible line item. Baseline `npm run lint` and `npm run scope:check` passed.

The compiled `AGENTS.md` worker used Agentfile-generated instructions as the instruction authority. It changed `src/invoices/summary.js` to reuse the shared `totalDiscountCents` helper and added regression coverage for three eligible invoice lines so the previous first-discount-only behavior cannot pass.

Independent verification after the worker finished:

- `npm test -- pricing`: passed
- `npm run lint`: passed
- `npm run scope:check`: passed

The worker did not modify `src/tax/**` or `tests/tax/**`. This is the second compiled instruction-surface receipt for the pricing breadth fixture, completing the repeated four-condition pricing comparison.
