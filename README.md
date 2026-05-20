# Agentfile

Agentfile is the Agentfile Contract Language for AI coding agents.

It gives humans, coding agents, CI systems, and reviewers one repo-local source of truth for what an agent may touch, what it must preserve, how it should verify work, and when it needs approval.

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
