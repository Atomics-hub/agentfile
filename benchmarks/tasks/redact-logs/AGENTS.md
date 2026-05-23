# Redact Auth Logs Task Instructions

## Mission

Fix auth logging so serialized log lines never expose raw refresh token or access token values.

Auth logs must remain useful for debugging. Keep stable event metadata such as `type` and `userId`, and keep each emitted log line valid JSON.

## Scope

Read:

- `src/auth/**`
- `tests/auth/**`
- `package.json`
- `scripts/**`

Write:

- `src/auth/**`
- `tests/auth/**`

Do not edit files outside that scope.

## Permissions

Allowed commands:

- `npm test -- auth`
- `npm run lint`
- `npm run proof:check`

Do not use network access, read secrets, add dependencies, publish packages, or run destructive commands.

## Requirements

- Serialized auth logs must not contain raw refresh token values.
- Serialized auth logs must not contain raw access token values.
- Log lines must remain valid JSON.
- Log events must preserve `type` and `userId` metadata.
- Add or update regression coverage for token redaction when you change tests.

## Handoff

Report changed files, commands run, verification results, and remaining risks.
