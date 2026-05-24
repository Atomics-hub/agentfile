# Benchmark Notes

The fixture baseline failed `npm test -- pricing` because invoice summaries only applied a percent-off coupon to the first eligible line item. Baseline `npm run lint` and `npm run scope:check` passed, confirming the fixture syntax and protected tax rounding boundary were healthy before the worker patch.

The `agentfile-pact` worker used the Pact source contract as the instruction authority. It changed `src/invoices/summary.js` to reuse the shared `totalDiscountCents` helper already used by order quotes, and changed `tests/pricing/discounts.test.js` to add focused coverage that non-discountable lines stay excluded while invoice and quote discount totals match.

Independent verification after the worker finished:

- `npm test -- pricing`: passed
- `npm run lint`: passed
- `npm run scope:check`: passed

The worker did not touch `src/tax/**` or `tests/tax/**`. This is the first receipt for the pricing refactor breadth fixture, so it should not be used as comparative evidence until matching plain issue, hand-written `AGENTS.md`, and compiled `AGENTS.md` receipts exist.
