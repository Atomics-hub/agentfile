# Benchmark Plan

Agentfile must prove that the language improves agent work.

## Hypothesis

For bounded software tasks, a constrained source language with explicit scope, authority, invariants, proof, and handoff requirements should improve scope adherence and verification behavior compared with plain natural-language issues and generic instruction files.

## Conditions To Compare

Each task should run under at least four prompt/input conditions:

1. Plain issue text.
2. `AGENTS.md` or equivalent Markdown instructions.
3. YAML contract IR.
4. Pact source language compiled to contract IR and instructions.

## Metrics

- Task completion rate.
- Test pass rate.
- Scope adherence.
- Unauthorized tool use attempts.
- Verification command execution rate.
- Patch size.
- Human review time.
- Number of correction turns.
- Token use.
- Plan quality before edits.
- Final handoff quality.

## Task Families

- Bug fix with regression test.
- Refactor with public API invariant.
- Security-sensitive change with forbidden paths.
- Documentation update with citation/evidence requirements.
- Multi-file feature with strict edit scope.
- Dependency update requiring approval.
- Research synthesis with untrusted web data.
- Release notes generation from git history.

## Harness

The benchmark skeleton in `benchmarks/` starts with one plain-issue baseline and one Agentfile condition for the same auth bug-fix task.

Preview the benchmark plan:

```sh
npm run benchmark:plan
```

The current skeleton does not run agents or claim results. It records the first task, conditions, checks, metrics, and receipt shape so future benchmark runs can produce comparable receipts.

The full benchmark harness should:

- Create clean worktrees per run.
- Feed the same task through each condition.
- Run the same agent/model budget.
- Capture tool calls, file diffs, logs, and final response.
- Run deterministic tests and static checks.
- Score policy adherence.
- Store receipts for review.

Each receipt should follow `benchmarks/receipt.schema.json` and live under `benchmarks/receipts/` with links to its transcript, diff, check log, and review notes.

The first stored receipt pair covers both `agentfile-pact` and `plain-issue` conditions for `fix-login-refresh-race`. Treat it as an evidence-pipeline smoke test until there are enough repeated runs to compare outcomes.

## First Public Claim To Earn

Do not claim "better than Python" broadly.

Earn this narrower claim first:

> On repo-local software delegation tasks, Pact contracts improve scope adherence and verification rate compared with plain issue prompts.

Then broaden only if the data supports it.
