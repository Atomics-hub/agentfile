# Benchmark Notes

The fixture baseline passed `npm test -- auth` and `npm run lint`, but failed `npm run proof:check` because serialized auth logs included raw token values.

The `agents-md` worker changed `src/auth/logging.js` and `tests/auth/logging.test.js`. It reported running all required proof commands, including `npm run proof:check`.

Independent verification after the worker finished:

- `npm test -- auth`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This second `agents-md` redaction receipt confirms that strong generic Markdown instructions can also produce proof reporting and regression coverage on this task. That keeps Agentfile's public story honest: the advantage still needs to come from structure, validation, compilation, and auditability rather than from comparing against weak prompts.
