# Benchmark Results

Agentfile benchmark results are still early. These receipts are useful as evidence that the benchmark pipeline works and as a first signal about proof discipline, not as a broad performance claim.

## Current Dataset

As of 2026-05-24, the repository has forty-eight validated receipts across eight covered task families. The covered set includes repeated `agents-md` generic instruction-file receipts, fully repeated four-condition redaction, audit-evidence, fulfillment, and pricing fixtures, plus first-pass four-condition tenant-export coverage. The `redact-auth-logs`, `preserve-refund-audit-evidence`, `preserve-tenant-export-isolation`, `remove-shipping-label-pii`, and `share-discount-calculation` fixtures now have matching plain-issue, hand-written `AGENTS.md`, compiled `AGENTS.md`, and native Pact receipts.

| Task | Condition | Completed | Checks passed | Scope adherence | Reported required proof commands | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `fix-login-refresh-race` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint` | Smoke-test receipt. |
| `fix-login-refresh-race` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint` | Smoke-test receipt. |
| `preserve-session-claims` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint`, `npm run scope:check` | Both conditions preserved the billing boundary. |
| `preserve-session-claims` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint`, `npm run scope:check` | Both conditions preserved the billing boundary. |
| `redact-auth-logs` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint` | Two plain-issue workers produced passing redaction patches; independent `proof:check` passed, but neither worker reported running it. |
| `redact-auth-logs` | `agents-md` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint`, `npm run proof:check` | Two generic instruction-file workers ran proof and added token-redaction regression coverage. |
| `redact-auth-logs` | `compiled-agents-md` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint`, `npm run proof:check` | Two generated Agentfile-output workers ran proof and added token-redaction regression coverage. |
| `redact-auth-logs` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- auth`, `npm run lint`, `npm run proof:check` | Two Agentfile workers reported the dedicated proof check required by the contract and added regression coverage. |
| `preserve-refund-audit-evidence` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- refunds`, `npm run lint`, `npm run proof:check` | Two plain-issue workers voluntarily ran the proof check and preserved request evidence. |
| `preserve-refund-audit-evidence` | `agents-md` | Yes | Yes | 1.0 | `npm test -- refunds`, `npm run lint`, `npm run proof:check` | Two hand-written instruction-file workers ran proof and added audit metadata regression coverage. |
| `preserve-refund-audit-evidence` | `compiled-agents-md` | Yes | Yes | 1.0 | `npm test -- refunds`, `npm run lint`, `npm run proof:check` | Two generated Agentfile-output workers ran proof and added audit metadata regression coverage. |
| `preserve-refund-audit-evidence` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- refunds`, `npm run lint`, `npm run proof:check` | Two Agentfile workers ran the proof check required by the contract and preserved request evidence. |
| `preserve-tenant-export-isolation` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- exports`, `npm run lint`, `npm run proof:check` | First plain-issue worker ran proof and added cross-tenant export regression coverage. |
| `preserve-tenant-export-isolation` | `agents-md` | Yes | Yes | 1.0 | `npm test -- exports`, `npm run lint`, `npm run proof:check` | First hand-written instruction-file worker ran proof and added cross-tenant export regression coverage. |
| `preserve-tenant-export-isolation` | `compiled-agents-md` | Yes | Yes | 1.0 | `npm test -- exports`, `npm run lint`, `npm run proof:check` | First generated Agentfile-output worker ran proof and added cross-tenant export regression coverage. |
| `preserve-tenant-export-isolation` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- exports`, `npm run lint`, `npm run proof:check` | First Agentfile worker ran proof and added cross-tenant export regression coverage. |
| `remove-shipping-label-pii` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- fulfillment`, `npm run lint`, `npm run proof:check`, `npm run scope:check` | Two plain-issue workers found and ran proof/scope checks, removed label PII, added regression coverage, and preserved CRM files. |
| `remove-shipping-label-pii` | `agents-md` | Yes | Yes | 1.0 | `npm test -- fulfillment`, `npm run lint`, `npm run proof:check`, `npm run scope:check` | Two hand-written instruction-file workers matched proof reporting, scope preservation, and regression coverage. |
| `remove-shipping-label-pii` | `compiled-agents-md` | Yes | Yes | 1.0 | `npm test -- fulfillment`, `npm run lint`, `npm run proof:check`, `npm run scope:check` | Two generated Agentfile-output workers removed label PII, ran proof/scope checks, and preserved the CRM boundary. |
| `remove-shipping-label-pii` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- fulfillment`, `npm run lint`, `npm run proof:check`, `npm run scope:check` | Two native Pact workers ran proof/scope checks, added regression coverage, and preserved the CRM boundary. |
| `verify-webhook-raw-signature` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- webhooks`, `npm run lint`, `npm run proof:check` | Two plain-issue workers voluntarily ran proof but did not add raw-body regression tests. |
| `verify-webhook-raw-signature` | `agents-md` | Yes | Yes | 1.0 | `npm test -- webhooks`, `npm run lint`, `npm run proof:check` | Two generic instruction-file workers ran proof and added raw-body regression coverage. |
| `verify-webhook-raw-signature` | `compiled-agents-md` | Yes | Yes | 1.0 | `npm test -- webhooks`, `npm run lint`, `npm run proof:check` | Two generated Agentfile-output workers ran proof and added raw-body regression coverage. |
| `verify-webhook-raw-signature` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- webhooks`, `npm run lint`, `npm run proof:check` | Two Agentfile workers ran proof and added raw-body regression tests. |
| `share-discount-calculation` | `plain-issue` | Yes | Yes | 1.0 | `npm test -- pricing`, `npm run lint`, `npm run scope:check` | Two pricing baseline comparators reused shared discount logic, added regression coverage, and preserved the tax boundary. |
| `share-discount-calculation` | `agents-md` | Yes | Yes | 1.0 | `npm test -- pricing`, `npm run lint`, `npm run scope:check` | Two hand-written instruction-file comparators reused shared discount logic, added regression coverage, and preserved the tax boundary. |
| `share-discount-calculation` | `compiled-agents-md` | Yes | Yes | 1.0 | `npm test -- pricing`, `npm run lint`, `npm run scope:check` | Two generated Agentfile-output workers reused shared discount logic, added regression coverage, and preserved the tax boundary. |
| `share-discount-calculation` | `agentfile-pact` | Yes | Yes | 1.0 | `npm test -- pricing`, `npm run lint`, `npm run scope:check` | Two native Pact workers reused shared discount logic, added regression coverage, and preserved the tax boundary. |

## What This Supports

The receipts support a narrow internal statement:

> The current benchmark pipeline can capture comparable agent runs, diffs, check logs, and review notes for plain issue and Agentfile Pact conditions.

`npm run benchmark:plan` now emits a `scoreSummary` from the stored receipts. In the current receipt set, `agentfile-pact` has complete required-check coverage, complete proof-command reporting on proof-sensitive tasks, and stronger inferred evidence quality. The summary also reports average changed-file and changed-line counts backed by the stored diffs, plus a normalized quality score that combines completion, supported checks, proof reporting, regression-test evidence, evidence quality, and patch focus. `plain-issue` also completes every task, but its proof-command reporting is lower because both `redact-auth-logs` plain runs did not report `npm run proof:check`.

The repeated `redact-auth-logs` set gives a candidate signal:

> When a dedicated proof command was explicit in the Agentfile contract, the Agentfile-condition worker reported running it; the plain-issue worker did not report running it.

This signal is promising because the fixture is designed so normal tests and lint can pass while `npm run proof:check` catches leaked token values. It is now repeated for native Pact versus plain issue text and for generated/hand-written instruction files versus plain issue text. The repeated `agents-md` redaction runs also reported the proof check and added regression coverage, so the stronger current interpretation is: explicit proof obligations help, and Agentfile needs to prove its advantage over generic instruction files through structure, validation, compilation, and auditability. The repeated `agentfile-pact` vs `agents-md` comparison remains an honesty point: strong Markdown can match the core proof behavior on this task, while Agentfile still contributes typed source, validation, compilation, and audit structure. The repeated `compiled-agents-md` redaction runs show that a Pact contract can compile into a usable agent instruction surface and still produce passing, auditable work on a proof-sensitive task.

The `preserve-refund-audit-evidence` fixture did not reproduce that differential signal. Native Pact, plain issue, hand-written `AGENTS.md`, and compiled `AGENTS.md` workers all ran the dedicated proof check and produced passing patches, so the repeated four-condition set strengthens non-auth proof-sensitive coverage and comparison discipline but not the comparative claim.

The `preserve-tenant-export-isolation` fixture adds another proof-sensitive domain: tenant-boundary enforcement. Regular export tests and lint passed at baseline, while `npm run proof:check` caught paid orders from another tenant leaking into a tenant-scoped export. The first four-condition set passed under native Pact, plain issue, hand-written `AGENTS.md`, and compiled `AGENTS.md`; every worker ran proof and added a cross-tenant regression test. This broadens proof-sensitive coverage, but it is not a positive differential signal because all four instruction surfaces solved it cleanly.

The `remove-shipping-label-pii` receipts now compare repeated plain issue text, hand-written `AGENTS.md`, compiled `AGENTS.md`, and native Pact source on a privacy proof plus CRM scope boundary. All four instruction surfaces removed raw contact PII from labels, added regression coverage, ran proof and scope checks, and left CRM files unchanged. Every fulfillment condition pair is now repeated, making this fixture useful for comparison discipline and the auditability/compilation story. It does not show a broad Agentfile outcome advantage because all four surfaces solved the task cleanly.

The `verify-webhook-raw-signature` repeats also did not produce a proof-command differential signal, because both plain-issue workers ran `npm run proof:check`. They did produce a repeated quality signal: both Agentfile workers added explicit raw-body regression tests, while both plain-issue workers only changed implementation. The repeated `agents-md` and compiled `AGENTS.md` webhook runs matched Agentfile on proof reporting, proof-pass behavior, and regression coverage. That is a useful honesty point before any claim that Agentfile beats strong instruction files.

The compiled-output bridge now has passing receipts on redaction, audit evidence, tenant export, webhook, fulfillment, and pricing refactor tasks, with repeated compiled-output evidence on redaction proof work, webhook proof work, fulfillment privacy/scope work, and pricing breadth work. That supports a narrow implementation claim: Pact source can compile into existing agent instruction surfaces that are concrete enough for agents to execute and for humans to audit.

The new `share-discount-calculation` fixture now has native Pact, plain-issue, hand-written `AGENTS.md`, and compiled `AGENTS.md` receipts. All four conditions now have two passing receipts with focused regression coverage, making every pricing condition-pair repeated. This is useful breadth and bridge evidence, but not a positive differential signal: all four instruction surfaces solved the task, preserved the tax boundary, and added regression coverage.

## What This Does Not Support Yet

Do not use these receipts to claim that Agentfile is broadly better than plain issues, agent instruction files, or programming languages.

The dataset is still small. It has one agent family, one repo-local fixture suite, three repeated proof-sensitive tasks plus one first-pass tenant-isolation proof task, and no randomized trials. Several task pairs solved or verified equally under both conditions, which is good for pipeline confidence but not broad comparative proof.

## Next Evidence To Earn

Before public launch, the benchmark story should either stay framed as a plan or earn more repeated evidence:

- Use `npm run benchmark:report` for review, but cite underlying receipts in public-facing claims.
- Repeat the tenant-export fixture across all four conditions so the tenant-isolation task becomes repeated evidence instead of first-pass breadth.
- Add another privacy/scope fixture before making public comparative claims from this family.
- Add another proof-sensitive task family to test whether the redaction proof-command signal repeats outside auth logging.
- Add more proof-sensitive task families with repeated `agents-md` and compiled-output conditions to test whether structured contracts show measurable value over strong Markdown instructions.
- Repeat compiled-output runs across more task families and start tracking whether compiled instructions reduce missing proof checks, weaker tests, or oversized patches compared with hand-written instructions.
- Keep each receipt reviewable: transcript, diff, check log, scope score, verification commands, and handoff quality.

The first public-safe result should stay narrow:

> Agentfile makes proof obligations explicit enough to audit whether an agent reported running the required verification commands.

The normalized quality score is a triage aid, not a headline claim. Public claims should cite the underlying receipt evidence and raw metrics.
