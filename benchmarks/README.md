# Benchmarks

Agentfile benchmark work starts conservative: define comparable tasks and inputs first, then collect agent runs later.

The first skeleton compares bounded repo-local tasks under two conditions:

- Plain issue text.
- Agentfile Pact source.

Preview the benchmark plan:

```sh
npm run benchmark:plan
```

The current command validates that benchmark inputs exist, validates any JSON receipts in `benchmarks/receipts/`, cross-checks receipt command metadata against the attached logs and diffs, and prints the planned task, conditions, checks, metrics, receipt count, and score summary. It does not run agents and it does not claim results.

The score summary is intentionally narrow. It tracks completion, test pass rate, scope adherence, required-check coverage, changed-file and changed-line counts, proof-command reporting, proof-vector regression tests, handoff quality, and inferred evidence quality from stored receipts.

See [Benchmark Results](../docs/benchmark-results.md) for the current receipt summary and the limits on what those receipts can claim.

The first stored receipt pair covers both `agentfile-pact` and `plain-issue` conditions for `fix-login-refresh-race`. Both solved this small fixture, so the pair is useful as a receipt-format proof and smoke test, not as evidence that one condition outperforms the other.

The `preserve-session-claims` fixture is harder: it includes similarly named billing behavior that is intentionally out of scope, plus `npm run scope:check` to catch forbidden billing edits.

The first `preserve-session-claims` receipt pair also passed in both conditions. Both agents made the same one-file auth patch and preserved the billing boundary.

The `redact-auth-logs` fixture stresses proof discipline: regular auth tests can pass while `npm run proof:check` still catches raw token leakage. The Agentfile condition names that proof check explicitly.

The first `redact-auth-logs` receipt pair produced the first useful comparative signal: both conditions made passing patches, but only the Agentfile condition reported running the dedicated proof check.

The `redact-auth-logs` task now also includes an `agents-md` condition so the proof-checking signal can be tested against generic instruction-file guidance.

The first `agents-md` redaction receipt passed and reported the dedicated proof check, so the comparison is now more serious: Agentfile must beat strong instruction files through structure, validation, compilation, and auditability.

The task also includes a `compiled-agents-md` condition that uses `agentfile compile --target agents-md` output as the actual worker input. This tests the language-to-agent bridge directly instead of treating Pact source and hand-written Markdown as separate worlds.

The first `compiled-agents-md` redaction receipt passed with all proof commands reported, showing generated Agentfile output can function as the actual agent instruction surface.

The `preserve-refund-audit-evidence` fixture adds a second proof-sensitive task in a different domain. Regular refund tests can pass while `npm run proof:check` still catches missing request evidence in the approval audit trail.

The first `preserve-refund-audit-evidence` receipt pair passed in both conditions. Both workers reported running `npm run proof:check`, so the pair is useful coverage but not a positive differential signal.

The `verify-webhook-raw-signature` fixture is a harder proof-sensitive security task. Regular webhook tests pass against compact JSON, while `npm run proof:check` catches implementations that parse and reserialize JSON instead of verifying HMAC signatures against exact raw request body bytes.

The first `verify-webhook-raw-signature` receipt pair passed in both conditions. Both workers reported running `npm run proof:check`; the Agentfile worker also added explicit regression tests for raw-body and malformed-signature cases.

The second `verify-webhook-raw-signature` receipt pair repeated the useful quality signal: both conditions ran proof, but the Agentfile worker again added a raw-body regression test while the plain-issue worker only changed implementation.

The `verify-webhook-raw-signature` task now also includes an `agents-md` condition so Agentfile can be compared against generic Markdown instruction-file guidance, not only plain issue text.

The first `agents-md` webhook receipt passed and matched the Agentfile webhook runs on proof reporting and raw-body regression coverage. That makes generic instruction files a real comparator, not a strawman.

The first `compiled-agents-md` webhook receipt also passed and added raw-body regression coverage, giving a second proof-sensitive bridge receipt for compiled Agentfile output.

## First Claim To Test

> On repo-local software delegation tasks, Agentfile contracts improve scope adherence and verification rate compared with plain issue prompts.

Do not publish this as a result until benchmark receipts exist.

## Receipt Requirements

Each real benchmark run should store:

- Input condition and model/agent version.
- Tool-call transcript or equivalent execution log.
- Patch diff that supports any reported changed-file counts or regression-test claims.
- Check results.
- Check logs that actually show the verification commands claimed in the receipt metadata.
- Baseline failing logs for each manifest check. At minimum this means `baselineTestLog` for test commands and `baselineLintLog` for lint; proof-sensitive tasks also need `baselineProofLog`, and scope-boundary tasks need `baselineScopeLog`.
- Scope adherence score.
- Verification command execution score.
- Proof-command reporting and proof-vector regression-test status when relevant.
- Evidence quality: `missing`, `weak`, `adequate`, or `strong`. Explicit claims must not exceed what the attached logs and diff support, though conservative underclaims are allowed.
- Final handoff quality notes.

Use [templates/receipt.template.json](templates/receipt.template.json) for new runs. Receipt JSON files belong under `benchmarks/receipts/`, alongside transcript, diff, check log, and notes artifacts.
