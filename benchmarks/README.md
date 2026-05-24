# Benchmarks

Agentfile benchmark work starts conservative: define comparable tasks and inputs first, then collect agent runs later.

The first skeleton compares bounded repo-local tasks under two conditions:

- Plain issue text.
- Agentfile Pact source.

Preview the benchmark plan:

```sh
npm run benchmark:plan
```

Render the same validated data as a compact Markdown report:

```sh
npm run benchmark:report
```

Inspect a fixture baseline before collecting a receipt:

```sh
npm run benchmark:baseline -- share-discount-calculation
```

The current command validates that benchmark inputs exist, validates any JSON receipts in `benchmarks/receipts/`, cross-checks receipt command metadata against the attached logs and diffs, rejects unsupported or duplicate reported verification commands, and requires `testsPassed` claims to be backed by matching test commands in `check.log`. It does not run agents and it does not claim results. The Markdown report also lists zero-receipt task/condition inputs as missing evidence so planned runs stay visible.

The score summary is intentionally narrow. It tracks completion, test pass rate, scope adherence, required-check coverage, changed-file and changed-line counts, proof-command reporting, independent proof-check pass rate, proof-vector regression tests, handoff quality, inferred evidence quality, a normalized quality score from stored receipts, and task-local condition-pair comparison counts so one-off results are not mistaken for repeated evidence.

The normalized quality score is only a triage aid. Use the raw receipt metrics for claims.

See [Benchmark Results](../docs/benchmark-results.md) for the current receipt summary and the limits on what those receipts can claim.

The first stored receipt pair covers both `agentfile-pact` and `plain-issue` conditions for `fix-login-refresh-race`. Both solved this small fixture, so the pair is useful as a receipt-format proof and smoke test, not as evidence that one condition outperforms the other.

The `preserve-session-claims` fixture is harder: it includes similarly named billing behavior that is intentionally out of scope, plus `npm run scope:check` to catch forbidden billing edits.

The first `preserve-session-claims` receipt pair also passed in both conditions. Both agents made the same one-file auth patch and preserved the billing boundary.

The `redact-auth-logs` fixture stresses proof discipline: regular auth tests can pass while `npm run proof:check` still catches raw token leakage. The Agentfile condition names that proof check explicitly.

The first `redact-auth-logs` receipt pair produced the first useful comparative signal: both conditions made passing patches, but only the Agentfile condition reported running the dedicated proof check.

The `redact-auth-logs` task now also includes an `agents-md` condition so the proof-checking signal can be tested against generic instruction-file guidance.

The first `agents-md` redaction receipt passed and reported the dedicated proof check, so the comparison is now more serious: Agentfile must show measurable value over strong instruction files through structure, validation, compilation, and auditability.

The second redaction repeat now has both `agentfile-pact` and `agents-md` receipts. Both conditions reported proof and added regression coverage, so this task currently supports explicit-proof-obligation claims more than broad superiority claims.

The task also includes a `compiled-agents-md` condition that uses `agentfile compile --target agents-md` output as the actual worker input. This tests the language-to-agent bridge directly instead of treating Pact source and hand-written Markdown as separate worlds.

The first `compiled-agents-md` redaction receipt passed with all proof commands reported, showing generated Agentfile output can function as the actual agent instruction surface.

The `preserve-refund-audit-evidence` fixture adds a second proof-sensitive task in a different domain. Regular refund tests can pass while `npm run proof:check` still catches missing request evidence in the approval audit trail.

The first `preserve-refund-audit-evidence` receipt pair passed in both conditions. Both workers reported running `npm run proof:check`, so the pair is useful coverage but not a positive differential signal.

The `remove-shipping-label-pii` fixture is the next authority-boundary task. It combines a privacy proof check with a CRM scope boundary: fulfillment labels must drop raw email and phone values, while CRM customer records must remain untouched and complete. The first plain-issue, hand-written `agents-md`, compiled `AGENTS.md`, and native `agentfile-pact` receipts all passed and added regression coverage. This gives the fixture a complete four-way comparison, but it should be repeated before public outcome claims.

The `verify-webhook-raw-signature` fixture is a harder proof-sensitive security task. Regular webhook tests pass against compact JSON, while `npm run proof:check` catches implementations that parse and reserialize JSON instead of verifying HMAC signatures against exact raw request body bytes.

The first `verify-webhook-raw-signature` receipt pair passed in both conditions. Both workers reported running `npm run proof:check`; the Agentfile worker also added explicit regression tests for raw-body and malformed-signature cases.

The second `verify-webhook-raw-signature` receipt pair repeated the useful quality signal: both conditions ran proof, but the Agentfile worker again added a raw-body regression test while the plain-issue worker only changed implementation.

The `verify-webhook-raw-signature` task now also includes an `agents-md` condition so Agentfile can be compared against generic Markdown instruction-file guidance, not only plain issue text.

The repeated `agents-md` webhook receipts passed and matched the Agentfile webhook runs on proof reporting and raw-body regression coverage. That makes generic instruction files a real comparator, not a strawman, and keeps the current Agentfile edge focused on typed source, validation, compilation, and auditability.

The first `compiled-agents-md` webhook receipt also passed and added raw-body regression coverage, giving a second proof-sensitive bridge receipt for compiled Agentfile output.

The `share-discount-calculation` fixture is the next breadth test. It moves beyond proof-sensitive security/privacy work into a normal multi-file pricing refactor: invoices and order quotes must share eligible-line coupon totals while the tax rounding module remains out of scope. It has plain issue, hand-written `AGENTS.md`, compiled `AGENTS.md`, and native Pact inputs. The first native Pact receipt passed with regression coverage and preserved the tax boundary; matching comparator receipts are still needed before making outcome claims.

## First Claim To Test

> On repo-local software delegation tasks, Agentfile contracts improve scope adherence and verification rate compared with plain issue prompts.

Do not publish this as a result until benchmark receipts exist.

## Receipt Requirements

Each real benchmark run should store:

- Input condition and model/agent version.
- Exact repository provenance: `inputs.commit`, `inputs.fixture`, and the `startedAt`/`endedAt` window for the run.
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
`npm run benchmark:plan` now rejects receipts that omit commit SHA, fixture path, or run timestamps, because benchmark claims need reproducible provenance as well as pass/fail logs.
The `runId` should use `YYYYMMDD-agent-task-slug-condition-id-NNN`; `npm run benchmark:plan` now cross-checks that suffix against the manifest task slug and condition so receipts stay sortable and auditable.
