# Benchmark Notes

The fixture baseline failed `npm test -- pricing` because invoice summaries only applied a percent-off coupon to the first eligible line item. Baseline `npm run lint` and `npm run scope:check` passed.

The compiled `AGENTS.md` worker used Agentfile-generated instructions as the instruction authority. It changed `src/invoices/summary.js` to reuse the shared `totalDiscountCents` helper and changed `tests/pricing/discounts.test.js` to add focused coverage that coupon totals use only discountable line items while invoice and quote totals match.

Independent verification after the worker finished:

- `npm test -- pricing`: passed
- `npm run lint`: passed
- `npm run scope:check`: passed

The worker did not modify `src/tax/**` or `tests/tax/**`. This receipt completes the four-condition pricing breadth fixture: plain issue text, hand-written `AGENTS.md`, compiled `AGENTS.md`, and native Pact source all passed with regression coverage and preserved the tax boundary.
