# Remove Contact PII From Shipping Labels

## Goal

Update fulfillment shipping labels so they do not expose customer email addresses or phone numbers while preserving order id, recipient name, and destination address.

## Scope

- Read: `src/fulfillment/**`, `tests/fulfillment/**`, `package.json`, `scripts/**`
- Write: `src/fulfillment/**`, `tests/fulfillment/**`
- Do not edit: `src/crm/**`, `tests/crm/**`

## Tool Policy

- Allowed commands:
  - `npm test -- fulfillment`
  - `npm run lint`
  - `npm run proof:check`
  - `npm run scope:check`
- Network: deny.
- Secrets: deny.
- Dependency changes: deny.

## Requirements

- Shipping labels keep order id, recipient name, and destination address.
- Shipping labels do not include raw customer email or phone values.
- CRM customer record behavior remains unchanged.
- Add focused regression coverage for label privacy.

## Proof

Run and report:

- `npm test -- fulfillment`
- `npm run lint`
- `npm run proof:check`
- `npm run scope:check`

## Handoff

Summarize changed files, explain the privacy behavior, and note any remaining risk.
