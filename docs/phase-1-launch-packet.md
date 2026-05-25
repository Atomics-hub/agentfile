# Phase 1 Launch Packet

This is the human go/no-go packet used for the Phase 1 public launch. After launch, it doubles as the post-launch restraint checklist: keep the public story boring, specific, and evidence-backed.

## Launch Positioning

Use this as the public one-liner:

> Agentfile is the contract layer for delegated coding work: write one `.agent` contract, compile it into the instruction files and policy surfaces agents already use, then verify whether the work stayed in scope and produced the required proof.

Use this as the repository description:

> Contract language for reviewable AI coding agent delegation.

## Phase 1 Claim

Phase 1 earns one narrow claim:

> Agentfile turns a coding task into a reviewable contract that can compile into instructions and policy surfaces for multiple agents, then verify a completed receipt against the original contract.

That claim is supported by:

- `npm run demo:quick`, which validates `examples/fix-login-race.agent`, generates AGENTS.md/CLAUDE.md/Cursor/Copilot excerpts, verifies a passing receipt, and shows a pending receipt failing on missing proof.
- `npm run launch:review`, which summarizes benchmark receipt coverage and claim-scan status.
- `benchmarks/receipts/`, which stores receipt-level evidence for current benchmark fixtures.

## Do Not Claim

Do not claim any of the following:

- Do not claim Agentfile replaces programming languages, IDEs, Codex, Cursor, Claude Code, or harnesses.
- Do not claim Agentfile guarantees safe or safer agent behavior.
- Do not claim Agentfile broadly outperforms prompts, issue text, Python, TypeScript, `AGENTS.md`, or agent frameworks.
- Do not claim Agentfile has proven general outcome superiority.

## Final Launch Checks

Run these before any future visibility, release, or launch-amplification change:

```sh
npm run launch:metadata
npm run claims:review
npm run launch:dry-run
npm run launch:clean-clone
npm run launch:review
gh repo view Atomics-hub/agentfile --json visibility,description
```

Current expected remote state:

- `visibility`: `PUBLIC`
- `description`: `Contract language for reviewable AI coding agent delegation.`

Expected local state:

- `git status --short --branch` shows a clean branch synced with `origin/main`.
- `package.json` still has `private: true`.
- The clean-clone report matches the current commit in `npm run launch:review`.

## Launch Action

The Phase 1 GitHub visibility launch has already been completed. Do not run the visibility command again unless there is a new explicit visibility decision.

Historical command used for the Phase 1 launch:

```sh
gh repo edit Atomics-hub/agentfile --visibility public
```

Do not publish an npm package during Phase 1 unless there is a separate release decision.

## First Public Reply

Use sober copy:

> I built Agentfile as a contract layer for delegated coding work. It lets you write one `.agent` contract, compile it into AGENTS.md/CLAUDE.md/Cursor/Copilot/policy outputs, and verify a receipt against the original contract. The Phase 1 demo is deliberately narrow: it proves the contract-to-instructions-to-receipt loop, not broad agent superiority.

## Post-Launch Watch

After the repo is public:

- Watch for confused reactions around whether Agentfile is a new programming language, prompt format, or agent framework.
- If that confusion appears, sharpen README language around "contract layer, not harness replacement."
- Do not expand public claims until new receipt-level evidence supports them.
- Keep package publishing disabled until install and release mechanics are intentionally designed.
