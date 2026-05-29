# CLI Reference

## `agentfile adopt [file]`

Scaffold Agentfile into an existing repository with the full source-first adoption kit. Defaults to `agentfile.agent`.

```sh
agentfile adopt
agentfile adopt agentfile.agent
agentfile adopt agentfile.agent --surfaces agents-md,claude-md
agentfile adopt agentfile.agent --surfaces none
```

By default this creates:

- Pact `.agent` source.
- VS Code schema and settings files.
- Every default generated instruction surface: `AGENTS.md`, `CLAUDE.md`, Cursor rules, and GitHub Copilot instructions.
- `.github/workflows/agentfile.yml` with contract inspection, generated-surface drift checks, and a conditional `receipts/latest.receipt.json` verification gate.
- `schemas/receipt-evidence.schema.json`, plus `schemas/receipt-check-results.schema.json` when `--run-checks` is used, so the generated workflow can drift-check structured receipt inputs.

Use `--schema <file>` to choose the committed editor schema path, `--surfaces <targets>` to limit generated instruction files, `--receipt <file>` to choose the receipt path checked by the generated workflow, and `--run-checks` to add command-backed check execution plus structured check-result schema setup.

`adopt` preflights every planned output path before writing, so an existing repo is not partially modified when an Agentfile surface already exists.

## `agentfile init [file]`

Create a minimal valid contract. Defaults to `agentfile.yaml`, or `agentfile.agent` when `--format agent` or `--kit reviewable` is used without a file path.

Use the reviewable kit for the fastest source-first setup:

```sh
agentfile init --kit reviewable
```

That creates Pact `.agent` source, VS Code schema settings, and a GitHub Actions validation workflow with a conditional `receipts/latest.receipt.json` verification gate.

Pass `--format agent` or use a `.agent` output path to scaffold Pact source instead of YAML IR:

```sh
agentfile init agentfile.agent
agentfile init starter.txt --format agent
```

Pass `--editor vscode` to also create `.vscode/agentfile.schema.json` and `.vscode/settings.json` in the same preflighted setup:

```sh
agentfile init agentfile.agent --editor vscode
agentfile init agentfile.agent --editor vscode --schema schemas/agentfile.schema.json
```

Pass `--github-actions` to also create `.github/workflows/agentfile.yml` for source-checkout contract validation:

```sh
agentfile init agentfile.agent --github-actions
agentfile init agentfile.agent --github-actions --github-actions-surfaces agents-md,claude-md
agentfile init agentfile.agent --github-actions --github-actions-receipt receipts/latest.receipt.json
```

By default the generated workflow validates the contract without checking generated instruction surfaces, so the starter workflow is runnable before adopting `AGENTS.md` or `CLAUDE.md`. Use `--github-actions-surfaces` when `init` should also create selected generated surfaces and wire workflow drift checks for them.

`init` refuses to overwrite any planned output path before writing files, so editor or workflow setup does not leave a partially initialized project when an existing schema, settings file, workflow, or generated surface is present.

## `agentfile check [file]`

Validate a contract. `validate` is an alias.

The CLI accepts either:

- `.agent` source files using the experimental Pact syntax.
- YAML/JSON contract IR files.

If no file is provided, the CLI searches:

1. `agentfile.yaml`
2. `agentfile.json`
3. `.agent/agentfile.yaml`
4. `agentfile.agent`
5. `.agent/agentfile.agent`
6. `.agent/agentfile.json`
7. `Agentfile`

## `agentfile lint [file]`

Report non-blocking warnings for risky authority and broad permissions.

The initial lint pass flags:

- Contracts with no proof obligations in `checks` or `workflow.acceptance`.
- Contracts that rely only on manual proof and do not define an executable `checks[*].command`.
- Repository-wide mission scope include patterns such as `**`.
- Broad network access with `permissions.network.default: allow`.
- Allowed network access without `network_access` in `permissions.approvals.requiredFor`.
- Broad secret access with `permissions.secrets.access: allow` and no explicit allowlist.
- Allowed secret access without `secret_access` in `permissions.approvals.requiredFor`.
- Repository-wide filesystem read patterns such as `**`.
- Repository-wide filesystem write patterns such as `**`.
- Publish, dependency-changing, or destructive shell commands without matching approval gates such as `release_publish`, `dependency_change`, or `destructive_write`.

## `agentfile doctor [file]`

Run the adoption health check for a contract. `doctor` validates the contract, reports lint warnings, and checks the default generated instruction-file locations for freshness:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/agentfile.mdc`
- `.github/copilot-instructions.md`

Missing generated files are reported as `not found` without failing, so projects can adopt one surface at a time. Existing generated files must match the current contract output; stale surfaces make the command exit non-zero and print the matching `agentfile sync ... --force` command.

```sh
agentfile doctor examples/fix-login-race.agent
```

Pass `--format json` for CI, dashboards, or other tooling that needs the same status without parsing terminal prose:

```sh
agentfile doctor examples/fix-login-race.agent --format json
```

## `agentfile inspect [file]`

Print a review summary that combines the contract task, scope and authority counts, workflow proof/receipt readiness, doctor status, and generated surface freshness:

```sh
agentfile inspect examples/fix-login-race.agent
```

Pass `--format json` for tooling that needs the same project-readiness summary:

```sh
agentfile inspect examples/fix-login-race.agent --format json
```

Use `--strict` when `inspect` is acting as a CI gate after default generated surfaces have been adopted. Strict mode fails on stale generated surfaces, missing default generated surfaces, and lint warnings:

```sh
agentfile inspect examples/fix-login-race.agent --strict --format json
```

Use `--fail-on` for a narrower gate. Accepted checks are `stale-surfaces`, `missing-surfaces`, and `lint`; the default is `stale-surfaces`:

```sh
agentfile inspect examples/fix-login-race.agent --fail-on stale-surfaces,lint --format json
```

## `agentfile surfaces [file]`

Inspect the generated instruction surfaces for a contract without writing files. The command shows the file-backed targets, their default output paths, whether an adopted default file is missing, stale, or up to date, and the size of the generated content:

```sh
agentfile surfaces examples/fix-login-race.agent
```

Pass `--format json` when tooling needs the same inspection data:

```sh
agentfile surfaces examples/fix-login-race.agent --format json
```

## `agentfile github-actions [file]`

Print a GitHub Actions workflow that checks out Agentfile from source, builds the CLI, runs `inspect --fail-on stale-surfaces,lint`, and checks adopted generated instruction surfaces:

```sh
agentfile github-actions agentfile.agent > .github/workflows/agentfile.yml
```

Use `--output` to write the workflow and `--check` to verify a committed workflow has not drifted:

```sh
agentfile github-actions agentfile.agent --output .github/workflows/agentfile.yml --force
agentfile github-actions agentfile.agent --output .github/workflows/agentfile.yml --check
```

By default the workflow checks `AGENTS.md` and `CLAUDE.md`. Use `--surfaces` to pick committed generated surfaces, or `none` for a validation-only workflow:

```sh
agentfile github-actions agentfile.agent --surfaces agents-md,claude-md,cursor-mdc
agentfile github-actions agentfile.agent --surfaces none
```

Use `--tool-ref` to pin the Agentfile checkout and `--receipt` to add receipt verification:

```sh
agentfile github-actions agentfile.agent --tool-ref v0.1.0 --receipt receipts/latest.receipt.json
```

Use `--run-checks` when the project workflow should execute command-backed checks from the contract and emit receipt-ready check artifacts before receipt verification:

```sh
agentfile github-actions agentfile.agent --run-checks --receipt receipts/latest.receipt.json
agentfile github-actions agentfile.agent --run-checks --checks-log artifacts/checks.txt --checks-results artifacts/check-results.json
```

Generated workflows also drift-check committed receipt input schemas when present: `schemas/receipt-check-results.schema.json` for check-result JSON and `schemas/receipt-evidence.schema.json` for structured acceptance or handoff evidence.

Projects that need dependency installation, services, or environment setup should add those workflow steps before the generated `Run contract checks` step.

## `agentfile format [file]`

Print canonical Pact `.agent` source for a contract:

```sh
agentfile format examples/fix-login-race.agent
```

Pass `--write` to update a `.agent` source file in place, or `--check` to fail when the file is not already canonical:

```sh
agentfile format agentfile.agent --write
agentfile format agentfile.agent --check
npm run source:format:check
```

`format` can print Pact source from a representable YAML/JSON contract, but `--write` and `--check` are limited to Pact source files so the command does not replace IR files with source text by accident.

## `agentfile compile [file] --target <target>`

Compile a contract.

Targets:

- `agent`: canonical Pact `.agent` source generated from the contract IR.
- `prompt`: plain-text prompt for a coding agent.
- `json`: strict JSON contract IR for automation.
- `policy-json`: normalized policy JSON projection for policy engines and audit tooling.
- `yaml`: canonical YAML contract IR.
- `agents-md`: generated `AGENTS.md` content.
- `claude-md`: generated `CLAUDE.md` project memory.
- `cursor-mdc`: generated Cursor project rule content for `.cursor/rules/agentfile.mdc`.
- `copilot-md`: generated GitHub Copilot repository instructions.

## `agentfile targets`

List supported compile targets, descriptions, and default output paths for file-backed targets.

## `agentfile schema`

Print the JSON Schema for the strict Agentfile YAML/JSON contract IR:

```sh
agentfile schema > agentfile.schema.json
```

Use `--output` and `--check` when the schema is committed for editor integration:

```sh
agentfile schema --output .vscode/agentfile.schema.json --force
agentfile schema --output .vscode/agentfile.schema.json --check
```

The exported schema is useful for editor integration, forms, and lightweight structural validation. It intentionally does not replace `agentfile check`, which still enforces semantic invariants such as duplicate ids, scope/permission consistency, and risky authority diagnostics.

## `agentfile editor vscode`

Print VS Code workspace settings that associate the generated Agentfile JSON Schema with YAML and JSON contract IR files:

```sh
agentfile editor vscode
```

Use it with `agentfile schema` to commit editor setup and drift-check it later:

```sh
agentfile schema --output .vscode/agentfile.schema.json --force
agentfile editor vscode --output .vscode/settings.json --force
agentfile editor vscode --output .vscode/settings.json --check
```

Pass `--schema` when the schema is committed somewhere else:

```sh
agentfile editor vscode --schema schemas/agentfile.schema.json
```

The generated settings target YAML/JSON contract IR files such as `agentfile.yaml`, `agentfile.yml`, and `agentfile.json`. Pact `.agent` source uses Agentfile's parser and formatter rather than JSON Schema.

For CI setup, see [GitHub Actions Integration](github-actions.md).

## `agentfile sync [file] --target <target> --output <file>`

Generate an agent instruction file.

Targets and default output paths:

- `agents-md` -> `AGENTS.md`
- `claude-md` -> `CLAUDE.md`
- `cursor-mdc` -> `.cursor/rules/agentfile.mdc`
- `copilot-md` -> `.github/copilot-instructions.md`

The command creates parent directories for nested default targets and refuses to overwrite existing files unless `--force` is passed.

Pass `--all` to generate every file-backed target at its default path in one preflighted operation. `--all` cannot be combined with `--target` or `--output`:

```sh
agentfile sync examples/fix-login-race.agent --all
agentfile sync examples/fix-login-race.agent --all --force
```

Pass `--check` to verify an existing generated file is up to date without writing. This is useful in CI when `AGENTS.md`, `CLAUDE.md`, Cursor rules, or Copilot instructions should remain projections of the `.agent` source:

```sh
agentfile sync examples/fix-login-race.agent --target agents-md --output AGENTS.md --check
agentfile sync examples/fix-login-race.agent --all --check
npm run surfaces:check
```

## `agentfile explain [file]`

Print a short human-readable summary of the contract.

## `agentfile diff <before> <after>`

Compare two contracts after parsing and normalization.

This is useful during review when a `.agent` source change needs to be understood as a contract change instead of only a text diff. By default the command prints a text report:

```sh
agentfile diff examples/fix-login-race.agent changed.agent
```

Pass `--format json` for automation:

```sh
agentfile diff examples/fix-login-race.agent changed.agent --format json
```

## `agentfile checks run [file]`

Run command-backed checks from the contract and write both a combined check log and structured check results JSON that can feed `receipt fill --check-results`.

The command runs every executable check, records failed checks in the results file, and exits nonzero when any required check fails. Optional check failures are recorded but do not fail the command.

```sh
agentfile checks run examples/fix-login-race.agent
agentfile checks run examples/fix-login-race.agent --log logs/checks.txt --results logs/check-results.json
agentfile receipt fill examples/fix-login-race.agent receipts/latest.receipt.json --check-results logs/check-results.json --write
```

## `agentfile receipt [file]`

Print a receipt artifact for auditing a completed harness run against the contract.

By default this prints a Markdown checklist. Pass `--format json` for a machine-readable receipt template with pending proof, acceptance, and handoff evidence slots. Pass `--output <file>` to write the artifact; parent directories are created and existing files are protected unless `--force` is passed.

The artifact includes the contract path, task goal, scope, authority, required proof commands, acceptance evidence, handoff evidence, and receipt fields such as agent/model/harness, transcript, diff, check log, and final summary.

```sh
agentfile receipt examples/fix-login-race.agent
agentfile receipt examples/fix-login-race.agent --output receipts/fix-login.md
agentfile receipt examples/fix-login-race.agent --format json --output receipts/fix-login.json
```

## `agentfile receipt init [file]`

Create a machine-readable receipt template at `receipts/latest.receipt.json`, the default path used by generated GitHub Actions receipt gates. The file starts with pending proof, acceptance, and handoff slots for the harness to fill after work finishes.

```sh
agentfile receipt init examples/fix-login-race.agent
agentfile receipt init examples/fix-login-race.agent --output receipts/custom.receipt.json
```

## `agentfile receipt fill <contract> <receipt>`

Fill command-backed proof entries in a JSON receipt from a check log or structured check results.

With `--check-log`, the command looks for each contract check command in the supplied log. Matching proof entries are marked `status: "passed"` with the log path as evidence.

With `--check-results`, the command reads JSON shaped like `{ "checks": [{ "id": "npm-test", "status": "passed", "evidence": "logs/test.txt" }] }`. Entries can match by `id` or `command`; accepted statuses are `passed`, `failed`, and `skipped`. Failed or skipped results are recorded in the receipt but still fail `receipt verify` for required proof.

`receipt fill` only updates command-backed proof. Use `receipt evidence` for explicit acceptance and handoff evidence before `receipt verify`.

By default the updated receipt is printed to stdout. Pass `--write` to update the receipt file in place.

```sh
agentfile receipt fill examples/fix-login-race.agent receipts/latest.receipt.json --check-log logs/checks.txt
agentfile receipt fill examples/fix-login-race.agent receipts/latest.receipt.json --check-results logs/check-results.json
agentfile receipt fill examples/fix-login-race.agent receipts/latest.receipt.json --check-log logs/checks.txt --write
```

## `agentfile receipt evidence <contract> <receipt>`

Fill acceptance and handoff evidence slots in a JSON receipt. Select items by 1-based position or exact contract text with `--acceptance <item=evidence>` and `--handoff <item=evidence>`. Repeat either option to fill multiple items. Pass `--surface <file>` to record the generated instruction surface used for the run.

Harnesses and wrappers can pass `--evidence-file <file>` instead. The file must be JSON shaped like:

```json
{
  "generatedInstructionSurfaceUsed": "AGENTS.md",
  "acceptance": [
    { "selector": 1, "evidence": "tests/auth/session.test.ts" }
  ],
  "handoff": [
    { "selector": "Attach or link the check log.", "evidence": "logs/checks.txt" }
  ]
}
```

`selector` accepts a 1-based item number or exact item text. `evidence` may be a non-empty string, array, object, number, or boolean.

By default the updated receipt is printed to stdout. Pass `--write` to update the receipt file in place.

```sh
agentfile receipt evidence examples/fix-login-race.agent receipts/latest.receipt.json --acceptance "1=tests/auth/session.test.ts"
agentfile receipt evidence examples/fix-login-race.agent receipts/latest.receipt.json --handoff "Attach or link the check log.=logs/checks.txt"
agentfile receipt evidence examples/fix-login-race.agent receipts/latest.receipt.json --surface AGENTS.md --acceptance "1=tests/auth/session.test.ts" --handoff "1=logs/agent-run.txt" --write
agentfile receipt evidence examples/fix-login-race.agent receipts/latest.receipt.json --evidence-file logs/receipt-evidence.json --write
```

## `agentfile receipt evidence-schema`

Print, write, or drift-check the JSON Schema for the structured `--evidence-file` input accepted by `receipt evidence`. This gives wrappers, CI jobs, and harness adapters a stable local contract for the acceptance and handoff evidence file they produce before handing it to Agentfile.

```sh
agentfile receipt evidence-schema
agentfile receipt evidence-schema --output schemas/receipt-evidence.schema.json
agentfile receipt evidence-schema --output schemas/receipt-evidence.schema.json --check
```

## `agentfile receipt check-results-schema`

Print, write, or drift-check the JSON Schema for the structured `--check-results` input accepted by `receipt fill`. This gives wrappers, CI jobs, and harness adapters a stable local contract for the check-result file they produce before handing it to Agentfile.

```sh
agentfile receipt check-results-schema
agentfile receipt check-results-schema --output schemas/receipt-check-results.schema.json
agentfile receipt check-results-schema --output schemas/receipt-check-results.schema.json --check
```

## `agentfile receipt verify <contract> <receipt>`

Verify a filled JSON receipt against its source contract.

The verifier checks that the receipt task, scope, authority, required proof, acceptance evidence, and handoff evidence still match the contract. Required proof items must have `status: "passed"` and non-empty evidence. Acceptance and handoff items must have `status: "satisfied"` and non-empty evidence.

```sh
agentfile receipt verify examples/fix-login-race.agent receipts/fix-login.json
```

Checked-in lifecycle examples:

```sh
agentfile receipt verify examples/fix-login-race.agent examples/receipts/fix-login-passing.receipt.json
agentfile receipt verify examples/fix-login-race.agent examples/receipts/fix-login-pending.receipt.json
```

## `agentfile receipt review <contract> <receipt>`

Print a review summary for a filled JSON receipt. The command shows receipt status, generated instruction surface, required proof completion, acceptance evidence completion, handoff evidence completion, and any verification issues. Pass `--format json` for automation. It exits non-zero when the receipt does not satisfy the contract.

```sh
agentfile receipt review examples/fix-login-race.agent examples/receipts/fix-login-passing.receipt.json
agentfile receipt review examples/fix-login-race.agent examples/receipts/fix-login-passing.receipt.json --format json
agentfile receipt review examples/fix-login-race.agent examples/receipts/fix-login-pending.receipt.json
```
