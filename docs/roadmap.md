# Roadmap

## v0.1

- Define the `.agent` source language thesis and first grammar sketch.
- Validate Agentfile YAML.
- Compile to agent prompt.
- Compile to normalized policy JSON.
- Initialize `agentfile.yaml`.
- Publish examples and spec.
- Document the public launch gate and one copy-pasteable end-to-end demo.

## v0.2

- Add formatter and golden fixtures for `.agent`.
- Split target renderers into focused modules.
- Add trace format for agent actions and verification.
- Add GitHub Actions integration.
- Add JSON Schema export.
- Add contract diff command.

## v0.3

- Add benchmark harness comparing plain issue prompts vs Agentfile contracts.
- Add benchmark harness comparing `.agent`, YAML IR, and plain Markdown instructions.
- Add adapters for common coding agents.
- Add policy lint rules for risky authority.

## Later

- Language server support.
- Repository manifest generation.
- MCP policy bridge.
- Signed contracts and attestations.
