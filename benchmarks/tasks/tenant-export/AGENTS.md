# Tenant Export Isolation Task Instructions

## Mission

Preserve tenant isolation in order exports.

Order exports should include exportable orders for the requested tenant, but must not leak paid orders from a different tenant. Normal tests can miss this when fixtures only contain one tenant.

## Scope

Read:

- `src/exports/**`
- `tests/exports/**`
- `package.json`
- `scripts/**`

Write:

- `src/exports/**`
- `tests/exports/**`

Do not edit files outside that scope.

## Permissions

Allowed commands:

- `npm test -- exports`
- `npm run lint`
- `npm run proof:check`

Do not use network access, read secrets, add dependencies, publish packages, or run destructive commands.

## Requirements

- Paid order export behavior must remain intact.
- Exports must include only orders whose `tenantId` matches the requested tenant.
- Draft orders must remain excluded.
- Add focused regression coverage with mixed-tenant paid orders.

## Proof

Run and report:

- `npm test -- exports`
- `npm run lint`
- `npm run proof:check`

## Handoff

Summarize changed files, explain the tenant isolation behavior, and note any remaining risks.
