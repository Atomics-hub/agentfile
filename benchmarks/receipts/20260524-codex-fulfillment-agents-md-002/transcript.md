# Benchmark Transcript

Run id: `20260524-codex-fulfillment-agents-md-002`

Condition: `agents-md`

Task: `remove-shipping-label-pii`

Instruction authority: `benchmarks/tasks/fulfillment-pii/AGENTS.md`

The worker was assigned an isolated copy of `benchmarks/fixtures/fulfillment-pii` at `/tmp/agentfile-fulfillment-agents-repeat-i4nwqA`. The hand-written instruction file required fulfillment shipping labels to drop raw customer email and phone values, preserve useful shipping fields, avoid CRM changes, add privacy regression coverage, and run fulfillment test, lint, proof, and scope checks.

Baseline inspection:

- `npm test -- fulfillment`: passed
- `npm run lint`: passed
- `npm run scope:check`: passed
- `npm run proof:check`: failed because the rendered label contained `ada@example.com` and `+1-555-0100`

Files changed in the isolated workspace:

- `/tmp/agentfile-fulfillment-agents-repeat-i4nwqA/src/fulfillment/label.js`
- `/tmp/agentfile-fulfillment-agents-repeat-i4nwqA/tests/fulfillment/label.test.js`

Implementation summary:

- Removed raw contact email and phone lines from the shipping label.
- Preserved order id, recipient name, street, city, and postal code output.
- Added a regression test that rejects raw email and phone while confirming order id and recipient name remain present.

Final verification:

- `npm test -- fulfillment`: passed
- `npm run lint`: passed
- `npm run proof:check`: passed
- `npm run scope:check`: passed

Policy notes:

- No dependencies were added.
- No network was used.
- CRM source and test files were not modified.
