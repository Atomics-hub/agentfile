# Public Claims Policy

This project should launch with narrow, evidence-backed claims. The goal is to make the first public read credible instead of loud.

## Allowed Claims

- Agentfile is an experimental language for agentic software work.
- Pact source lowers into strict YAML or JSON contract IR.
- The same contract can generate `AGENTS.md`, `CLAUDE.md`, Cursor rules, and GitHub Copilot instructions.
- Agentfile makes scope, permissions, proof obligations, and handoff requirements explicit and reviewable.
- Current benchmark receipts can audit whether agents reported the required verification commands and produced supporting artifacts.
- Compiled Agentfile instruction output has passing receipts on the current redaction, webhook, and fulfillment proof-sensitive fixtures.
- The fulfillment privacy fixture has a completed four-way receipt set across plain issue text, hand-written `AGENTS.md`, compiled `AGENTS.md`, and native Pact source.

## Claims That Need More Evidence

- Agentfile improves outcomes over strong generic instruction files.
- Agentfile improves task success rate, patch correctness, or token efficiency across multiple agent families.
- Agentfile should be treated as a general language for all agent work.

## Disallowed Public Claims For Launch

- Agentfile replaces programming languages.
- Agentfile is broadly better than Python, TypeScript, prompt files, issue text, or agent frameworks.
- Agentfile outperforms every agent framework or instruction style.
- Agentfile guarantees safer agent behavior.
- Agentfile has proven broad benchmark superiority.

Use `npm run launch:review` to run the automated claim scan used by the launch gate. The scan is only a guardrail; manual release review still needs to confirm that every public claim cites demo behavior or benchmark receipts.
