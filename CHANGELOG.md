# Changelog

All notable changes to Agentfile will be documented in this file.

The project follows semantic versioning once the first public release is tagged.

## 0.1.0

- Experimental `.agent` source parser for Pact-style mission syntax.
- Pact `handoff` blocks now support structured `list changed_files` and `note ...` review requirements.
- Pact source now supports explicit `ask approval for ...` gates for project-specific authority stops.
- Pact diagnostics now catch missing `goal`/`touch` declarations and duplicate `goal`/`background` lines before lowering to IR.
- Initial Agentfile Contract Language draft.
- YAML parser and validator.
- Prompt, JSON, and `AGENTS.md` compiler targets.
- `init`, `check`, `validate`, `compile`, `sync`, and `explain` CLI commands.
- Security-first defaults for network, shell, secrets, scope expansion, and dependency changes.
