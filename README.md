# Agentfile

Agentfile is the contract layer for delegated coding work.

Write one `.agent` contract, compile it into the instruction files and policy surfaces agents already use, then verify whether the work stayed in scope and produced the required proof.

```text
human intent
  -> .agent contract
  -> AGENTS.md / CLAUDE.md / Cursor / Copilot / policy JSON
  -> agent harness executes with tools
  -> checks, diff, transcript, and receipt
```

Agentfile is not trying to replace Codex, Cursor, Claude Code, IDEs, harnesses, or programming languages. It is the portable source of truth between human intent and agent execution: the place to review scope, authority, proof obligations, and handoff before work starts, and the artifact to audit after work lands.

The current YAML format is the strict contract IR. Pact `.agent` source is the human-facing language that lowers into that IR and projects into existing agent surfaces.

## Five-Minute Loop

From a clean checkout, the current end-to-end proof is intentionally small:

```sh
npm install
npm run demo:quick
```

That script runs the same lifecycle by building the CLI, validating one `.agent` contract, projecting it into the instruction files current agent harnesses already read, showing excerpts from those generated files, then verifying a filled receipt against the original contract.

What the loop demonstrates:

- A `.agent` source can be reviewed and validated before a delegated coding task starts.
- The same contract can generate `AGENTS.md`, `CLAUDE.md`, Cursor, and Copilot instruction surfaces for the harnesses people already use.
- A receipt can verify that completed work supplied the required proof and handoff evidence.
- A pending receipt fails when required proof is missing, so the audit loop is visible without inventing a live agent run.

What it does not claim: broad agent superiority, a replacement for programming languages, or enforcement guarantees that the harness itself does not provide.

The steps are intentionally plain CLI commands:

```sh
npm run build
node dist/cli.js check examples/fix-login-race.agent
node dist/cli.js doctor examples/fix-login-race.agent
node dist/cli.js surfaces examples/fix-login-race.agent
mkdir -p /tmp/agentfile-demo
node dist/cli.js sync examples/fix-login-race.agent --target agents-md --output /tmp/agentfile-demo/AGENTS.md --force
node dist/cli.js sync examples/fix-login-race.agent --target claude-md --output /tmp/agentfile-demo/CLAUDE.md --force
node dist/cli.js sync examples/fix-login-race.agent --target cursor-mdc --output /tmp/agentfile-demo/agentfile.mdc --force
node dist/cli.js sync examples/fix-login-race.agent --target copilot-md --output /tmp/agentfile-demo/copilot-instructions.md --force
node dist/cli.js receipt verify examples/fix-login-race.agent examples/receipts/fix-login-passing.receipt.json
```

The failure mode is visible too:

```sh
node dist/cli.js receipt verify examples/fix-login-race.agent examples/receipts/fix-login-pending.receipt.json
```

Expected excerpt:

```text
requiredProof[npm-test-auth].status: expected "passed", got "pending"
```

Pact source looks like this:

```agent
mission fix-login-refresh-race {
  goal "Share one in-flight refresh across concurrent auth calls"
  version "0.1.0"
  license "MIT"
  summary "Prevent duplicate token refresh requests during concurrent auth calls"
  owner "auth-team"
  label auth
  label concurrency

  read src/auth/**, tests/auth/**
  write src/auth/**, tests/auth/**
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
    run optional "npm run perf -- auth"
    check "Review auth logs to confirm refresh tokens are never emitted"
    check optional "Review benchmark drift before landing"
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

The source language can express grants, denials, approval gates, metadata, and both automated and manual proof requirements. For example: `version "0.1.0"`, `license "MIT"`, `summary "..."`, `owner "auth-team"`, `label auth`, `can use network`, `can use network host "api.github.com"`, `cannot run "npm publish"`, `can read secret "OPENAI_API_KEY"`, `check "Review the release checklist"`, `run optional "npm run perf"`, `check optional "Review benchmark drift"`, and `ask approval for release_publish`.

Broad secret access via `can read secrets` is intentionally mutually exclusive with named `can read secret "NAME"` entries so Pact always lowers to one unambiguous IR secret policy.

Pact source also keeps approval posture conservative when it lowers risky authority: secret grants add `secret_access`, publish commands add `release_publish`, destructive commands add `destructive_write`, and dependency-changing commands retain `dependency_change`.

Quoted source strings support escaped quotes and backslashes, so commands like `run "node --test --grep \\\"auth flow\\\""` and notes like `note "follow-up on C:\\\\temp fixtures"` lower correctly.

Filesystem scope can now distinguish read-only and writable areas with `read ...` and `write ...`. Pact source also distinguishes mission exclusions with `exclude ...` and filesystem deny rules with `deny ...`; `never ...` remains available as shorthand for paths that should be both excluded and denied. `write` implies read access when lowered into the contract IR. In the strict contract IR, filesystem `read` and `write` entries must stay within `scope.include`, so mission scope remains the outer boundary for file authority.

Canonical `.agent` rendering now prefers `touch ...` when the contract's read and write scopes are identical, so the Pact target keeps fully writable missions compact without losing round-trip fidelity.

Canonical `.agent` rendering also makes deny-by-default network and secret posture explicit with `cannot use network` and `cannot read secrets`, so YAML-to-Pact output preserves zero-authority intent during review.

Strict IR allowlists now match Pact source semantics: `permissions.network.allow` entries must be bare hosts, and `permissions.secrets.allow` entries must name concrete secrets instead of wildcard patterns.

Comma-delimited source lists are strict: `read`, `write`, `touch`, `exclude`, `deny`, `never`, `ask approval for`, and policy `for ...` targets require concrete entries and reject blank items, trailing commas, and duplicate exact entries.

Repeated Pact metadata and authority entries such as duplicate `owner`, `label`, `can run`, `cannot run`, `can use network`, `cannot use network`, `can use network host`, `can read secrets`, `cannot read secrets`, `can read secret`, or `cannot add dependency` lines are rejected instead of being silently normalized away.

It can also express direct invariant statements with `must "..."`, `must_not "..."`, `should "..."`, and `may "..."` in addition to the more opinionated sugar forms like `must preserve "..."` and `must_not leak "..."`. Policy statements may optionally scope themselves with `for ...`, for example `must "Keep auth latency within budget." for src/auth/**, tests/auth/**`.

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

Every AI coding tool wants instructions in a different place: `AGENTS.md`, `CLAUDE.md`, Cursor rules, Copilot instructions, MCP config, issue templates, and CI scripts. Better models and better harnesses still need the same answers: what may be touched, which tools are allowed, which proof is required, and what evidence comes back.

Agentfile turns scattered guidance into a durable contract:

- Intent: the concrete goal and context.
- Scope: the files and areas the agent may read or write.
- Permissions: shell, network, filesystem, secret, and approval policy.
- Policies: rules that must survive the change.
- Checks and workflow: commands, acceptance criteria, and review requirements.
- Traceability: a compact artifact that can compile into prompts, CI policy, and audit logs.
- Receipts: the transcript, diff, checks, and notes that show whether delegated work followed the contract.

Agentfile is not an agent framework, orchestration graph, or MCP replacement. It is the contract your agents run under.

The long-term bet is bigger: Agentfile should become the control plane for delegation, effects, evidence, and patches across coding-agent harnesses.

## Why Not Just AGENTS.md?

Use `AGENTS.md` when one hand-written instruction file is enough. Agentfile is for teams that need the same delegation contract to be reviewed, validated, compiled, and audited across multiple agent surfaces.

The difference is source versus projection:

- `AGENTS.md` is an instruction surface for an agent.
- `.agent` source is the reviewable authority for task goal, file scope, tool permissions, proof obligations, and handoff requirements.
- The strict YAML/JSON IR is the machine-checkable contract that tools can validate before work starts.
- Generated instruction files are projections of that contract into the places agents already read today.

Current benchmark receipts are intentionally modest: strong `AGENTS.md` instructions can match Agentfile on some proof-sensitive tasks. That is good pressure on the project. The public claim Agentfile is earning is narrower and more useful: one typed contract can preserve the same scope, authority, proof, and handoff requirements across instruction files, policy JSON, and audit receipts without making humans reconcile scattered Markdown by hand.

Current receipts include repeated completed four-way fixture sets across plain issue text, hand-written `AGENTS.md`, compiled `AGENTS.md`, and native Pact source for redaction, audit evidence, tenant export, fulfillment privacy, and pricing refactor tasks. Those receipts support the bridge and auditability story without yet supporting broad outcome superiority claims.

## Why Not Just Wait For Better Models?

Better agents make the worker smarter. They do not automatically give a team a durable, vendor-portable task contract.

Agentfile sits before the harness:

- The same `.agent` source can feed Codex-style `AGENTS.md`, Claude project memory, Cursor rules, Copilot instructions, and policy JSON.
- Reviewers can approve scope, command authority, network posture, secret access, proof commands, and handoff requirements before an agent starts.
- Receipts can tie the finished patch back to the contract through logs, diffs, verification commands, and notes.

For a one-off solo edit, a direct chat or IDE prompt may be enough. Agentfile is for work where delegation needs to be repeatable, governable, and auditable across tools.

## Install

Agentfile is public, but the npm package is not published yet. For now, run it from source:

```sh
npm install
npm run build
node dist/cli.js --help
```

Local development:

```sh
npm install
npm run check
```

Review current benchmark and launch readiness evidence:

```sh
npm run benchmark:report
npm run surfaces:check
npm run source:format:check
npm run claims:review
npm run launch:review
npm run launch:dry-run
npm run launch:clean-clone
```

Export the strict contract IR JSON Schema for editors or lightweight tooling:

```sh
node dist/cli.js schema > agentfile.schema.json
node dist/cli.js schema --output .vscode/agentfile.schema.json --force
node dist/cli.js editor vscode --output .vscode/settings.json --force
node dist/cli.js editor vscode --output .vscode/settings.json --check
```

Run the end-to-end demo:

```sh
npm run demo:quick
npm run build
node dist/cli.js check examples/fix-login-race.agent
node dist/cli.js doctor examples/fix-login-race.agent
node dist/cli.js compile examples/fix-login-race.agent --target yaml
node dist/cli.js compile examples/fix-login-race.agent --target agents-md
node dist/cli.js receipt verify examples/fix-login-race.agent examples/receipts/fix-login-passing.receipt.json
```

See [End-to-End Demo](docs/demo.md) for the full path from Pact source to YAML IR, policy JSON, generated agent instruction files, and receipt verification.

Use [GitHub Actions Integration](docs/github-actions.md) to validate contracts, generated instruction surfaces, and receipts in CI while Agentfile is still run from source. The CLI can generate a starter workflow:

```sh
node dist/cli.js github-actions agentfile.agent > .github/workflows/agentfile.yml
node dist/cli.js github-actions agentfile.agent --output .github/workflows/agentfile.yml --check
```

## CLI

Create a starter contract:

```sh
agentfile init
```

Create a Pact source starter instead:

```sh
agentfile init agentfile.agent
```

Create a starter contract with VS Code schema setup:

```sh
agentfile init agentfile.agent --editor vscode
```

Validate a contract:

```sh
agentfile check examples/fix-login-race.agent
```

Lint a contract for risky broad authority:

```sh
agentfile lint examples/fix-login-race.agent
```

The linter warns on missing proof obligations, manual-only proof without an executable check, repo-wide mission scope, overly broad filesystem access, risky network or secret authority, high-risk shell commands such as publish, dependency-changing, or destructive operations, and missing approval gates for risky network, secret, or shell authority without rejecting the contract.

Run a project adoption check:

```sh
agentfile doctor examples/fix-login-race.agent
agentfile doctor examples/fix-login-race.agent --format json
agentfile inspect examples/fix-login-race.agent
agentfile inspect examples/fix-login-race.agent --format json
agentfile inspect examples/fix-login-race.agent --fail-on stale-surfaces,lint --format json
```

`doctor` validates the contract, reports lint warnings, and checks adopted default instruction surfaces like `AGENTS.md`, `CLAUDE.md`, Cursor rules, and Copilot instructions for stale generated content.
`inspect` combines contract shape, health status, generated surfaces, and receipt readiness into one review summary. Its `--strict` and `--fail-on` gates make the same summary usable in CI without parsing prose.

Inspect the generated instruction surfaces before writing files:

```sh
agentfile surfaces examples/fix-login-race.agent
agentfile surfaces examples/fix-login-race.agent --format json
```

Check or write canonical Pact source formatting:

```sh
agentfile format examples/fix-login-race.agent --check
agentfile format examples/fix-login-race.agent --write
```

Compile to a prompt for a coding agent:

```sh
agentfile compile examples/fix-login-race.agent --target prompt
```

Compile to strict JSON contract IR for automation:

```sh
agentfile compile examples/fix-login-race.agent --target json
```

Compile to normalized policy JSON for policy engines and audit tooling:

```sh
agentfile compile examples/fix-login-race.agent --target policy-json
```

Compile to canonical YAML contract IR:

```sh
agentfile compile examples/fix-login-race.agent --target yaml
```

Compile a YAML/JSON contract back into canonical Pact source:

```sh
agentfile compile examples/fix-login-race.agent --target agent
```

Generate an `AGENTS.md` instruction file:

```sh
agentfile sync examples/fix-login-race.agent --output AGENTS.md
```

Generate other instruction surfaces from the same contract:

```sh
agentfile sync examples/fix-login-race.agent --target claude-md
agentfile sync examples/fix-login-race.agent --target cursor-mdc
agentfile sync examples/fix-login-race.agent --target copilot-md
```

Generate all default instruction surfaces in one preflighted command:

```sh
agentfile sync examples/fix-login-race.agent --all --force
```

Verify a generated instruction file is still up to date:

```sh
agentfile sync examples/fix-login-race.agent --target agents-md --output AGENTS.md --check
agentfile sync examples/fix-login-race.agent --all --check
npm run surfaces:check
```

Explain the contract:

```sh
agentfile explain examples/fix-login-race.agent
```

Compare two contracts after parsing and normalization:

```sh
agentfile diff examples/fix-login-race.agent changed.agent
agentfile diff examples/fix-login-race.agent changed.agent --format json
```

Print the receipt checklist a harness run should satisfy:

```sh
agentfile receipt examples/fix-login-race.agent
agentfile receipt examples/fix-login-race.agent --output receipts/fix-login.md
agentfile receipt examples/fix-login-race.agent --format json --output receipts/fix-login.json
agentfile receipt review examples/fix-login-race.agent examples/receipts/fix-login-passing.receipt.json
agentfile receipt verify examples/fix-login-race.agent receipts/fix-login.json
agentfile receipt verify examples/fix-login-race.agent examples/receipts/fix-login-passing.receipt.json
```

List compile and sync targets:

```sh
agentfile targets
```

## Project Status

Agentfile is early. The v0.1 goal is intentionally narrow:

- A prototype `.agent` source language.
- A stable YAML-based contract format.
- A strict validator.
- Prompt, JSON, and YAML compilation targets.
- Canonical Pact `.agent` rendering from the strict IR.
- Security-first defaults.
- Initial risky-authority lint warnings for broad permissions.
- `agentfile init` for fast adoption.
- `agentfile init` can scaffold either YAML IR or Pact `.agent` source, with optional VS Code schema setup.
- Compiler targets for `AGENTS.md`, `CLAUDE.md`, Cursor rules, and GitHub Copilot instructions.
- `agentfile doctor` for contract health and generated instruction-surface freshness checks.
- `agentfile doctor --format json` for machine-readable contract health reports.
- `agentfile inspect` for one-command contract, health, surface, and receipt-readiness review.
- `agentfile github-actions` for source-checkout CI workflow generation and drift checks using inspect readiness gates and generated-surface checks.
- `agentfile editor vscode` for generated VS Code schema settings and drift checks.
- `agentfile surfaces` for generated instruction-surface inspection without writing files.
- `agentfile sync --all` for preflighted generation or freshness checks across every default instruction surface.
- `agentfile format --check` and `--write` for canonical Pact source hygiene.
- `agentfile receipt review` for human-readable receipt completion and verification summaries.
- A benchmark skeleton that can compare plain issue text against Agentfile-guided tasks without claiming results before data exists.

Public launch stewardship is tracked in [Public Launch Readiness](docs/launch-readiness.md). The short version: the README/demo must stay obvious, the CLI must stay stable and tested against packaged output, compiler ownership boundaries must stay clean, risky authority defaults must stay conservative, package publishing must remain intentionally gated, and claims must be backed by the [end-to-end demo](docs/demo.md) or benchmark evidence.

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
