# Contributing

Thanks for helping make agent-executed software work safer and easier to review.

## Development

```sh
npm install
npm run check
```

## Pull Requests

Good pull requests should include:

- A focused problem statement.
- Tests for behavior changes.
- Documentation updates for language or CLI changes.
- No unrelated formatting churn.

## Language Changes

Agentfile should stay small until usage proves a feature belongs in the language.

Before adding syntax, prefer:

- A field in the existing YAML contract.
- A compiler target.
- A validation rule.
- A documented convention.

New language features should explain:

- What agent failure mode they reduce.
- How they are validated.
- How they compile to prompt and JSON targets.
- How they interact with security policy.
