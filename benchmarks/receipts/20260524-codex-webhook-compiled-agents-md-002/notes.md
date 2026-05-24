# Benchmark Notes

The fixture baseline passed `npm test -- webhooks` and `npm run lint`, but failed `npm run proof:check` because the implementation parsed and reserialized JSON before computing the HMAC.

The compiled `AGENTS.md` worker used Agentfile-generated instructions as the instruction authority. It changed `src/webhooks/verify.js` to compute HMAC over exact raw bytes, validate the `sha256=` signature shape, and compare digests with `timingSafeEqual`. It added raw-body regression coverage for whitespace-sensitive JSON plus malformed signature headers.

Independent verification after the worker finished:

- `npm test -- webhooks`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This is the second compiled instruction-surface receipt for the webhook proof-sensitive fixture, making the Agentfile/compiled-output webhook comparator repeated.
