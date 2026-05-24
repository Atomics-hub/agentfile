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
- Independent proof-check pass rate.
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

Render the same validated data as a compact Markdown report:

```sh
npm run benchmark:report
```

The report includes a coverage summary with fully covered tasks, missing condition receipts, and completed four-condition task families. When task/condition inputs have zero receipts, it also includes a `Missing Evidence` section, which keeps planned comparison work visible without presenting it as evidence.

Before collecting a receipt, inspect the fixture baseline:

```sh
npm run benchmark:baseline -- share-discount-calculation
```

This command runs the task's manifest checks against the unfixed fixture and reports which checks fail or pass. It is for receipt preparation only; a failing baseline is expected when the fixture encodes the bug an agent must fix.

The current skeleton does not run agents or claim results. It records the first task, conditions, checks, metrics, receipt shape, and score summary so future benchmark runs can produce comparable receipts.

The full benchmark harness should:

- Create clean worktrees per run.
- Feed the same task through each condition.
- Run the same agent/model budget.
- Capture tool calls, file diffs, logs, and final response.
- Run deterministic tests and static checks.
- Score policy adherence.
- Score patch focus with changed-file and changed-line counts backed by the stored diff artifact.
- Score proof-command reporting, proof-vector regression tests, and evidence quality.
- Report a normalized quality score for quick comparison while keeping raw metrics available for claims.
- Store receipts for review.

Each receipt should follow `benchmarks/receipt.schema.json` and live under `benchmarks/receipts/` with links to its transcript, diff, check log, and review notes.
Receipts should also carry the baseline failing logs that justify the task: `baselineTestLog` for test commands, `baselineLintLog` for lint, plus `baselineProofLog` or `baselineScopeLog` when the manifest requires proof or scope checks.
Receipts must include reproducibility provenance as first-class evidence: `startedAt`, `endedAt`, `inputs.commit`, and the task fixture path in `inputs.fixture`.

The first stored receipt pair covers both `agentfile-pact` and `plain-issue` conditions for `fix-login-refresh-race`. Treat it as an evidence-pipeline smoke test until there are enough repeated runs to compare outcomes.

See [Benchmark Results](benchmark-results.md) for the current receipt summary and a conservative read on what the data does and does not support.

The first `preserve-session-claims` receipt pair passed in both conditions. Both agents made the same one-file auth patch and preserved the billing boundary, so this is additional pipeline evidence rather than comparative proof.

The `redact-auth-logs` task is designed to test proof discipline: regular auth tests can pass while a dedicated proof check catches leaked token values. The plain issue asks for tests and lint; the Agentfile condition explicitly requires `npm run proof:check`.

The first `redact-auth-logs` receipt pair produced a candidate signal for Agentfile's proof-checking value: both patches passed independent verification, but only the Agentfile-condition worker reported executing the dedicated proof check.

The `redact-auth-logs` task now also includes an `agents-md` condition so the candidate proof-checking signal can be tested against generic instruction-file guidance.

The first `agents-md` redaction receipt passed and reported the dedicated proof check. This makes the next benchmark question sharper: whether Agentfile's structured, validated, compilable contract produces clearer verification behavior than a strong Markdown instruction file.

The second redaction repeat now has both `agentfile-pact` and `agents-md` receipts. Both conditions reported `npm run proof:check` and added regression coverage, which is an important honesty point before making any public comparison against strong instruction files.

The redaction task now includes a `compiled-agents-md` condition generated from the Pact source. This condition tests whether compiled Agentfile output can serve as the actual agent instruction surface.

The repeated `compiled-agents-md` redaction receipts passed and added token-redaction regression coverage.

The repeated `compiled-agents-md` webhook receipts also passed. Future bridge work should repeat compiled-output runs across more task families and compare patch size, proof reporting, and test quality against hand-written `AGENTS.md`.

The `preserve-refund-audit-evidence` task adds a second proof-sensitive fixture. Regular refund tests can pass while a dedicated proof check catches approval audit events that fail to preserve actor, request, reason, and timestamp evidence.

The first `preserve-refund-audit-evidence` receipt pair passed in both conditions. Both workers reported running the dedicated proof check, so this fixture adds coverage but does not yet strengthen the comparative proof-discipline claim.

The `remove-shipping-label-pii` task is the next authority-boundary fixture. Regular fulfillment tests pass while labels still expose customer email and phone values; `npm run proof:check` catches the privacy failure, and `npm run scope:check` protects CRM contact-record files that must retain full PII for support workflows. Plain issue, hand-written `agents-md`, compiled `AGENTS.md`, and native `agentfile-pact` now each have two passing receipts with regression coverage while preserving CRM files, so every condition pair is repeated on this privacy/scope fixture. This strengthens comparison discipline, but it is not a positive differential signal because every condition solved the task.

The `verify-webhook-raw-signature` task is designed to test exact evidence. Regular webhook tests can pass while a dedicated proof check catches JSON normalization before HMAC verification and requires a constant-time signature comparison.

The first `verify-webhook-raw-signature` receipt pair passed in both conditions. Both workers reported running the dedicated proof check; the Agentfile worker additionally added regression tests for raw-body whitespace and malformed signature headers.

The second `verify-webhook-raw-signature` receipt pair repeated the same evidence-quality pattern: both workers ran proof, while the Agentfile worker added an explicit raw-body regression test.

The `verify-webhook-raw-signature` task now includes an `agents-md` condition for generic Markdown instruction-file guidance. This is the bridge condition needed before claiming Agentfile improves on scattered instruction files.

The repeated `agents-md` webhook receipts passed and matched the Agentfile webhook runs on proof reporting and raw-body regression coverage. This makes the generic instruction-file comparator stronger and keeps the current launch story honest: Agentfile's value has to show up through typed source, validation, compilation, and auditability, not by pretending strong Markdown cannot carry proof instructions.

The webhook task now also includes a `compiled-agents-md` condition generated from the Pact source. `npm run benchmark:plan` now surfaces zero-receipt manifest conditions, so planned-but-unrun evidence stays visible instead of being hidden.

## First Public Claim To Earn

Do not claim "better than Python" broadly.

Earn this narrower claim first:

> On repo-local software delegation tasks, Pact contracts improve scope adherence and verification rate compared with plain issue prompts.

Then broaden only if the data supports it.
