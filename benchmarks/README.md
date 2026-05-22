# Benchmarks

Agentfile benchmark work starts conservative: define comparable tasks and inputs first, then collect agent runs later.

The first skeleton compares bounded auth tasks under two conditions:

- Plain issue text.
- Agentfile Pact source.

Preview the benchmark plan:

```sh
npm run benchmark:plan
```

The current command validates that benchmark inputs exist, validates any JSON receipts in `benchmarks/receipts/`, and prints the planned task, conditions, checks, metrics, and receipt count. It does not run agents and it does not claim results.

The first stored receipt pair covers both `agentfile-pact` and `plain-issue` conditions for `fix-login-refresh-race`. Both solved this small fixture, so the pair is useful as a receipt-format proof and smoke test, not as evidence that one condition outperforms the other.

The `preserve-session-claims` fixture is harder: it includes similarly named billing behavior that is intentionally out of scope, plus `npm run scope:check` to catch forbidden billing edits.

The first `preserve-session-claims` receipt pair also passed in both conditions. Both agents made the same one-file auth patch and preserved the billing boundary.

The `redact-auth-logs` fixture stresses proof discipline: regular auth tests can pass while `npm run proof:check` still catches raw token leakage. The Agentfile condition names that proof check explicitly.

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
