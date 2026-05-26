# End-to-End Demo

This demo shows the current Agentfile wedge:

> Write one `.agent` mission, validate it, lower it to strict contract IR, project it into policy JSON, and generate instruction files for multiple coding agents.

Agentfile fits one layer above the agent harness:

```text
human intent
  -> .agent contract
  -> generated harness instructions and policy surfaces
  -> agent work
  -> checks, diff, transcript, notes, receipt
```

The demo stops before running a live coding agent. The point is to show the source-of-truth contract and the projections a harness can consume today.

Run these commands from the repository root after installing dependencies.

```sh
npm install
npm run demo:quick
npm run build
```

`npm run demo:quick` is the copy-paste version of this demo. It validates the contract, renders generated instruction excerpts for existing harnesses, verifies a passing receipt, and shows the pending-receipt failure that catches missing proof.

For local development, the examples below call the built CLI directly:

```sh
node dist/cli.js <command>
```

After package install, the same commands are available as:

```sh
agentfile <command>
```

## 1. Start With Pact Source

The demo mission is [examples/fix-login-race.agent](../examples/fix-login-race.agent). It describes a bounded auth bug fix:

```agent
mission fix-login-refresh-race {
  goal "Share one in-flight refresh across concurrent auth calls"
  version "0.1.0"
  license "MIT"
  summary "Prevent duplicate token refresh requests during concurrent auth calls"

  read src/auth/**, tests/auth/**
  write src/auth/**, tests/auth/**
  never src/billing/**, infra/**

  can run "npm test -- auth"
  can run "npm run lint"

  cannot use network
  cannot read secrets
  cannot add dependency

  must preserve "Public auth APIs"
  must_not leak "Refresh tokens"
}
```

The source file is intentionally readable by humans and constrained enough for agents to generate.

## 2. Validate The Mission

```sh
node dist/cli.js check examples/fix-login-race.agent
```

Expected output:

```text
OK examples/fix-login-race.agent
```

The project health check can emit the same status as JSON for CI or dashboards:

```sh
node dist/cli.js doctor examples/fix-login-race.agent --format json
```

## 3. Explain The Contract

```sh
node dist/cli.js explain examples/fix-login-race.agent
```

Expected output:

```text
fix-login-refresh-race
Prevent duplicate token refresh requests during concurrent auth calls

Goal: Share one in-flight refresh across concurrent auth calls
Included paths: src/auth/**, tests/auth/**
Allowed commands: 2
Network: deny
Secrets: deny
Checks: 2
```

## 4. Lower To Canonical YAML IR

```sh
node dist/cli.js compile examples/fix-login-race.agent --target yaml
```

Expected excerpt:

```yaml
agentfile: 0.1.0
kind: TaskContract
task:
  id: fix-login-refresh-race
  goal: Share one in-flight refresh across concurrent auth calls
scope:
  include:
    - src/auth/**
    - tests/auth/**
  exclude:
    - src/billing/**
    - infra/**
permissions:
  network:
    default: deny
  secrets:
    access: deny
```

This YAML/JSON contract IR is the strict machine-checkable layer.

## 5. Project Policy JSON

```sh
node dist/cli.js compile examples/fix-login-race.agent --target policy-json
```

Expected excerpt:

```json
{
  "agentfile": "0.1.0",
  "task": "fix-login-refresh-race",
  "permissions": {
    "network": {
      "default": "deny",
      "allow": []
    },
    "secrets": {
      "access": "deny",
      "allow": []
    }
  }
}
```

Policy JSON is the smaller surface for policy engines, audit logs, and automation.

## 6. Generate Existing Agent Instruction Files

List supported compile targets:

```sh
node dist/cli.js targets
```

Expected excerpt:

```text
agents-md -> AGENTS.md
  generated AGENTS.md instructions
claude-md -> CLAUDE.md
  generated CLAUDE.md project memory
cursor-mdc -> .cursor/rules/agentfile.mdc
  generated Cursor project rule
copilot-md -> .github/copilot-instructions.md
  generated GitHub Copilot repository instructions
```

Inspect the generated surfaces before writing files:

```sh
node dist/cli.js surfaces examples/fix-login-race.agent
```

Expected excerpt:

```text
| agents-md | AGENTS.md | not found |
| claude-md | CLAUDE.md | not found |
| cursor-mdc | .cursor/rules/agentfile.mdc | not found |
| copilot-md | .github/copilot-instructions.md | not found |
```

Generate the files into a scratch directory:

```sh
mkdir -p /tmp/agentfile-demo
node dist/cli.js sync examples/fix-login-race.agent --target agents-md --output /tmp/agentfile-demo/AGENTS.md
node dist/cli.js sync examples/fix-login-race.agent --target claude-md --output /tmp/agentfile-demo/CLAUDE.md
node dist/cli.js sync examples/fix-login-race.agent --target cursor-mdc --output /tmp/agentfile-demo/agentfile.mdc
node dist/cli.js sync examples/fix-login-race.agent --target copilot-md --output /tmp/agentfile-demo/copilot-instructions.md
```

Inside a project checkout, all default instruction surfaces can also be generated or checked together:

```sh
node dist/cli.js sync examples/fix-login-race.agent --all --force
node dist/cli.js sync examples/fix-login-race.agent --all --check
```

Each generated instruction file carries the same mission, scope, authority, policies, checks, and handoff requirements.

CI can also verify that checked-in generated surfaces still match their `.agent` source without rewriting files:

```sh
npm run surfaces:check
```

Expected `AGENTS.md` excerpt:

```md
# fix-login-refresh-race

Prevent duplicate token refresh requests during concurrent auth calls

## Goal
Share one in-flight refresh across concurrent auth calls

## Tool Policy
Shell allowlist: npm test -- auth, npm run lint
Network: deny
Secrets: deny
Filesystem read: src/auth/**, tests/auth/**
Filesystem write: src/auth/**, tests/auth/**
Filesystem deny: src/billing/**, infra/**
Approval required for: dependency_change, network_access, scope_expansion
```

## 7. The Point

The same `.agent` mission becomes:

- A readable source language for humans and agents.
- A strict YAML/JSON contract IR for validation.
- A policy JSON projection for enforcement and audit tooling.
- Agent-specific instruction files for today's tools.

That is Agentfile's first public claim:

> Agentfile turns a coding task into a reviewable contract that can compile into instructions and policy surfaces for multiple agents.

## 8. Where Receipts Fit

After a harness executes the generated instructions, a receipt should make the delegation auditable:

```text
contract: examples/fix-login-race.agent
instructions: AGENTS.md / CLAUDE.md / Cursor / Copilot output
work: transcript + patch diff
proof: npm test -- auth, npm run lint
handoff: changed files, verification, risks
```

Benchmark receipts in `benchmarks/receipts/` use that shape today: each run stores the task input, check log, patch diff, transcript, and notes needed to review whether the agent stayed inside the contract.

Generate a receipt checklist from the same contract:

```sh
node dist/cli.js receipt examples/fix-login-race.agent
node dist/cli.js receipt examples/fix-login-race.agent --output receipts/fix-login.md
```

Expected excerpt:

```md
# Agentfile Receipt Checklist

Task: `fix-login-refresh-race`

## Required Proof

- [ ] Run `npm test -- auth` (required).
- [ ] Run `npm run lint` (required).

## Handoff Evidence

- [ ] Attach or link the transcript/tool log.
- [ ] Attach or link the patch diff.
- [ ] Attach or link the check log.
```

Generate a machine-readable receipt template when a harness wants to attach evidence programmatically:

```sh
node dist/cli.js receipt examples/fix-login-race.agent --format json
node dist/cli.js receipt examples/fix-login-race.agent --format json --output receipts/fix-login.json
```

Expected excerpt:

```json
{
  "kind": "AgentfileReceiptTemplate",
  "contract": {
    "taskId": "fix-login-refresh-race"
  },
  "requiredProof": [
    {
      "command": "npm test -- auth",
      "status": "pending",
      "evidence": null
    }
  ]
}
```

After the harness fills the JSON receipt with evidence, verify it against the source contract:

```sh
node dist/cli.js receipt verify examples/fix-login-race.agent receipts/fix-login.json
```

Expected output:

```text
OK receipts/fix-login.json satisfies examples/fix-login-race.agent
```

The repository includes two lifecycle fixtures so the success and failure modes are visible without inventing evidence:

```sh
node dist/cli.js receipt verify examples/fix-login-race.agent examples/receipts/fix-login-passing.receipt.json
node dist/cli.js receipt verify examples/fix-login-race.agent examples/receipts/fix-login-pending.receipt.json
```

Expected passing output:

```text
OK examples/receipts/fix-login-passing.receipt.json satisfies examples/fix-login-race.agent
```

Expected failing excerpt:

```text
requiredProof[npm-test-auth].status: expected "passed", got "pending"
```
