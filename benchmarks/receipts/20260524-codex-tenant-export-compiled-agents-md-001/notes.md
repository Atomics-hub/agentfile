# Notes

The compiled `AGENTS.md` worker used Agentfile-generated instructions as the task authority. It changed `src/exports/orders.js` so exports filter by the requested `tenantId` before excluding draft orders and rendering export rows.

The worker added focused regression coverage in `tests/exports/orders.test.js` for mixed-tenant paid orders. It reported and passed `npm test -- exports`, `npm run lint`, and `npm run proof:check`.

This receipt adds the generated-instruction bridge for the tenant-isolation fixture. It supports the claim that Pact source can compile into a usable instruction surface for a different proof-sensitive failure mode.
