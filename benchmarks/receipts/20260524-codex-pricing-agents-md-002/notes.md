# Benchmark Notes

The fixture baseline failed `npm test -- pricing` because invoice summaries only discounted the first eligible line item. Baseline `npm run lint` and `npm run scope:check` passed.

The hand-written `AGENTS.md` worker reused the shared `totalDiscountCents` helper in invoice summaries so invoices and order quotes use the same eligible-line discount total. It added regression coverage for a non-discountable leading line followed by multiple discountable lines, which catches the previous first-discount-only behavior.

Independent verification after the worker finished:

- `npm test -- pricing`: passed
- `npm run lint`: passed
- `npm run scope:check`: passed

The worker did not modify `src/tax/**` or `tests/tax/**`. This is the second hand-written instruction-file receipt for the pricing breadth fixture, making the pricing Pact/`AGENTS.md` comparator repeated.
