# Public Launch Readiness

Agentfile should stay private until the project can explain its wedge quickly, prove the CLI works reliably, and show one convincing end-to-end demo.

This checklist is the public gate. A release candidate should satisfy every required item before the repository is made public.

## Required Gate

| Area | Required standard | Current status |
| --- | --- | --- |
| Clear README/demo | A new visitor can understand the thesis, install locally, run one `.agent` example, and see generated outputs for `AGENTS.md`, `CLAUDE.md`, Cursor, and Copilot. | Mostly ready |
| Clean compiler architecture | Parse, validate, lower, compile target selection, and renderers have obvious ownership boundaries and focused tests. | Mostly ready |
| Stable CLI | Core commands have documented behavior, useful errors, and integration tests that exercise packaged output. | Mostly ready |
| Fast reliable tests | `npm run check` passes locally, stays fast enough for frequent automation, and does not rely on stale generated files. | Mostly ready |
| Private security posture | The remote remains private until launch, risky authority defaults are conservative, and broad permissions trigger diagnostics or lint warnings. | Mostly ready |
| Benchmark/demo proof | At least one scripted or documented task shows why Agentfile beats plain issue text or scattered instruction files. | Mostly ready |
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
7. Show the same mission in one sentence: "This contract bounds scope, authority, invariants, proof, and handoff before an agent edits code."

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

## Current Highest-Leverage Work

1. Repeat `redact-auth-logs` enough times to test whether the proof-check signal holds.
2. Add a second proof-sensitive fixture so the public evidence is not tied to one task.
3. Keep broad benchmark claims out of public docs until comparative data exists.
4. Add JSON Schema export or document why it is post-launch.
5. Do a final public-readiness review from a clean clone.
