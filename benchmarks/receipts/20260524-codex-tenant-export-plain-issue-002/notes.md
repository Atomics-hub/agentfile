# Notes

The repeat plain-issue worker used `benchmarks/tasks/tenant-export/plain-issue.md` as the task authority. It changed `src/exports/orders.js` so exports filter by the requested `tenantId` before excluding draft orders and rendering export rows.

The worker added focused regression coverage in `tests/exports/orders.test.js` for mixed-tenant paid orders. It reported and passed `npm test -- exports`, `npm run lint`, and `npm run proof:check`.

This receipt repeats the plain-issue tenant-isolation condition. It strengthens comparison discipline but does not create a positive differential signal because the plain-issue worker found and ran proof.
