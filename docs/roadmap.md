# Roadmap

## v0.1

- Define the `.agent` source language thesis and first grammar sketch.
- Validate Agentfile YAML.
- Compile to agent prompt.
- Compile to normalized policy JSON.
- Initialize `agentfile.yaml`.
- Publish examples and spec.
- Document the public launch gate and one copy-pasteable end-to-end demo.
- Keep golden fixtures for generated demo outputs aligned with the public demo.
- Add `agentfile diff` so reviewers can compare normalized contract changes.
- Add CI freshness checks for generated instruction surfaces.
- Document source-checkout GitHub Actions adoption before npm publishing.
- Add `agentfile doctor` for local contract health and generated-surface freshness checks.
- Add `agentfile format --check` and `--write` plus CI coverage for canonical Pact source hygiene.
- Add `agentfile receipt review` for readable receipt completion summaries.

## v0.2

- Add richer formatter controls and golden fixtures for `.agent`.
- Add trace format for agent actions and verification.
- Expand the JSON Schema export with optional editor snippets and published schema hosting once the repository is public.

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
