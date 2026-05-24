# Public Claims Policy

This project should launch with narrow, evidence-backed claims. The goal is to make the first public read credible instead of loud.

## Allowed Claims

- Agentfile is an experimental language for agentic software work.
- Pact source lowers into strict YAML or JSON contract IR.
- The same contract can generate `AGENTS.md`, `CLAUDE.md`, Cursor rules, and GitHub Copilot instructions.
- Agentfile makes scope, permissions, proof obligations, and handoff requirements explicit and reviewable.
- Current benchmark receipts can audit whether agents reported the required verification commands and produced supporting artifacts.
- Compiled Agentfile instruction output has repeated passing receipts on the current redaction, audit-evidence, webhook, fulfillment, and pricing-refactor fixtures.
- The redaction fixture has repeated four-condition receipts in which explicit instruction surfaces reported the dedicated proof command and plain issue text did not; this supports a narrow proof-reporting claim, not a broad superiority claim.
- The audit-evidence fixture has repeated native Pact, plain-issue, hand-written `AGENTS.md`, and compiled `AGENTS.md` receipts on a non-auth proof-sensitive task. It supports repeated four-condition coverage, but not an Agentfile-over-plain-issue or Agentfile-over-`AGENTS.md` claim because every condition solved the task and reported the proof check.
- The fulfillment privacy fixture has repeated native Pact, compiled `AGENTS.md`, hand-written `AGENTS.md`, and plain-issue receipts. It supports repeated four-condition comparison discipline on a privacy/scope task, but it does not support a claim that Agentfile outperforms plain issue text on that fixture because all four conditions solved it cleanly.
- The redaction, fulfillment privacy, and pricing refactor fixtures have completed repeated four-way receipt sets across plain issue text, hand-written `AGENTS.md`, compiled `AGENTS.md`, and native Pact source.

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
