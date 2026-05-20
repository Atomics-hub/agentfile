# Agentfile

Agentfile is an experimental language for agentic software work.

The goal is to build a language that coding agents can understand, write, verify, and execute better than today's ad hoc prompts, instruction files, and general-purpose languages for delegation work.

The current YAML format is the strict contract IR. The next layer is a source language that feels more like this:

```agent
mission fix-login-refresh-race {
  goal "Share one in-flight refresh across concurrent auth calls"

  touch src/auth/**, tests/auth/**
  never src/billing/**, infra/**

  can run "npm test -- auth"
  can run "npm run lint"
  cannot run "npm publish"

  cannot use network
  cannot read secrets
  cannot add dependency
  ask approval for release_publish

  must preserve "Public auth APIs"
  must_not leak "Refresh tokens"

  plan {
    step "Inspect the refresh gate used by concurrent auth calls"
    step "Add a regression test for duplicate refresh requests"
    step "Update the refresh flow to reuse and clear one in-flight operation"
  }

  prove {
    run "npm test -- auth"
    expect "Concurrent refreshes make exactly one upstream request"
  }

  handoff {
    explain "changed control flow"
    explain "remaining race assumptions"
    list changed_files
    note risks
  }
}
```

The source language can express grants, denials, and approval gates for authority. For example: `can use network`, `can use network host "api.github.com"`, `cannot run "npm publish"`, `can read secret "OPENAI_API_KEY"`, and `ask approval for release_publish`.

Each `.agent` source file currently defines exactly one `mission`. Within that mission, `plan`, `prove`, and `handoff` are singular blocks so the lowered workflow shape stays predictable for agents and tooling.

That source language lowers into a machine-checkable contract:

```yaml
agentfile: "0.1.0"
kind: TaskContract

info:
  title: fix-login-refresh-race
  version: "0.1.0"
  summary: Prevent duplicate token refresh requests during concurrent auth calls.

task:
  id: fix-login-refresh-race
  goal: Make concurrent auth refreshes share one in-flight refresh operation.

scope:
  include:
    - src/auth/**
    - tests/auth/**
  exclude:
    - src/billing/**

permissions:
  shell:
    allow:
      - npm test -- auth
      - npm run lint
  network:
    default: deny
  secrets:
    access: deny
  approvals:
    requiredFor:
      - dependency_change
      - network_access
      - scope_expansion

policies:
  - id: no-token-logging
    level: must_not
    statement: Refresh tokens must never be logged.

checks:
  - id: auth-tests
    command: npm test -- auth
    required: true

workflow:
  id: implement-fix
  steps:
    - id: inspect-refresh-gate-used-by-concurrent-auth-calls
      do: Inspect the refresh gate used by concurrent auth calls.
    - id: add-a-regression-test-for-duplicate-refresh-requests
      do: Add a regression test for duplicate refresh requests.
    - id: update-the-refresh-flow-to-reuse-and-clear-one-in-flight-operation
      do: Update the refresh flow to reuse and clear one in-flight operation.
  acceptance:
    - Concurrent refresh calls result in exactly one upstream token request.
  review:
    - Explain the changed control flow and any remaining race assumptions.
```

## Why This Exists

Every AI coding tool wants instructions in a different place: `AGENTS.md`, `CLAUDE.md`, Cursor rules, Copilot instructions, MCP config, issue templates, and CI scripts.

Agentfile turns scattered guidance into a durable contract:

- Intent: the concrete goal and context.
- Scope: the files and areas the agent may touch.
- Permissions: shell, network, filesystem, secret, and approval policy.
- Policies: rules that must survive the change.
- Checks and workflow: commands, acceptance criteria, and review requirements.
- Traceability: a compact artifact that can compile into prompts, CI policy, and audit logs.

Agentfile is not an agent framework, orchestration graph, or MCP replacement. It is the contract your agents run under.

The long-term bet is bigger: Agentfile should become the language of delegation, effects, evidence, and patches for coding agents.

## Install

```sh
npm install -g agentfile-contract
```

Local development:

```sh
npm install
npm run check
```

## CLI

Create a starter contract:

```sh
agentfile init
```

Validate a contract:

```sh
agentfile check examples/fix-login-race.agentfile
```

Compile to a prompt for a coding agent:

```sh
agentfile compile examples/fix-login-race.agentfile --target prompt
```

Compile to normalized JSON for automation:

```sh
agentfile compile examples/fix-login-race.agentfile --target json
```

Generate an `AGENTS.md` instruction file:

```sh
agentfile sync examples/fix-login-race.agentfile --output AGENTS.md
```

Explain the contract:

```sh
agentfile explain examples/fix-login-race.agentfile
```

## Project Status

Agentfile is early. The v0.1 goal is intentionally narrow:

- A prototype `.agent` source language.
- A stable YAML-based contract format.
- A strict validator.
- Prompt and JSON compilation targets.
- Security-first defaults.
- `agentfile init` for fast adoption.
- Compiler targets for common agent instruction files.
- A benchmark harness proving that agents complete tasks more reliably with contracts than with plain issue text.

## Design Principles

- Contracts over vibes.
- Safe defaults over clever defaults.
- Existing languages over replacement languages.
- Reviewable traces over hidden autonomy.
- Minimal syntax until the behavior earns more syntax.

## Prior Art

Agentfile is adjacent to agent frameworks, prompt languages, and tool protocols, but it is not trying to be any of them.

- Frameworks: OpenAI Agents SDK, LangGraph, AutoGen, CrewAI, Google ADK.
- Prompt and structured generation: LMQL, DSPy, BAML, Guidance, SGLang.
- AI-friendly languages and DSLs: MoonBit, Vox, Pel, Anka.
- Tool protocols: MCP.

Agentfile's wedge is the repo-local contract layer between all of them.

## License

MIT
