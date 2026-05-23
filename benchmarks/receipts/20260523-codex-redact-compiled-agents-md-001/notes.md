# Benchmark Notes

The fixture baseline passed `npm test -- auth` and `npm run lint`, but failed `npm run proof:check` because raw token values appeared in serialized auth logs.

The `compiled-agents-md` worker used generated `AGENTS.md` output from the Pact contract as its actual task authority. It changed `src/auth/logging.js` and `tests/auth/logging.test.js`, reported all required proof commands, and stayed within the assigned workspace.

Independent verification after the worker finished:

- `npm test -- auth`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed

This run proves the language-to-agent bridge at the benchmark level: Pact source compiled to an existing agent instruction surface, and that generated file was sufficient for a worker to complete and verify the task. The patch was smaller than the hand-written `agents-md` run and updated existing test coverage rather than adding a new test case.
