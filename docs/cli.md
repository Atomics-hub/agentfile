# CLI Reference

## `agentfile init [file]`

Create a minimal valid contract. Defaults to `agentfile.yaml`.

Pass `--format agent` or use a `.agent` output path to scaffold Pact source instead of YAML IR:

```sh
agentfile init agentfile.agent
agentfile init starter.txt --format agent
```

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

The exported schema is useful for editor integration, forms, and lightweight structural validation. It intentionally does not replace `agentfile check`, which still enforces semantic invariants such as duplicate ids, scope/permission consistency, and risky authority diagnostics.

## `agentfile sync [file] --target <target> --output <file>`

Generate an agent instruction file.

Targets and default output paths:

- `agents-md` -> `AGENTS.md`
- `claude-md` -> `CLAUDE.md`
- `cursor-mdc` -> `.cursor/rules/agentfile.mdc`
- `copilot-md` -> `.github/copilot-instructions.md`

The command creates parent directories for nested default targets and refuses to overwrite existing files unless `--force` is passed.

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

## `agentfile receipt [file]`

Print a receipt artifact for auditing a completed harness run against the contract.

By default this prints a Markdown checklist. Pass `--format json` for a machine-readable receipt template with pending proof, acceptance, and handoff evidence slots. Pass `--output <file>` to write the artifact; parent directories are created and existing files are protected unless `--force` is passed.

The artifact includes the contract path, task goal, scope, authority, required proof commands, acceptance evidence, handoff evidence, and receipt fields such as agent/model/harness, transcript, diff, check log, and final summary.

```sh
agentfile receipt examples/fix-login-race.agent
agentfile receipt examples/fix-login-race.agent --output receipts/fix-login.md
agentfile receipt examples/fix-login-race.agent --format json --output receipts/fix-login.json
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
