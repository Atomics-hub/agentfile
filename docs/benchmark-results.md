# Benchmark Results

Agentfile benchmark results are still early. These receipts are useful as evidence that the benchmark pipeline works and as a first signal about proof discipline, not as a broad performance claim.

## Current Dataset

As of 2026-05-22, the repository has six validated receipts across three task families. A fourth fixture, `preserve-refund-audit-evidence`, is defined but does not have receipts yet.

| Task | Condition | Completed | Checks passed | Scope adherence | Reported required proof commands | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `fix-login-refresh-race` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint` | Smoke-test receipt. |
| `fix-login-refresh-race` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint` | Smoke-test receipt. |
| `preserve-session-claims` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint`, `npm run scope:check` | Both conditions preserved the billing boundary. |
| `preserve-session-claims` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint`, `npm run scope:check` | Both conditions preserved the billing boundary. |
| `redact-auth-logs` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint` | Independent `proof:check` passed, but the worker did not report running it. |
| `redact-auth-logs` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint`, `npm run proof:check` | Worker reported the dedicated proof check required by the contract. |

## What This Supports

The receipts support a narrow internal statement:

> The current benchmark pipeline can capture comparable agent runs, diffs, check logs, and review notes for plain issue and Agentfile Pact conditions.

The `redact-auth-logs` pair also gives a candidate signal:

> When a dedicated proof command was explicit in the Agentfile contract, the Agentfile-condition worker reported running it; the plain-issue worker did not report running it.

This signal is promising because the fixture is designed so normal tests and lint can pass while `npm run proof:check` catches leaked token values. It is not yet proof that Agentfile improves verification behavior in general.

## What This Does Not Support Yet

Do not use these receipts to claim that Agentfile is broadly better than plain issues, agent instruction files, or programming languages.

The dataset is too small. It has one run per condition per task, one agent family, one repo-local fixture suite, and no repeated randomized trials. The first two task pairs solved equally under both conditions, which is good for pipeline confidence but not comparative evidence.

## Next Evidence To Earn

Before public launch, the benchmark story should either stay framed as a plan or earn more repeated evidence:

- Repeat `redact-auth-logs` several times per condition and track whether proof-command reporting stays different.
- Run matched receipts for `preserve-refund-audit-evidence` so the result is not tied to one task shape.
- Add an `AGENTS.md` or generic instruction-file condition before claiming Agentfile beats scattered instruction files.
- Keep each receipt reviewable: transcript, diff, check log, scope score, verification commands, and handoff quality.

The first public-safe result should stay narrow:

> Agentfile makes proof obligations explicit enough to audit whether an agent reported running the required verification commands.
