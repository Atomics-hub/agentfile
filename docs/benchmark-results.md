# Benchmark Results

Agentfile benchmark results are still early. These receipts are useful as evidence that the benchmark pipeline works and as a first signal about proof discipline, not as a broad performance claim.

## Current Dataset

As of 2026-05-23, the repository has sixteen validated receipts across five task families, including `agents-md` generic instruction-file receipts and compiled `AGENTS.md` receipts generated from Pact source for two proof-sensitive tasks.

| Task | Condition | Completed | Checks passed | Scope adherence | Reported required proof commands | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `fix-login-refresh-race` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint` | Smoke-test receipt. |
| `fix-login-refresh-race` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint` | Smoke-test receipt. |
| `preserve-session-claims` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint`, `npm run scope:check` | Both conditions preserved the billing boundary. |
| `preserve-session-claims` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint`, `npm run scope:check` | Both conditions preserved the billing boundary. |
| `redact-auth-logs` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint` | Independent `proof:check` passed, but the worker did not report running it. |
| `redact-auth-logs` | `agents-md` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint`, `npm run proof:check` | Generic instruction-file worker ran proof and added token-redaction regression coverage. |
| `redact-auth-logs` | `compiled-agents-md` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint`, `npm run proof:check` | Generated Agentfile output was used directly as the worker instruction file and passed. |
| `redact-auth-logs` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint`, `npm run proof:check` | Worker reported the dedicated proof check required by the contract. |
| `preserve-refund-audit-evidence` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- refunds`, `npm run lint`, `npm run proof:check` | Plain issue worker voluntarily ran the proof check. |
| `preserve-refund-audit-evidence` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- refunds`, `npm run lint`, `npm run proof:check` | Agentfile worker ran the proof check required by the contract. |
| `verify-webhook-raw-signature` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- webhooks`, `npm run lint`, `npm run proof:check` | Two plain-issue workers voluntarily ran proof but did not add raw-body regression tests. |
| `verify-webhook-raw-signature` | `agents-md` | Yes | Yes | 1.0 | `npm test -- webhooks`, `npm run lint`, `npm run proof:check` | Generic instruction-file worker ran proof and added raw-body regression coverage. |
| `verify-webhook-raw-signature` | `compiled-agents-md` | Yes | Yes | 1.0 | `npm test -- webhooks`, `npm run lint`, `npm run proof:check` | Generated Agentfile output was used directly and added raw-body regression coverage. |
| `verify-webhook-raw-signature` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- webhooks`, `npm run lint`, `npm run proof:check` | Two Agentfile workers ran proof and added raw-body regression tests. |

## What This Supports

The receipts support a narrow internal statement:

> The current benchmark pipeline can capture comparable agent runs, diffs, check logs, and review notes for plain issue and Agentfile Pact conditions.

`npm run benchmark:plan` now emits a `scoreSummary` from the stored receipts. In the current receipt set, `agentfile-pact` has complete required-check coverage, complete proof-command reporting on proof-sensitive tasks, and stronger inferred evidence quality. The summary also reports average changed-file counts backed by the stored diffs, so patch focus can be compared alongside proof quality. `plain-issue` also completes every task, but its required-check coverage and proof-command reporting are lower because the `redact-auth-logs` plain run did not report `npm run proof:check`.

The original `redact-auth-logs` pair also gives a candidate signal:

> When a dedicated proof command was explicit in the Agentfile contract, the Agentfile-condition worker reported running it; the plain-issue worker did not report running it.

This signal is promising because the fixture is designed so normal tests and lint can pass while `npm run proof:check` catches leaked token values. The first `agents-md` redaction run also reported the proof check and added regression coverage, so the stronger current interpretation is: explicit proof obligations help, and Agentfile needs to prove its advantage over generic instruction files through structure, validation, compilation, and auditability. The first `compiled-agents-md` run shows that a Pact contract can compile into a usable agent instruction surface and still produce a passing, auditable run.

The `preserve-refund-audit-evidence` pair did not reproduce that differential signal. Both workers ran the dedicated proof check and produced passing patches, so this pair strengthens receipt coverage but not the comparative claim.

The `verify-webhook-raw-signature` repeats also did not produce a proof-command differential signal, because both plain-issue workers ran `npm run proof:check`. They did produce a repeated quality signal: both Agentfile workers added explicit raw-body regression tests, while both plain-issue workers only changed implementation. The first `agents-md` run and first `compiled-agents-md` run both matched Agentfile on this task, which is a useful honesty point before any claim that Agentfile beats strong instruction files.

The compiled-output bridge now has passing receipts on both redaction and webhook proof tasks. That supports a narrow implementation claim: Pact source can compile into existing agent instruction surfaces that are concrete enough for agents to execute and for humans to audit.

## What This Does Not Support Yet

Do not use these receipts to claim that Agentfile is broadly better than plain issues, agent instruction files, or programming languages.

The dataset is still small. It has one agent family, one repo-local fixture suite, one repeated task, and no randomized trials. Four task pairs solved or verified equally under both conditions, which is good for pipeline confidence but not broad comparative proof.

## Next Evidence To Earn

Before public launch, the benchmark story should either stay framed as a plan or earn more repeated evidence:

- Repeat `redact-auth-logs` and `verify-webhook-raw-signature` under `agents-md` and `agentfile-pact` to test whether structured contracts outperform strong Markdown instructions.
- Repeat compiled-output runs across more task families and start tracking whether compiled instructions reduce missing proof checks, weaker tests, or oversized patches compared with hand-written instructions.
- Keep each receipt reviewable: transcript, diff, check log, scope score, verification commands, and handoff quality.

The first public-safe result should stay narrow:

> Agentfile makes proof obligations explicit enough to audit whether an agent reported running the required verification commands.
