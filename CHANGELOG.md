# Changelog

All notable changes to Agentfile will be documented in this file.

The project follows semantic versioning once the first public release is tagged.

## 0.1.0

- `compile` and `sync` now support `CLAUDE.md`, Cursor project rules, and GitHub Copilot instruction targets in addition to `AGENTS.md`.
- Pact source now accepts direct `must`, `must_not`, `should`, and `may` policy statements and generates stable unique ids when lowered policies repeat.
- Pact source now rejects multiple `mission` blocks and duplicate `plan`, `prove`, or `handoff` sections in the same file.
- IR validation now rejects duplicate policy/check/workflow-step ids and exact include/exclude scope conflicts.
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
