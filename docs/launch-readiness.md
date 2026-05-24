# Public Launch Readiness

Agentfile should stay private until the project can explain its wedge quickly, prove the CLI works reliably, and show one convincing end-to-end demo.

This checklist is the public gate. A release candidate should satisfy every required item before the repository is made public.

## Required Gate

| Area | Required standard | Current status |
| --- | --- | --- |
| Clear README/demo | A new visitor can understand the thesis, install locally, run one `.agent` example, see generated outputs for `AGENTS.md`, `CLAUDE.md`, Cursor, and Copilot, and verify a passing/failing receipt lifecycle. | Ready |
| Clean compiler architecture | Parse, validate, lower, compile target selection, and renderers have obvious ownership boundaries and focused tests. | Mostly ready |
| Stable CLI | Core commands have documented behavior, useful errors, and integration tests that exercise packaged output. | Mostly ready |
| Fast reliable tests | `npm run check` passes locally, stays fast enough for frequent automation, and does not rely on stale generated files. | Mostly ready |
| Private security posture | The remote remains private until launch, risky authority defaults are conservative, and broad permissions trigger diagnostics or lint warnings. | Mostly ready |
| Benchmark/demo proof | Launch review requires at least 24 validated receipts, 24 comparable pairs, 4 repeated pairs, zero missing condition receipts, and at least two completed four-condition task families. Claims still need receipt-level citations. | Mostly ready |
| Launch risk | Public package metadata, repo URLs, examples, contribution docs, and claims are reviewed for accuracy and restraint. | Mostly ready |

## Minimum Public Demo

The first public demo should avoid grand claims and show a narrow workflow that works today:

1. Start with `examples/fix-login-race.agent`.
2. Validate it with `agentfile check`.
3. Compile it to canonical YAML IR with `agentfile compile --target yaml`.
4. Compile it to JSON or policy JSON for automation.
5. Generate instruction files for existing agents:
   - `AGENTS.md`
   - `CLAUDE.md`
   - `.cursor/rules/agentfile.mdc`
   - `.github/copilot-instructions.md`
6. Explain the contract with `agentfile explain`.
7. Verify `examples/receipts/fix-login-passing.receipt.json` against the contract.
8. Show `examples/receipts/fix-login-pending.receipt.json` failing because required proof and evidence are still pending.
9. Show the same mission in one sentence: "This contract bounds scope, authority, invariants, proof, and handoff before an agent edits code."

That demo earns the claim:

> Agentfile turns a coding task into a reviewable contract that can compile into instructions and policy surfaces for multiple agents.

It does not yet earn broader claims about replacing programming languages or outperforming every agent framework.

## Go-Public Definition

The repository is ready to go public when:

- `npm run check` passes from a clean clone.
- The README can get a new user from install to generated agent instruction files in under five minutes.
- The CLI reference matches actual command behavior.
- The public demo has copy-pasteable commands and expected outputs.
- The roadmap distinguishes implemented behavior from future bets.
- Package metadata points at the intended repository and package publishing is intentionally gated.
- Security docs explain what Agentfile does and does not enforce.
- The benchmark plan is framed as a plan unless data has actually been collected.

Generate the current local launch-review gate summary:

```sh
npm run claims:review
npm run launch:review
```

The generated review is a decision aid. It summarizes benchmark receipt coverage, completed four-condition task families, launch gates, and claim-scan status. The benchmark proof gate becomes ready only when coverage has enough receipt count, comparable pairs, repeated pairs, completed four-condition task families, and no missing condition receipts. It does not replace private remote verification or manual claim review against [Public Claims Policy](public-claims.md). The fast-test gate becomes ready only when `npm run launch:clean-clone` has written a passing report for the current commit.

Run the local pre-public dry run before treating the repository as launchable:

```sh
npm run demo:quick
npm run launch:dry-run
npm run launch:clean-clone
```

The quick demo script builds the CLI, validates the example contract, writes the generated instruction files into a temporary directory, prints short excerpts from those files, explains what the loop does and does not prove, verifies the passing receipt, and confirms the pending receipt fails with missing proof. The dry run executes `npm run check`, `npm run demo:quick`, validates the benchmark plan, renders the benchmark report, renders the launch-review gate, and confirms `package.json` still has `private: true`. The clean-clone verifier clones the committed checkout into a temporary directory, runs `npm ci`, then runs the same dry run from that clean checkout. It writes `.agentfile/clean-clone-report.json`, which `npm run launch:review` uses to mark the fast-test gate ready when the report matches the current commit. Neither command publishes packages, pushes commits, or changes repository visibility. Remote privacy still requires a separate `gh repo view Atomics-hub/agentfile --json visibility` check.

## Current Highest-Leverage Work

1. Do a final public-readiness review from a clean clone, including `npm run demo:quick`.
2. Keep the README, demo doc, and quick-loop script in sync whenever the public lifecycle changes.
3. Keep broad benchmark claims out of public docs until repeated comparative data exists across task families and agent runs.
4. Add another proof-sensitive task family only if it supports a specific launch claim or exposes a new failure mode.
5. Keep generated instruction fixtures synced with Pact source.
