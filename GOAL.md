# Goal

Build the language for agentic software work.

Not a prompt format. Not another agent framework. Not a prettier YAML file.

Agentfile's goal is to become a language that agents can understand, write, verify, and execute better than today's general-purpose languages and ad hoc instruction files.

## North Star

Make software delegation programmable.

An agent-era language should make these things first-class:

- Intent: what outcome should exist after the work.
- Scope: what code, tools, data, and systems are in bounds.
- Effects: what the agent may read, write, run, call, install, publish, or delete.
- Evidence: what proves the work is correct.
- Invariants: what must remain true.
- Patches: what changed and why.
- Handoffs: what future agents and humans need to know.
- Authority: when the agent must stop and ask.
- Provenance: which context was trusted, untrusted, generated, or observed.

## Bet

The winning language will not be a replacement for Python, TypeScript, Rust, or Go at first.

It will be a language for the work around code: delegation, constraints, verification, review, and agent collaboration. It can compile into prompts, policy JSON, instruction files, CI checks, traces, and eventually executable agent plans.

## Non-Negotiables

- It must be pleasant enough that humans want to write it.
- It must be constrained enough that models can generate it reliably.
- It must compile to a strict IR that tools can validate.
- It must treat security and authority as language semantics.
- It must prove it is better through benchmarks, not vibes.
- It must interoperate with existing agents instead of demanding a new runtime on day one.

## Working Thesis

Agentfile should become a two-layer system:

1. A source language, likely `.agent`, optimized for humans and coding agents.
2. A contract IR, currently YAML/JSON, optimized for validation, policy, compiler targets, and automation.

The current YAML contract is the IR. The cool language goes above it.
