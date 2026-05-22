# Benchmarks

Agentfile benchmark work starts conservative: define comparable tasks and inputs first, then collect agent runs later.

The first skeleton compares the same bounded auth bug-fix task under two conditions:

- Plain issue text.
- Agentfile Pact source.

Preview the benchmark plan:

```sh
npm run benchmark:plan
```

The current command validates that benchmark inputs exist, validates any JSON receipts in `benchmarks/receipts/`, and prints the planned task, conditions, checks, metrics, and receipt count. It does not run agents and it does not claim results.

The first stored receipt pair covers both `agentfile-pact` and `plain-issue` conditions for `fix-login-refresh-race`. Both solved this small fixture, so the pair is useful as a receipt-format proof and smoke test, not as evidence that one condition outperforms the other.

## First Claim To Test

> On repo-local software delegation tasks, Agentfile contracts improve scope adherence and verification rate compared with plain issue prompts.

Do not publish this as a result until benchmark receipts exist.

## Receipt Requirements

Each real benchmark run should store:

- Input condition and model/agent version.
- Tool-call transcript or equivalent execution log.
- Patch diff.
- Check results.
- Scope adherence score.
- Verification command execution score.
- Final handoff quality notes.

Use [templates/receipt.template.json](templates/receipt.template.json) for new runs. Receipt JSON files belong under `benchmarks/receipts/`, alongside transcript, diff, check log, and notes artifacts.
