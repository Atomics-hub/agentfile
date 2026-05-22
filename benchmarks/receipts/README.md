# Benchmark Receipts

Store real benchmark run receipts here after executing a task through an agent/model.

Use [../templates/receipt.template.json](../templates/receipt.template.json) as the starting point for each run. The `npm run benchmark:plan` command validates any `*.json` receipt files in this directory against the current manifest and required receipt fields.

Do not treat a receipt as evidence for a public claim unless it includes:

- The exact task and condition.
- Agent/model version.
- Transcript or execution log.
- Patch diff.
- Check output.
- Scope adherence score.
- Verification commands actually run.
- Notes on unauthorized tool-use attempts and final handoff quality.

This directory intentionally starts without result receipts. The benchmark claim is still unproven.

