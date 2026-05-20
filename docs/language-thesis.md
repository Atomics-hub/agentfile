# Language Thesis

Agentfile should become a language of delegation, effects, evidence, and patches.

## Why Agents Need A Different Language

General-purpose programming languages optimize for describing runtime behavior. Coding agents need to manage another layer:

- What should be changed.
- What must not be changed.
- Which tools are allowed.
- Which outputs count as proof.
- Which files are owned by which task.
- Which context is trusted.
- How to hand work to the next agent or human.

Today this layer is mostly natural language. Natural language is expressive, but it is too easy to ignore, contradict, overfit, or mis-scope.

## Design Shape

Agentfile source should be:

- Block-oriented.
- Low punctuation.
- Small grammar.
- Explicit effects.
- Easy to parse incrementally.
- Easy for an LLM to generate from examples.
- Easy to lower into JSON/YAML IR.

The source language should avoid pretending to be a full general-purpose runtime at first. Its first job is to describe safe software work.

## Core Primitives

### `mission`

A delegated unit of software work.

For now, a source file contains exactly one `mission` block.

```agent
mission fix-login-refresh-race {
  goal "Share one in-flight refresh across concurrent auth calls"
}
```

### `read`, `write`, `touch`, And `never`

Filesystem authority.

```agent
read src/auth/**, docs/**
write src/auth/**, tests/auth/**
never src/billing/**, infra/**
```

`touch` remains shorthand for paths that should be both readable and writable. `write` implies read access in the lowered contract, so the IR stays executable for real code changes while the source stays explicit about writable surfaces.

### `can` And `cannot`

Capabilities and denied effects.

```agent
can run "npm test -- auth"
cannot run "npm publish"
can use network
can use network host "api.github.com"
cannot use network
can read secret "OPENAI_API_KEY"
cannot read secrets
cannot add dependency
ask approval for release_publish
```

### `must` And `must_not`

Invariants and safety rules.

Pact source accepts direct policy statements with `must`, `must_not`, `should`, and `may`, plus narrower sugar like `must preserve "..."` and `must_not leak "..."`.

```agent
must preserve "Public auth APIs"
must_not leak "Refresh tokens"
```

### `plan`

Ordered execution intent that lowers into workflow steps in the IR.

`plan` is currently a singular block within a mission.

```agent
plan {
  step "Inspect the existing auth refresh gate"
  step "Add a regression test for duplicate refresh requests"
  step "Update the refresh flow to reuse one in-flight operation"
}
```

### `prove`

Evidence requirements.

`prove` is currently a singular block within a mission.

```agent
prove {
  run "npm test -- auth"
  check "Review auth logs to confirm refresh tokens are never emitted"
  expect "Concurrent refreshes make exactly one upstream request"
}
```

### `handoff`

Review and continuity requirements.

`handoff` is currently a singular block within a mission.

```agent
handoff {
  explain "changed control flow"
  list changed_files
  note risks
}
```

## Compilation Targets

The language should lower to:

- Contract IR JSON/YAML.
- `AGENTS.md`.
- `CLAUDE.md`.
- Cursor rules.
- Copilot instructions.
- CI policy checks.
- Audit trace schema.
- Future agent runtime plans.

## What Would Make It Better

The language is better than ad hoc instructions if it improves:

- Task success rate.
- Patch correctness.
- Scope adherence.
- Tool policy adherence.
- Verification rate.
- Token efficiency.
- Human review speed.
- Cross-agent portability.

The language is better than Python/TypeScript for this layer if agents make fewer planning, authority, and verification mistakes when using it.
