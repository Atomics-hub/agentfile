# Benchmark Notes

The fixture baseline failed `npm test -- pricing` because invoice summaries only applied a percent-off coupon to the first eligible line item. Baseline `npm run lint` and `npm run scope:check` passed.

The second `plain-issue` pricing worker used natural-language issue text as the instruction authority. It changed `src/invoices/summary.js` to reuse the existing shared `totalDiscountCents` helper and added focused pricing coverage for a later eligible invoice line after a non-discountable setup line.

Independent verification after the worker finished:

- `npm test -- pricing`: passed
- `npm run lint`: passed
- `npm run scope:check`: passed

The plain issue did not explicitly ask for `npm run scope:check`, but it did ask to avoid touching tax files. The worker ran the scope guard as an independent boundary check and did not modify `src/tax/**` or `tests/tax/**`. This gives the pricing breadth fixture a repeated plain-issue baseline comparator.
