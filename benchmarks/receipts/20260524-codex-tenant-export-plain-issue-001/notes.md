# Notes

The plain-issue worker used the natural-language tenant export task as the instruction authority. It changed `src/exports/orders.js` so exports filter by the requested `tenantId` before excluding draft orders and rendering export rows.

The worker added focused regression coverage in `tests/exports/orders.test.js` for mixed-tenant paid orders. It reported and passed `npm test -- exports`, `npm run lint`, and `npm run proof:check`.

This receipt adds the first tenant-isolation proof-sensitive family. The plain issue did not name the proof command, but the worker ran it, so this receipt is useful coverage rather than a positive proof-reporting differential.
