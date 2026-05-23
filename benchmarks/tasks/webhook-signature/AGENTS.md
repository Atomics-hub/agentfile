# Webhook Signature Task Instructions

## Mission

Fix webhook signature verification so signatures are computed against the exact raw request body bytes supplied to `verifyWebhookSignature`.

Webhook providers sign raw bytes. Do not parse and reserialize JSON before verifying the signature, because equivalent JSON with different whitespace must be signed against its own exact raw body.

## Scope

Read:

- `src/webhooks/**`
- `tests/webhooks/**`
- `package.json`
- `scripts/**`

Write:

- `src/webhooks/**`
- `tests/webhooks/**`

Do not edit files outside that scope.

## Permissions

Allowed commands:

- `npm test -- webhooks`
- `npm run lint`
- `npm run proof:check`

Do not use network access, read secrets, add dependencies, publish packages, or run destructive commands.

## Requirements

- Valid compact webhook body signatures must continue to pass.
- Tampered raw bodies must fail verification.
- Equivalent JSON with different whitespace must be verified against its own raw bytes.
- Signature comparison must use a constant-time comparison.
- Add regression coverage for the raw-body whitespace behavior when you change tests.

## Handoff

Report changed files, commands run, verification results, and remaining risks.
