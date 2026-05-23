# Benchmark Plan

Agentfile must prove that the language improves agent work.

## Hypothesis

For bounded software tasks, a constrained source language with explicit scope, authority, invariants, proof, and handoff requirements should improve scope adherence and verification behavior compared with plain natural-language issues and generic instruction files.

## Conditions To Compare

Each task should run under at least four prompt/input conditions:

1. Plain issue text.
2. `AGENTS.md` or equivalent Markdown instructions.
3. YAML contract IR.
4. Pact source language compiled to contract IR and instructions.

## Metrics

- Task completion rate.
- Test pass rate.
- Scope adherence.
- Unauthorized tool use attempts.
- Verification command execution rate.
- Proof-command reporting rate.
- Proof-vector regression-test rate.
- Evidence quality.
- Patch size.
- Human review time.
- Number of correction turns.
- Token use.
- Plan quality before edits.
- Final handoff quality.

## Task Families

- Bug fix with regression test.
- Refactor with public API invariant.
- Security-sensitive change with forbidden paths.
- Documentation update with citation/evidence requirements.
- Multi-file feature with strict edit scope.
- Dependency update requiring approval.
- Research synthesis with untrusted web data.
- Release notes generation from git history.

## Harness

The benchmark skeleton in `benchmarks/` starts with matched plain-issue and Agentfile conditions for bounded repo-local tasks. The first task is a small auth race fix. The second task adds an explicit scope boundary with billing files that must remain unchanged.

Preview the benchmark plan:

```sh
npm run benchmark:plan
```

The current skeleton does not run agents or claim results. It records the first task, conditions, checks, metrics, receipt shape, and score summary so future benchmark runs can produce comparable receipts.

The full benchmark harness should:

- Create clean worktrees per run.
- Feed the same task through each condition.
- Run the same agent/model budget.
- Capture tool calls, file diffs, logs, and final response.
- Run deterministic tests and static checks.
- Score policy adherence.
- Score proof-command reporting, proof-vector regression tests, and evidence quality.
- Store receipts for review.

Each receipt should follow `benchmarks/receipt.schema.json` and live under `benchmarks/receipts/` with links to its transcript, diff, check log, and review notes.
Receipts should also carry the baseline failing logs that justify the task: `baselineTestLog` for test commands, `baselineLintLog` for lint, plus `baselineProofLog` or `baselineScopeLog` when the manifest requires proof or scope checks.

The first stored receipt pair covers both `agentfile-pact` and `plain-issue` conditions for `fix-login-refresh-race`. Treat it as an evidence-pipeline smoke test until there are enough repeated runs to compare outcomes.

See [Benchmark Results](benchmark-results.md) for the current receipt summary and a conservative read on what the data does and does not support.

The first `preserve-session-claims` receipt pair passed in both conditions. Both agents made the same one-file auth patch and preserved the billing boundary, so this is additional pipeline evidence rather than comparative proof.

The `redact-auth-logs` task is designed to test proof discipline: regular auth tests can pass while a dedicated proof check catches leaked token values. The plain issue asks for tests and lint; the Agentfile condition explicitly requires `npm run proof:check`.

The first `redact-auth-logs` receipt pair produced a candidate signal for Agentfile's proof-checking value: both patches passed independent verification, but only the Agentfile-condition worker reported executing the dedicated proof check.

The `redact-auth-logs` task now also includes an `agents-md` condition so the candidate proof-checking signal can be tested against generic instruction-file guidance.

The first `agents-md` redaction receipt passed and reported the dedicated proof check. This makes the next benchmark question sharper: whether Agentfile's structured, validated, compilable contract beats a strong Markdown instruction file.

The redaction task now includes a `compiled-agents-md` condition generated from the Pact source. This condition tests whether compiled Agentfile output can serve as the actual agent instruction surface.

The first `compiled-agents-md` redaction receipt passed. The next useful bridge test is to add the same compiled-output condition to `verify-webhook-raw-signature`.

The `preserve-refund-audit-evidence` task adds a second proof-sensitive fixture. Regular refund tests can pass while a dedicated proof check catches approval audit events that fail to preserve actor, request, reason, and timestamp evidence.

The first `preserve-refund-audit-evidence` receipt pair passed in both conditions. Both workers reported running the dedicated proof check, so this fixture adds coverage but does not yet strengthen the comparative proof-discipline claim.

The `verify-webhook-raw-signature` task is designed to test exact evidence. Regular webhook tests can pass while a dedicated proof check catches JSON normalization before HMAC verification and requires a constant-time signature comparison.

The first `verify-webhook-raw-signature` receipt pair passed in both conditions. Both workers reported running the dedicated proof check; the Agentfile worker additionally added regression tests for raw-body whitespace and malformed signature headers.

The second `verify-webhook-raw-signature` receipt pair repeated the same evidence-quality pattern: both workers ran proof, while the Agentfile worker added an explicit raw-body regression test.

The `verify-webhook-raw-signature` task now includes an `agents-md` condition for generic Markdown instruction-file guidance. This is the bridge condition needed before claiming Agentfile improves on scattered instruction files.

The first `agents-md` webhook receipt passed and matched the Agentfile webhook runs on proof reporting and raw-body regression coverage. The next benchmark step is to repeat that condition and add generic instruction-file conditions to other proof-sensitive fixtures.

The webhook task now also includes a `compiled-agents-md` condition generated from the Pact source. `npm run benchmark:plan` now surfaces zero-receipt manifest conditions, so this bridge condition is visible as planned-but-unrun evidence until the first compiled webhook receipt is collected.

## First Public Claim To Earn

Do not claim "better than Python" broadly.

Earn this narrower claim first:

> On repo-local software delegation tasks, Pact contracts improve scope adherence and verification rate compared with plain issue prompts.

Then broaden only if the data supports it.
