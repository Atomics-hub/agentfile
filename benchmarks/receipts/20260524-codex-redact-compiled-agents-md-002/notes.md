# Benchmark Notes

The fixture baseline passed `npm test -- auth` and `npm run lint`, but failed `npm run proof:check` because raw refresh and access token values appeared in serialized auth logs.

The compiled `AGENTS.md` worker used Agentfile-generated instructions as the instruction authority. It changed `src/auth/logging.js` to emit stable `[REDACTED]` placeholders for refresh and access tokens while preserving type and `userId` metadata. It added regression coverage proving serialized logs do not include raw token values.

Independent verification after the worker finished:

- `npm test -- auth`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This is the second compiled instruction-surface receipt for the redaction proof-sensitive fixture, making the compiled bridge repeated on both webhook and redaction proof families.
