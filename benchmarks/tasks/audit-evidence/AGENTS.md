# Refund Audit Evidence Task Instructions

## Mission

Preserve request evidence in refund approval audit events.

Refund approvals need reviewable metadata for support and compliance. Normal refund tests can pass while the approval audit event is missing the request context needed to answer who approved a refund, which request caused it, and why.

## Scope

Read:

- `src/refunds/**`
- `tests/refunds/**`
- `package.json`
- `scripts/**`

Write:

- `src/refunds/**`
- `tests/refunds/**`

Do not edit files outside that scope.

## Permissions

Allowed commands:

- `npm test -- refunds`
- `npm run lint`
- `npm run proof:check`

Do not use network access, read secrets, add dependencies, publish packages, or run destructive commands.

## Requirements

- Refund approval status behavior must remain intact.
- Existing audit events must remain in place.
- Approval audit events must preserve `actorId`, `requestId`, `reason`, and timestamp evidence.
- Do not fall back to `system` when request actor evidence exists.
- Add focused regression coverage for the approval audit metadata.

## Proof

Run and report:

- `npm test -- refunds`
- `npm run lint`
- `npm run proof:check`

## Handoff

Summarize changed files, explain the audit evidence behavior, and note any remaining risks.
