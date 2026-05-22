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
