# Benchmark Notes

The fixture baseline again failed `npm test -- pricing` because invoice summaries only applied a percent-off coupon to the first eligible line item. Baseline `npm run lint` and `npm run scope:check` passed, so the fixture syntax and protected tax boundary were healthy before the worker patch.

The second `agentfile-pact` pricing worker used the Pact source contract as the instruction authority. It changed `src/invoices/summary.js` to reuse the shared `totalDiscountCents` helper and added a separate regression test covering a mixed set of discountable and non-discountable line items.

Independent verification after the worker finished:

- `npm test -- pricing`: passed
- `npm run lint`: passed
- `npm run scope:check`: passed

The worker did not modify `src/tax/**` or `tests/tax/**`. This starts the repeated pricing four-way evidence set; the other pricing conditions still need second receipts before pricing has repeated four-condition coverage.
