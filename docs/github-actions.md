# GitHub Actions Integration

Agentfile is not published to npm yet, so the current CI path checks out this repository as a source tool and runs the built CLI from `dist/cli.js`.

Use this when a project wants CI to verify that:

- The `.agent` contract is valid.
- The contract readiness summary has no selected gate failures.
- Generated instruction files still match the contract.
- Filled receipts still satisfy the original contract.

Generate the starter workflow from a checked-out Agentfile tool:

```sh
node dist/cli.js github-actions agentfile.agent > .github/workflows/agentfile.yml
```

The generated workflow uses `inspect --fail-on stale-surfaces,lint --format json` plus `sync --check` for selected generated surfaces. Pass `--surfaces none` for an early validation-only workflow, or pass a comma-separated list such as `agents-md,claude-md,cursor-mdc,copilot-md` for adopted generated files. Pass `--receipt receipts/latest.receipt.json` to add a receipt verification step that runs only when the receipt file exists. Use `--output .github/workflows/agentfile.yml --check` in local automation when you want to verify that the committed workflow still matches the contract path, selected surfaces, and receipt setting.

## Starter Workflow

```yaml
name: Agentfile

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  contract:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout project
        uses: actions/checkout@v4

      - name: Checkout Agentfile
        uses: actions/checkout@v4
        with:
          repository: Atomics-hub/agentfile
          path: .agentfile/tool

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: .agentfile/tool/package-lock.json

      - name: Install Agentfile
        run: npm ci --prefix .agentfile/tool

      - name: Build Agentfile CLI
        run: npm run build --prefix .agentfile/tool

      - name: Inspect contract readiness
        run: node .agentfile/tool/dist/cli.js inspect agentfile.agent --fail-on stale-surfaces,lint --format json

      - name: Check generated AGENTS.md
        run: node .agentfile/tool/dist/cli.js sync agentfile.agent --target agents-md --output AGENTS.md --check

      - name: Check generated Claude instructions
        run: node .agentfile/tool/dist/cli.js sync agentfile.agent --target claude-md --output CLAUDE.md --check

      - name: Check receipt
        if: hashFiles('receipts/latest.receipt.json') != ''
        run: node .agentfile/tool/dist/cli.js receipt verify agentfile.agent receipts/latest.receipt.json
```

This workflow treats `.agent` as the source of truth. `AGENTS.md` and `CLAUDE.md` are checked as generated projections rather than hand-maintained copies.

## Minimal Contract Check

For early adoption, start with only validation:

```yaml
- uses: actions/checkout@v4
- uses: actions/checkout@v4
  with:
    repository: Atomics-hub/agentfile
    path: .agentfile/tool
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: npm ci --prefix .agentfile/tool
- run: npm run build --prefix .agentfile/tool
- run: node .agentfile/tool/dist/cli.js check agentfile.agent
```

## Generated Surface Checks

Add one `sync --check` step for each generated instruction surface your project commits:

```sh
node .agentfile/tool/dist/cli.js sync agentfile.agent --target agents-md --output AGENTS.md --check
node .agentfile/tool/dist/cli.js sync agentfile.agent --target claude-md --output CLAUDE.md --check
node .agentfile/tool/dist/cli.js sync agentfile.agent --target cursor-mdc --output .cursor/rules/agentfile.mdc --check
node .agentfile/tool/dist/cli.js sync agentfile.agent --target copilot-md --output .github/copilot-instructions.md --check
```

If a generated file is stale, the command exits non-zero and prints the command needed to regenerate it.

## Receipt Checks

Receipts are optional, but they make the contract loop auditable after an agent run:

```sh
node .agentfile/tool/dist/cli.js receipt init agentfile.agent
node .agentfile/tool/dist/cli.js receipt verify agentfile.agent receipts/latest.receipt.json
```

The verifier checks that required proof, acceptance evidence, and handoff evidence in the receipt still match the contract.
