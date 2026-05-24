# Benchmark Notes

The fixture baseline passed `npm test -- auth` and `npm run lint`, but failed `npm run proof:check` because raw refresh and access token values appeared in serialized auth logs.

The `plain-issue` worker changed `src/auth/logging.js` and `tests/auth/logging.test.js`. It replaced raw token values with `[REDACTED]`, preserved JSON shape plus `type` and `userId`, and added focused regression assertions that raw tokens are absent from emitted log lines.

The plain issue asked the worker to run auth tests and lint before finishing. The worker reported those requested checks, but did not report `npm run proof:check` because the plain issue did not name that command.

Independent verification after the worker finished:

- `npm test -- auth`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This second plain-issue receipt repeats the redaction proof-discipline signal: the patch satisfies the hidden proof check, but the plain issue text still did not cause the worker to report the dedicated proof command.
