# Benchmark Notes

The fixture baseline failed `npm test -- pricing` because invoice summaries only applied a percent-off coupon to the first eligible line item. Baseline `npm run lint` and `npm run scope:check` passed.

The hand-written `AGENTS.md` worker used generic Markdown instructions as the instruction authority. It changed `src/invoices/summary.js` to reuse the shared `totalDiscountCents` helper and changed `tests/pricing/discounts.test.js` to add focused coverage that discount totals stay limited to discountable lines while invoice and quote totals match.

Independent verification after the worker finished:

- `npm test -- pricing`: passed
- `npm run lint`: passed
- `npm run scope:check`: passed

The worker did not modify `src/tax/**` or `tests/tax/**`. This receipt adds the hand-written instruction-file comparator for the pricing breadth fixture; the compiled `AGENTS.md` condition remains the final missing pricing condition.
