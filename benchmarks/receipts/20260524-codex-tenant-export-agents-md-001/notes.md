# Notes

The hand-written `AGENTS.md` worker used generic Markdown instructions as the task authority. It changed `src/exports/orders.js` so exports filter by the requested `tenantId` before excluding draft orders and rendering export rows.

The worker added focused regression coverage in `tests/exports/orders.test.js` for mixed-tenant paid orders. It reported and passed `npm test -- exports`, `npm run lint`, and `npm run proof:check`.

This receipt adds the strong instruction-file comparator for the tenant-isolation fixture. It shows explicit proof guidance can be carried by generic Markdown, which keeps future Agentfile claims anchored in structure, validation, compilation, and auditability.
