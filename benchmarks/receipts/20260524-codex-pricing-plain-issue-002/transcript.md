# Run Transcript

Condition: `plain-issue`

Input authority: `benchmarks/tasks/pricing-refactor/plain-issue.md`

Summary:

- Read the natural-language issue text and inspected invoice summaries, order quote behavior, shared pricing helpers, and focused pricing tests.
- Ran baseline checks in an isolated copy of `benchmarks/fixtures/pricing-refactor`.
- Observed the intended baseline: `npm test -- pricing` failed, while `npm run lint` and `npm run scope:check` passed.
- Replaced invoice-only first-coupon logic with the shared `totalDiscountCents` helper from `src/pricing/discounts.js`.
- Added a regression test that catches coupons being skipped for later eligible invoice lines.
- Ran final verification: `npm test -- pricing`, `npm run lint`, and `npm run scope:check`.

Files changed in the worker patch:

- `src/invoices/summary.js`
- `tests/pricing/discounts.test.js`

Final handoff:

Invoice summaries now use the same shared discount helper as order quotes, including later eligible lines after non-discountable entries. Tax rounding files were outside scope and remained unchanged.
