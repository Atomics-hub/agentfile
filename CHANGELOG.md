# Changelog

All notable changes to Agentfile will be documented in this file.

The project follows semantic versioning once the first public release is tagged.

## 0.1.0

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
