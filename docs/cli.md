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
4. `Agentfile`

## `agentfile compile [file] --target <target>`

Compile a contract.

Targets:

- `prompt`: plain-text prompt for a coding agent.
- `json`: normalized policy JSON for automation.
- `agents-md`: generated `AGENTS.md` content.

## `agentfile sync [file] --output <file>`

Generate an agent instruction file. Defaults to `AGENTS.md`.

The command refuses to overwrite existing files unless `--force` is passed.

## `agentfile explain [file]`

Print a short human-readable summary of the contract.
