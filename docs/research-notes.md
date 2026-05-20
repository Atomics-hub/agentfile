# Research Notes

These notes capture the current map of adjacent work and the hole Agentfile is trying to fill.

## Current Signals

- Vox positions itself as an AI-native language with single-source declarations, explicit errors, MCP tool exposure, durable execution, and local training hooks. That is close to "application language for AI-era apps." Agentfile should not fight it there; our wedge is software work delegation and proof. Source: https://vox-lang.org/
- Anka reports that a constrained DSL for data pipelines outperformed Python on multi-step LLM code generation tasks, despite no prior model exposure. The important lesson is not the domain; it is that constrained syntax can reduce sequencing and state-management errors. Source: https://arxiv.org/abs/2512.23214
- Pel targets orchestration of AI agents with simple grammar, capability control, control flow, inter-agent communication, and static dependency analysis for parallelism. Agentfile should learn from Pel while staying focused on repo-local software engineering tasks. Source: https://arxiv.org/abs/2505.13453
- Claude Code uses `CLAUDE.md` and scoped rules as context, but its docs explicitly distinguish behavioral instructions from hard enforcement. This validates our contract/enforcement split. Source: https://code.claude.com/docs/en/memory
- OpenAI Codex describes `AGENTS.md` as scoped instructions for agents, including conventions and checks. This validates the instruction-file adapter strategy, but also shows why plain Markdown is not enough. Source: https://openai.com/index/introducing-codex/

## Competitive Map

### General-Purpose Languages

Python, TypeScript, Rust, Go, and similar languages are great implementation targets. Agents know them well because the training distribution is enormous.

Hole: they do not encode delegation, authority, verification obligations, or trusted/untrusted context.

### AI-Native Application Languages

Vox, MoonBit, Mojo-adjacent systems, and similar projects aim to make apps or systems easier for AI to generate.

Hole: many still focus on product code, not the agent's work contract.

### Prompt And LLM Languages

LMQL, DSPy, BAML, Guidance, SGLang, and related systems structure LLM calls and outputs.

Hole: they usually orchestrate model interactions, not software change as a typed artifact with effects, tests, patches, and review.

### Agent Frameworks

LangGraph, AutoGen, CrewAI, OpenAI Agents SDK, Google ADK, and similar frameworks run agents.

Hole: they define runtime behavior, but teams still need a source language for repo-local delegation and policy.

### Instruction Files

`AGENTS.md`, `CLAUDE.md`, Cursor rules, and Copilot instructions are widely useful.

Hole: Markdown instructions are not typed, enforceable, easily diffed as policy, or benchmarkable as a language.

## Opportunity

Agentfile can win by becoming the source language for agentic software work:

```agent
mission fix-login-refresh-race {
  goal "Share one in-flight refresh across concurrent auth calls"

  touch src/auth/**, tests/auth/**
  never src/billing/**, infra/**

  can run "npm test -- auth"
  can run "npm run lint"

  cannot use network
  cannot read secrets
  cannot add dependency

  must preserve "Public auth APIs"
  must_not leak "Refresh tokens"

  prove {
    run "npm test -- auth"
    run "npm run lint"
    expect "Concurrent refreshes make exactly one upstream request"
  }

  handoff {
    explain "changed control flow"
    explain "remaining race assumptions"
  }
}
```

This is cooler than YAML, but still compiles to the same safe contract IR.
