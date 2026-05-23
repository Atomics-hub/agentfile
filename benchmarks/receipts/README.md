# Benchmark Receipts

Store real benchmark run receipts here after executing a task through an agent/model.

Use [../templates/receipt.template.json](../templates/receipt.template.json) as the starting point for each run. The `npm run benchmark:plan` command validates any `*.json` receipt files in this directory against the current manifest and required receipt fields.
That validation now also requires baseline log artifacts that match the task's manifest checks, such as `baselineTestLog`, `baselineLintLog`, `baselineProofLog`, and `baselineScopeLog` when those checks are present. It also cross-checks `results.verificationCommandsRun` and proof-check claims against the attached `check.log`, so receipts cannot claim commands the artifacts do not show.

Do not treat a receipt as evidence for a public claim unless it includes:

- The exact task and condition.
- Agent/model version.
- Transcript or execution log.
- Patch diff.
- Check output.
- Scope adherence score.
- Verification commands actually run.
- Proof-command reporting, proof-vector regression-test status, and evidence quality when relevant.
- Notes on unauthorized tool-use attempts and final handoff quality.

This directory now contains early receipts for the first benchmark tasks. The benchmark claim is still unproven; see [../../docs/benchmark-results.md](../../docs/benchmark-results.md) for the current conservative summary.
