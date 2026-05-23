# Changelog

All notable changes to Agentfile will be documented in this file.

The project follows semantic versioning once the first public release is tagged.

## 0.1.0

- Added a README section explaining why Agentfile is source authority for generated instruction files rather than a replacement for strong `AGENTS.md`.
- Added a second `agents-md` webhook benchmark receipt, increasing validated receipts to nineteen and making the strong instruction-file webhook comparator repeated.
- Added a second redaction benchmark repeat for both `agentfile-pact` and `agents-md`, increasing validated receipts to eighteen and adding a repeated strong-instruction comparator.
- `npm run launch:review` now consumes the clean-clone verification report and marks the fast-test gate ready only when it matches the current commit.
- Added `npm run launch:clean-clone` to verify a committed checkout from a temporary clean clone with locked install plus the full launch dry run.
- Added `npm run claims:review` and wired launch review to an automated public-claim scan for launch-facing surfaces.
- Added `npm run launch:dry-run` as a non-publishing pre-public gate that runs checks, benchmark validation, benchmark report rendering, launch review, and the local package privacy check.
- Added `npm run launch:review` to map local evidence to the public-readiness gate.
- Benchmark score summaries and the Markdown report now surface task-local condition-pair counts and repeated comparisons, making one-off evidence gaps explicit.
- Added `npm run benchmark:report` to render validated benchmark evidence as Markdown.
- Added golden tests that keep benchmark `compiled-agentfile.AGENTS.md` task inputs synced with Pact source and the `agents-md` renderer.
- Benchmark score summaries now include a normalized quality score for triaging condition comparisons.
- Benchmark score summaries now include average changed-line counts parsed from receipt diffs.
- Benchmark score summaries now include average changed-file counts so patch focus can be compared across conditions.
- Added the first compiled AGENTS.md webhook benchmark receipt generated from Pact source.
- Added a compiled AGENTS.md webhook benchmark condition generated from Pact source.
- `npm run benchmark:plan` now surfaces zero-receipt manifest conditions, making planned-but-unrun benchmark gaps explicit.
- Added the first compiled AGENTS.md redaction benchmark receipt generated from Pact source.
- Added a compiled AGENTS.md redaction benchmark condition generated from Pact source.
- Tightened benchmark receipt validation so stored receipts must include baseline test/lint/proof/scope logs for the checks each task requires.
- Added the first generic AGENTS.md-style auth-log redaction benchmark receipt.
- Added a generic AGENTS.md-style benchmark condition for auth-log redaction proof checking.
- Added the first generic AGENTS.md-style webhook benchmark receipt, matching Agentfile's proof and regression-test behavior on that task.
- Added a generic AGENTS.md-style benchmark condition for webhook signature verification.
- Added a repeated webhook-signature benchmark receipt pair that reproduced the Agentfile regression-test quality signal.
- Added benchmark score summaries for proof-command reporting, proof-vector regression tests, and evidence quality.
- Added matched webhook-signature benchmark receipts showing both conditions ran proof while Agentfile added stronger regression tests.
- Added a raw-body webhook signature benchmark fixture with exact HMAC proof vectors.
- Added matched audit-evidence benchmark receipts showing both conditions ran the dedicated proof check.
- Added a second proof-sensitive audit-evidence benchmark fixture for refund approval receipts.
- Added a conservative benchmark-results summary for the current receipt set and launch-readiness limits.
- Added matched redact-auth-logs benchmark receipts showing a candidate proof-checking signal for Agentfile.
- Added a redact-auth-logs benchmark fixture that can pass regular tests while requiring a separate token-leak proof check.
- Added matched benchmark receipts for the session-claims scope-boundary fixture.
- Added a harder session-claims benchmark fixture with an explicit billing scope boundary and scope check.
- Added the matching plain-issue benchmark receipt for the auth-race fixture.
- Added an executable auth-race benchmark fixture and one validated Agentfile-condition benchmark receipt.
- Added a benchmark receipt schema, template, and validation path so future evidence can be stored consistently.
- Tightened pre-public package metadata, guarded npm publishing, and added a conservative benchmark skeleton with a plain-issue baseline.
- Split prompt, Pact source, and agent-instruction renderers into focused modules while keeping compiler target orchestration centralized.
- Added golden fixture tests for demo-facing compiler outputs so public examples cannot drift silently.
- Added an end-to-end demo that walks from Pact source to YAML IR, policy JSON, and generated instruction files for existing coding agents.
- Added a public launch readiness gate that defines the required README/demo, CLI, compiler, security, benchmark, and launch-risk standards before the repository goes public.
- Compile target metadata now lives in a central registry, and `agentfile targets` lists supported outputs and default file paths.
- Strict YAML/JSON IR validation now rejects malformed network host allowlist entries and wildcard secret allowlist entries, matching Pact source semantics instead of downgrading them to lint warnings.
- Pact source now rejects duplicate exact metadata and authority entries such as repeated `owner`, `label`, `can run`, `cannot run`, network host, secret, and delimited policy-target declarations instead of silently normalizing them away.
- IR validation now rejects filesystem read/write grants that fall outside declared `scope.include`, keeping mission scope as the outer boundary for file authority.
- `compile --target agent` now renders canonical Pact `.agent` source from the strict contract IR, enabling source-language roundtrips and adapter-friendly source generation.
- Lint warnings now flag contracts that grant secret access without an explicit `secret_access` approval gate.
- Lint warnings now flag risky allowed shell commands that publish artifacts, mutate dependencies, or destroy local state.
- `agentfile init` can now scaffold Pact `.agent` source directly via `--format agent` or a `.agent` output path, making the source language easier to adopt without hand-writing the first mission.
- `parseSource` now only auto-detects Pact when the first non-comment line is a `mission` declaration, avoiding false positives when YAML contracts embed Pact examples in string content.
- `compile --target policy-json` now exports the normalized policy projection already used internally, so automation can consume a smaller policy-oriented JSON surface.
- Pact source quoted strings now support escaped quotes and backslashes, including inline comments after escaped strings.
- `compile` and `sync` now support `CLAUDE.md`, Cursor project rules, and GitHub Copilot instruction targets in addition to `AGENTS.md`.
- Pact source now accepts direct `must`, `must_not`, `should`, and `may` policy statements and generates stable unique ids when lowered policies repeat.
- Pact source now rejects multiple `mission` blocks and duplicate `plan`, `prove`, or `handoff` sections in the same file.
- IR validation now rejects duplicate policy/check/workflow-step ids and exact include/exclude scope conflicts.
- IR validation now rejects duplicate exact scope and authority entries, and approval ids must match Pact's identifier syntax.
- IR validation now rejects exact filesystem allow/deny contradictions and exact write paths that are missing from filesystem read scope.
- Pact source diagnostics now reject exact `touch`/`never` path contradictions and duplicate proof commands.
- Experimental `.agent` source parser for Pact-style mission syntax.
- Pact `handoff` blocks now support structured `list changed_files` and `note ...` review requirements.
- Pact source now supports explicit `ask approval for ...` gates for project-specific authority stops.
- Pact diagnostics now catch missing `goal`/`touch` declarations and duplicate `goal`/`background` lines before lowering to IR.
- Initial Agentfile Contract Language draft.
- YAML parser and validator.
- Prompt, JSON, and `AGENTS.md` compiler targets.
- `init`, `check`, `validate`, `compile`, `sync`, and `explain` CLI commands.
- Security-first defaults for network, shell, secrets, scope expansion, and dependency changes.
