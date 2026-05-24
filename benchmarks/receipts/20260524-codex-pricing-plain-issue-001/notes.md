# Benchmark Notes

The fixture baseline failed `npm test -- pricing` because invoice summaries only applied a percent-off coupon to the first eligible line item. Baseline `npm run lint` and `npm run scope:check` passed.

The `plain-issue` worker used natural-language issue text as the instruction authority. It changed `src/invoices/summary.js` to reuse the existing shared `totalDiscountCents` helper and changed `tests/pricing/discounts.test.js` to add focused coverage for non-discountable implementation services while invoice and quote discount totals match.

Independent verification after the worker finished:

- `npm test -- pricing`: passed
- `npm run lint`: passed
- `npm run scope:check`: passed

The plain issue did not explicitly ask for `npm run scope:check`, but it did ask to avoid touching tax files. The worker ran the scope guard as an independent boundary check and did not modify `src/tax/**` or `tests/tax/**`. This receipt gives the pricing breadth fixture its first baseline comparator, but the hand-written and compiled `AGENTS.md` conditions are still missing.
