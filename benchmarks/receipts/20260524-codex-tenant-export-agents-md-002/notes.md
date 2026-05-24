# Notes

The repeat hand-written instruction-file worker used `benchmarks/tasks/tenant-export/AGENTS.md` as the task authority. It changed `src/exports/orders.js` so exports filter by the requested `tenantId` before excluding draft orders and rendering export rows.

The worker added focused regression coverage in `tests/exports/orders.test.js` for mixed-tenant paid orders. It reported and passed `npm test -- exports`, `npm run lint`, and `npm run proof:check`.

This receipt repeats the hand-written instruction-file tenant-isolation condition and keeps strong Markdown as a serious comparator.
