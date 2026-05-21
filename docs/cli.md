# CLI Reference

## `agentfile init [file]`

Create a minimal valid contract. Defaults to `agentfile.yaml`.

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

- Broad network access with `permissions.network.default: allow`.
- Network allowlist entries that include wildcards, schemes, or paths instead of bare hosts.
- Broad secret access with `permissions.secrets.access: allow` and no explicit allowlist.
- Secret allowlist wildcards instead of concrete secret names.
- Repository-wide filesystem write patterns such as `**`.

## `agentfile compile [file] --target <target>`

Compile a contract.

Targets:

- `prompt`: plain-text prompt for a coding agent.
- `json`: strict JSON contract IR for automation.
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
