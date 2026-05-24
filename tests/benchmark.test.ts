import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const benchmarkRunnerPath = fileURLToPath(new URL("../benchmarks/run.mjs", import.meta.url));
const benchmarkReportPath = fileURLToPath(new URL("../benchmarks/report.mjs", import.meta.url));
const launchReviewPath = fileURLToPath(new URL("../scripts/launch-review.mjs", import.meta.url));
const prepublicDryRunPath = fileURLToPath(new URL("../scripts/prepublic-dry-run.mjs", import.meta.url));
const publicClaimReviewPath = fileURLToPath(new URL("../scripts/public-claim-review.mjs", import.meta.url));
const cleanCloneVerifyPath = fileURLToPath(new URL("../scripts/clean-clone-verify.mjs", import.meta.url));
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("benchmark receipt scoring", () => {
  it("summarizes proof and evidence quality signals from stored receipts", async () => {
    const { stdout } = await runBenchmark();
    const plan = JSON.parse(stdout);

    expect(plan.receiptCount).toBeGreaterThanOrEqual(10);
    expect(plan.metrics).toContain("proof_command_reporting");
    expect(plan.metrics).toContain("independent_proof_check_success");
    expect(plan.metrics).toContain("proof_vector_regression_tests");
    expect(plan.metrics).toContain("evidence_quality");
    expect(plan.scoreSummary.comparableConditionPairs).toBe(15);
    expect(plan.scoreSummary.repeatedConditionPairs).toBe(4);

    const agentfile = plan.scoreSummary.byCondition.find(
      (condition: { conditionId: string }) => condition.conditionId === "agentfile-pact"
    );
    const plainIssue = plan.scoreSummary.byCondition.find(
      (condition: { conditionId: string }) => condition.conditionId === "plain-issue"
    );

    expect(agentfile.requiredCheckCoverageRate).toBeGreaterThanOrEqual(plainIssue.requiredCheckCoverageRate);
    expect(agentfile.proofCommandReportRate).toBeGreaterThanOrEqual(plainIssue.proofCommandReportRate);
    expect(agentfile.independentProofCheckPassRate).toBeGreaterThanOrEqual(plainIssue.independentProofCheckPassRate);
    expect(agentfile.regressionTestRate).toBeGreaterThan(plainIssue.regressionTestRate);
    expect(agentfile.averageEvidenceQuality).toBeGreaterThanOrEqual(plainIssue.averageEvidenceQuality);
    expect(agentfile.averagePatchFilesChanged).toBeGreaterThan(0);
    expect(agentfile.averagePatchLinesChanged).toBeGreaterThan(0);
    expect(plainIssue.averagePatchFilesChanged).toBeGreaterThan(0);
    expect(plainIssue.averagePatchLinesChanged).toBeGreaterThan(0);
    expect(agentfile.averageNormalizedQualityScore).toBeGreaterThanOrEqual(plainIssue.averageNormalizedQualityScore);

    const webhookTask = plan.scoreSummary.byTask.find(
      (task: { taskId: string }) => task.taskId === "verify-webhook-raw-signature"
    );

    expect(webhookTask.conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conditionId: "compiled-agents-md",
        receiptCount: 1,
        regressionTestRate: 1,
        independentProofCheckPassRate: 1,
        averagePatchFilesChanged: 2,
        averagePatchLinesChanged: 37,
        averageNormalizedQualityScore: 1,
        evidenceQuality: "strong"
      }),
      expect.objectContaining({
        conditionId: "agentfile-pact",
        receiptCount: 2,
        independentProofCheckPassRate: 1,
        regressionTestRate: 1,
        evidenceQuality: "strong"
      }),
      expect.objectContaining({
        conditionId: "plain-issue",
        receiptCount: 2,
        independentProofCheckPassRate: 1,
        regressionTestRate: 0,
        averagePatchFilesChanged: 1,
        averagePatchLinesChanged: 10.5,
        averageNormalizedQualityScore: 0.83,
        evidenceQuality: "adequate"
      }),
      expect.objectContaining({
        conditionId: "agents-md",
        receiptCount: 2,
        independentProofCheckPassRate: 1,
        regressionTestRate: 1,
        averagePatchFilesChanged: 2,
        averagePatchLinesChanged: 25.5,
        averageNormalizedQualityScore: 1,
        evidenceQuality: "strong"
      })
    ]));
    expect(webhookTask.comparisons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        leftConditionId: "agentfile-pact",
        rightConditionId: "agents-md",
        comparableReceiptCount: 2,
        isRepeated: true,
        normalizedQualityDelta: 0,
        proofCommandReportDelta: 0,
        independentProofCheckPassDelta: 0,
        regressionTestDelta: 0,
        evidenceQualityDelta: 0
      }),
      expect.objectContaining({
        leftConditionId: "agentfile-pact",
        rightConditionId: "plain-issue",
        comparableReceiptCount: 2,
        isRepeated: true,
        normalizedQualityDelta: 0.17,
        proofCommandReportDelta: 0,
        independentProofCheckPassDelta: 0,
        regressionTestDelta: 1,
        evidenceQualityDelta: 0.33
      }),
      expect.objectContaining({
        leftConditionId: "agents-md",
        rightConditionId: "compiled-agents-md",
        comparableReceiptCount: 1,
        isRepeated: false,
        normalizedQualityDelta: 0,
        proofCommandReportDelta: 0,
        independentProofCheckPassDelta: 0,
        regressionTestDelta: 0,
        evidenceQualityDelta: 0
      }),
      expect.objectContaining({
        leftConditionId: "agents-md",
        rightConditionId: "plain-issue",
        comparableReceiptCount: 2,
        isRepeated: true,
        normalizedQualityDelta: 0.17,
        proofCommandReportDelta: 0,
        independentProofCheckPassDelta: 0,
        regressionTestDelta: 1,
        evidenceQualityDelta: 0.33
      })
    ]));

    const redactTask = plan.scoreSummary.byTask.find(
      (task: { taskId: string }) => task.taskId === "redact-auth-logs"
    );

    expect(redactTask.conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conditionId: "agentfile-pact",
        receiptCount: 2,
        proofCommandReportRate: 1,
        independentProofCheckPassRate: 1,
        averagePatchLinesChanged: 24.5,
        evidenceQuality: "strong"
      }),
      expect.objectContaining({
        conditionId: "plain-issue",
        proofCommandReportRate: 0,
        independentProofCheckPassRate: 1,
        evidenceQuality: "adequate"
      }),
      expect.objectContaining({
        conditionId: "agents-md",
        receiptCount: 2,
        proofCommandReportRate: 1,
        independentProofCheckPassRate: 1,
        averagePatchLinesChanged: 46.5,
        evidenceQuality: "strong"
      }),
      expect.objectContaining({
        conditionId: "compiled-agents-md",
        proofCommandReportRate: 1,
        independentProofCheckPassRate: 1,
        averagePatchFilesChanged: 2,
        averagePatchLinesChanged: 12,
        averageNormalizedQualityScore: 1,
        evidenceQuality: "strong"
      })
    ]));
    expect(redactTask.comparisons).toHaveLength(6);
    expect(redactTask.comparisons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        leftConditionId: "agentfile-pact",
        rightConditionId: "agents-md",
        comparableReceiptCount: 2,
        isRepeated: true,
        normalizedQualityDelta: 0.02,
        proofCommandReportDelta: 0,
        independentProofCheckPassDelta: 0,
        regressionTestDelta: 0,
        evidenceQualityDelta: 0
      })
    ]));
  });

  it("renders a compact Markdown benchmark report", async () => {
    const { stdout } = await execFileAsync("node", [benchmarkReportPath], {
      maxBuffer: 1024 * 1024
    });

    expect(stdout).toContain("# Agentfile Benchmark Report");
    expect(stdout).toContain("## Condition Summary");
    expect(stdout).toContain("## Missing Evidence");
    expect(stdout).toContain("## Task Coverage");
    expect(stdout).toContain("- Comparable pairs: 15");
    expect(stdout).toContain("- Repeated pairs: 4");
    expect(stdout).toContain("| `remove-shipping-label-pii` | `plain-issue` | `benchmarks/tasks/fulfillment-pii/plain-issue.md` |");
    expect(stdout).toContain("| `remove-shipping-label-pii` | `agents-md` | `benchmarks/tasks/fulfillment-pii/AGENTS.md` |");
    expect(stdout).toContain("| `remove-shipping-label-pii` | `compiled-agents-md` | `benchmarks/tasks/fulfillment-pii/compiled-agentfile.AGENTS.md` |");
    expect(stdout).toContain("| `remove-shipping-label-pii` | `agentfile-pact` | `benchmarks/tasks/fulfillment-pii/fulfillment-pii.agent` |");
    expect(stdout).toContain("| Pair | Matched | Repeated | Delta Quality | Delta Proof | Delta Proof Pass | Delta Regression | Delta Evidence |");
    expect(stdout).toContain("| `agentfile-pact` vs `plain-issue` | 2 | yes | 0.17 | 0 | 0 | 1 | 0.33 |");
    expect(stdout).toContain("| `agentfile-pact` vs `agents-md` | 2 | yes | 0.02 | 0 | 0 | 0 | 0 |");
    expect(stdout).toContain("| `agentfile-pact` vs `agents-md` | 2 | yes | 0 | 0 | 0 | 0 | 0 |");
    expect(stdout).toContain("| `agents-md` vs `plain-issue` | 2 | yes | 0.17 | 0 | 0 | 1 | 0.33 |");
    expect(stdout).toContain("`agentfile-pact`");
    expect(stdout).toContain("`compiled-agents-md`");
    expect(stdout).toContain("Treat normalized quality as a triage score");
  });

  it("renders a launch-readiness gate review", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentfile-launch-review-missing-"));
    tempDirs.push(directory);
    const { stdout } = await execFileAsync("node", [launchReviewPath], {
      env: {
        ...process.env,
        AGENTFILE_CLEAN_CLONE_REPORT: resolve(directory, "missing-clean-clone-report.json")
      },
      maxBuffer: 1024 * 1024
    });

    expect(stdout).toContain("# Agentfile Launch Review");
    expect(stdout).toContain("## Gate Summary");
    expect(stdout).toContain("| Clear README/demo | ready |");
    expect(stdout).toContain("| Fast reliable tests | manual-check |");
    expect(stdout).toContain("| Launch risk | ready |");
    expect(stdout).toContain("Automated public-claim review found 0 blocked claim pattern(s)");
    expect(stdout).toContain("Verify GitHub remote visibility is private");
  });

  it("marks fast tests ready when a current clean-clone report is available", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentfile-launch-review-"));
    tempDirs.push(directory);
    const reportPath = resolve(directory, "clean-clone-report.json");
    const { stdout: commit } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: resolve(new URL("..", import.meta.url).pathname),
      maxBuffer: 1024 * 1024
    });

    await writeFile(reportPath, JSON.stringify({
      status: "pass",
      generatedAt: "2026-05-23T15:43:34.162Z",
      source: "/tmp/source",
      clonePath: "/tmp/clone",
      sourceHead: commit.trim(),
      cloneHead: commit.trim(),
      steps: [
        {
          name: "Run launch dry run",
          status: "pass",
          durationMs: 1,
          command: "npm run launch:dry-run",
          detail: "ok"
        }
      ]
    }, null, 2));

    const { stdout } = await execFileAsync("node", [launchReviewPath], {
      env: {
        ...process.env,
        AGENTFILE_CLEAN_CLONE_REPORT: reportPath
      },
      maxBuffer: 1024 * 1024
    });

    expect(stdout).toContain("| Fast reliable tests | ready |");
    expect(stdout).toContain(`Clean-clone verification passed for current commit ${commit.trim().slice(0, 7)}`);
  });

  it("keeps launch-facing public claims inside the approved claim policy", async () => {
    const { stdout } = await execFileAsync("node", [publicClaimReviewPath, "--json"], {
      maxBuffer: 1024 * 1024
    });
    const review = JSON.parse(stdout);

    expect(review.surfaceCount).toBeGreaterThanOrEqual(8);
    expect(review.blockedClaimCount).toBeGreaterThanOrEqual(6);
    expect(review.violationCount).toBe(0);
  });

  it("renders a pre-public dry-run gate without recursively running full checks", async () => {
    const { stdout } = await execFileAsync("node", [prepublicDryRunPath, "--skip-check"], {
      maxBuffer: 20 * 1024 * 1024
    });

    expect(stdout).toContain("# Agentfile Pre-Public Dry Run");
    expect(stdout).toContain("Status: pass");
    expect(stdout).toContain("Mode: skip-check");
    expect(stdout).toContain("| Package remains private | pass |");
    expect(stdout).toContain("| Benchmark plan validation | pass |");
    expect(stdout).toContain("| Benchmark report render | pass |");
    expect(stdout).toContain("| Launch gate review | pass |");
    expect(stdout).toContain("does not publish packages, push commits, or change repository visibility");
  });

  it("renders a clean-clone verification plan without running a nested install", async () => {
    const { stdout } = await execFileAsync("node", [cleanCloneVerifyPath, "--plan"], {
      maxBuffer: 1024 * 1024
    });

    expect(stdout).toContain("# Agentfile Clean-Clone Verification");
    expect(stdout).toContain("Status: plan");
    expect(stdout).toContain("| Clone clean checkout | planned |");
    expect(stdout).toContain("| Install locked dependencies | planned |");
    expect(stdout).toContain("| Run launch dry run | planned |");
    expect(stdout).toContain("does not publish packages, push commits, or change repository visibility");
  });

  it("rejects receipts whose metadata and artifacts do not match the manifest", async () => {
    const fixture = await createBenchmarkFixture();
    const mismatchedPromptPath = resolve(fixture.sandboxDir, "tasks", "wrong.agent");
    const missingTranscriptPath = resolve(fixture.runDir, "missing-transcript.md");

    await writeFile(mismatchedPromptPath, "mission wrong-input {\n  goal \"Mismatch\"\n}\n");
    await writeFile(fixture.receiptPath, JSON.stringify({
      version: 1,
      runId: fixture.runId,
      taskId: "receipt-integrity",
      conditionId: "agentfile-pact",
      claimStatus: "candidate",
      startedAt: "2026-05-22T02:00:00.000Z",
      endedAt: "2026-05-22T01:59:00.000Z",
      agent: {
        name: "test-agent",
        version: "1.0.0",
        model: "test-model"
      },
      inputs: {
        promptOrContract: mismatchedPromptPath,
        repository: "Atomics-hub/agentfile",
        fixture: fixture.fixturePath
      },
      results: {
        taskCompleted: true,
        testsPassed: true,
        scopeAdherence: 1,
        verificationCommandsRun: ["npm test -- receipt-integrity"],
        unauthorizedToolUseAttempts: 0,
        patchFilesChanged: 1,
        correctionTurns: 0,
        finalHandoffQuality: "strong",
        reportedProofCheck: true,
        independentProofCheckPassed: true,
        addedRegressionTests: true,
        evidenceQuality: "strong"
      },
      receipts: {
        transcript: missingTranscriptPath,
        diff: resolve(fixture.runDir, "patch.diff"),
        checkLog: resolve(fixture.runDir, "check.log"),
        notes: resolve(fixture.runDir, "notes.md"),
        baselineTestLog: resolve(fixture.runDir, "baseline-test.log"),
        baselineLintLog: resolve(fixture.runDir, "baseline-lint.log")
      }
    }, null, 2));

    const error = await runBenchmarkExpectingFailure({
      AGENTFILE_BENCHMARK_MANIFEST: fixture.manifestPath,
      AGENTFILE_BENCHMARK_RECEIPTS_DIR: fixture.receiptsDir
    });

    expect(error.stderr).toContain("endedAt must be greater than or equal to startedAt");
    expect(error.stderr).toContain("inputs: commit is required");
    expect(error.stderr).toContain("inputs.promptOrContract must match receipt-integrity/agentfile-pact input");
    expect(error.stderr).toContain("results.reportedProofCheck requires verificationCommandsRun to include npm run proof:check");
    expect(error.stderr).toContain('receipts.baselineProofLog is required for task check "npm run proof:check"');
    expect(error.stderr).toContain('receipts.baselineScopeLog is required for task check "npm run scope:check"');
    expect(error.stderr).toContain(`receipts.transcript file is missing: ${missingTranscriptPath}`);
  });

  it("rejects receipts that omit reproducibility provenance", async () => {
    const fixture = await createBenchmarkFixture();

    await writeFile(fixture.receiptPath, JSON.stringify({
      version: 1,
      runId: fixture.runId,
      taskId: "receipt-integrity",
      conditionId: "agentfile-pact",
      claimStatus: "candidate",
      agent: {
        name: "test-agent",
        version: "1.0.0",
        model: "test-model"
      },
      inputs: {
        promptOrContract: fixture.promptPath,
        repository: "Atomics-hub/agentfile"
      },
      results: {
        taskCompleted: true,
        testsPassed: true,
        scopeAdherence: 1,
        verificationCommandsRun: [
          "npm test -- receipt-integrity",
          "npm run lint",
          "npm run proof:check",
          "npm run scope:check"
        ],
        unauthorizedToolUseAttempts: 0,
        patchFilesChanged: 1,
        correctionTurns: 0,
        finalHandoffQuality: "strong",
        reportedProofCheck: true,
        independentProofCheckPassed: true,
        addedRegressionTests: false,
        evidenceQuality: "strong"
      },
      receipts: {
        transcript: resolve(fixture.runDir, "transcript.md"),
        diff: resolve(fixture.runDir, "patch.diff"),
        checkLog: resolve(fixture.runDir, "check.log"),
        notes: resolve(fixture.runDir, "notes.md"),
        baselineTestLog: resolve(fixture.runDir, "baseline-test.log"),
        baselineLintLog: resolve(fixture.runDir, "baseline-lint.log"),
        baselineProofLog: resolve(fixture.runDir, "baseline-proof.log"),
        baselineScopeLog: resolve(fixture.runDir, "baseline-scope.log")
      }
    }, null, 2));
    await writeFile(resolve(fixture.runDir, "transcript.md"), "transcript\n");
    await writeFile(resolve(fixture.runDir, "baseline-proof.log"), proofLog());
    await writeFile(resolve(fixture.runDir, "baseline-scope.log"), scopeLog());

    const error = await runBenchmarkExpectingFailure({
      AGENTFILE_BENCHMARK_MANIFEST: fixture.manifestPath,
      AGENTFILE_BENCHMARK_RECEIPTS_DIR: fixture.receiptsDir
    });

    expect(error.stderr).toContain("startedAt is required");
    expect(error.stderr).toContain("endedAt is required");
    expect(error.stderr).toContain("inputs: commit is required");
    expect(error.stderr).toContain("inputs: fixture is required");
  });

  it("rejects receipts whose runId does not match the manifest task slug and condition", async () => {
    const fixture = await createBenchmarkFixture();
    const mismatchedRunId = "20260522-test-wrong-task-agentfile-pact-001";
    const mismatchedRunDir = resolve(fixture.receiptsDir, mismatchedRunId);
    const mismatchedReceiptPath = resolve(mismatchedRunDir, "receipt.json");

    await mkdir(mismatchedRunDir, { recursive: true });
    await writeFile(resolve(mismatchedRunDir, "transcript.md"), "transcript\n");
    await writeFile(resolve(mismatchedRunDir, "patch.diff"), "diff --git a/file b/file\n");
    await writeFile(resolve(mismatchedRunDir, "check.log"), fullCheckLog());
    await writeFile(resolve(mismatchedRunDir, "notes.md"), "notes\n");
    await writeFile(resolve(mismatchedRunDir, "baseline-test.log"), fixture.baselineTestLog);
    await writeFile(resolve(mismatchedRunDir, "baseline-lint.log"), fixture.baselineLintLog);
    await writeFile(resolve(mismatchedRunDir, "baseline-proof.log"), proofLog());
    await writeFile(resolve(mismatchedRunDir, "baseline-scope.log"), scopeLog());

    await writeFile(mismatchedReceiptPath, JSON.stringify({
      version: 1,
      runId: mismatchedRunId,
      taskId: "receipt-integrity",
      conditionId: "agentfile-pact",
      claimStatus: "candidate",
      startedAt: "2026-05-22T02:00:00.000Z",
      endedAt: "2026-05-22T02:05:00.000Z",
      agent: {
        name: "test-agent",
        version: "1.0.0",
        model: "test-model"
      },
      inputs: {
        promptOrContract: fixture.promptPath,
        repository: "Atomics-hub/agentfile",
        commit: "abc1234",
        fixture: fixture.fixturePath
      },
      results: {
        taskCompleted: true,
        testsPassed: true,
        scopeAdherence: 1,
        verificationCommandsRun: [
          "npm test -- receipt-integrity",
          "npm run lint",
          "npm run proof:check",
          "npm run scope:check"
        ],
        unauthorizedToolUseAttempts: 0,
        patchFilesChanged: 1,
        correctionTurns: 0,
        finalHandoffQuality: "strong",
        reportedProofCheck: true,
        independentProofCheckPassed: true,
        evidenceQuality: "strong"
      },
      receipts: {
        transcript: resolve(mismatchedRunDir, "transcript.md"),
        diff: resolve(mismatchedRunDir, "patch.diff"),
        checkLog: resolve(mismatchedRunDir, "check.log"),
        notes: resolve(mismatchedRunDir, "notes.md"),
        baselineTestLog: resolve(mismatchedRunDir, "baseline-test.log"),
        baselineLintLog: resolve(mismatchedRunDir, "baseline-lint.log"),
        baselineProofLog: resolve(mismatchedRunDir, "baseline-proof.log"),
        baselineScopeLog: resolve(mismatchedRunDir, "baseline-scope.log")
      }
    }, null, 2));

    const error = await runBenchmarkExpectingFailure({
      AGENTFILE_BENCHMARK_MANIFEST: fixture.manifestPath,
      AGENTFILE_BENCHMARK_RECEIPTS_DIR: fixture.receiptsDir
    });

    expect(error.stderr).toContain("runId must match YYYYMMDD-<agent>-receipt-integrity-agentfile-pact-NNN");
  });

  it("rejects receipts whose logs do not support the reported verification evidence", async () => {
    const fixture = await createBenchmarkFixture();
    const baselineProofPath = resolve(fixture.runDir, "baseline-proof.log");
    const baselineScopePath = resolve(fixture.runDir, "baseline-scope.log");

    await writeFile(baselineProofPath, fixture.baselineLintLog);
    await writeFile(baselineScopePath, fixture.baselineScopeLog);
    await writeFile(fixture.receiptPath, JSON.stringify({
      version: 1,
      runId: fixture.runId,
      taskId: "receipt-integrity",
      conditionId: "agentfile-pact",
      claimStatus: "candidate",
      startedAt: "2026-05-22T02:00:00.000Z",
      endedAt: "2026-05-22T02:05:00.000Z",
      agent: {
        name: "test-agent",
        version: "1.0.0",
        model: "test-model"
      },
      inputs: {
        promptOrContract: fixture.promptPath,
        repository: "Atomics-hub/agentfile",
        commit: "abc1234",
        fixture: fixture.fixturePath
      },
      results: {
        taskCompleted: true,
        testsPassed: true,
        scopeAdherence: 1,
        verificationCommandsRun: ["npm test -- receipt-integrity", "npm run lint", "npm run proof:check"],
        unauthorizedToolUseAttempts: 0,
        patchFilesChanged: 1,
        correctionTurns: 0,
        finalHandoffQuality: "strong",
        reportedProofCheck: true,
        independentProofCheckPassed: true,
        evidenceQuality: "strong"
      },
      receipts: {
        transcript: resolve(fixture.runDir, "transcript.md"),
        diff: resolve(fixture.runDir, "patch.diff"),
        checkLog: resolve(fixture.runDir, "check.log"),
        notes: resolve(fixture.runDir, "notes.md"),
        baselineTestLog: resolve(fixture.runDir, "baseline-test.log"),
        baselineLintLog: resolve(fixture.runDir, "baseline-lint.log"),
        baselineProofLog: baselineProofPath,
        baselineScopeLog: baselineScopePath
      }
    }, null, 2));
    await writeFile(resolve(fixture.runDir, "transcript.md"), "transcript\n");

    const error = await runBenchmarkExpectingFailure({
      AGENTFILE_BENCHMARK_MANIFEST: fixture.manifestPath,
      AGENTFILE_BENCHMARK_RECEIPTS_DIR: fixture.receiptsDir
    });

    expect(error.stderr).toContain('results.verificationCommandsRun lists "npm run proof:check" but receipts.checkLog does not show it');
    expect(error.stderr).toContain("results.independentProofCheckPassed requires receipts.checkLog to include npm run proof:check");
    expect(error.stderr).toContain('results.evidenceQuality "strong" exceeds supported evidence quality "weak"');
    expect(error.stderr).toContain('receipts.baselineProofLog must show command "npm run proof:check"');
  });

  it("rejects receipts whose reported verification commands fall outside the manifest or repeat entries", async () => {
    const fixture = await createBenchmarkFixture();
    const baselineProofPath = resolve(fixture.runDir, "baseline-proof.log");
    const baselineScopePath = resolve(fixture.runDir, "baseline-scope.log");

    await writeFile(baselineProofPath, proofLog());
    await writeFile(baselineScopePath, scopeLog());
    await writeFile(resolve(fixture.runDir, "transcript.md"), "transcript\n");
    await writeFile(resolve(fixture.runDir, "check.log"), fullCheckLog());

    await writeFile(fixture.receiptPath, JSON.stringify({
      version: 1,
      runId: fixture.runId,
      taskId: "receipt-integrity",
      conditionId: "agentfile-pact",
      claimStatus: "candidate",
      startedAt: "2026-05-22T02:00:00.000Z",
      endedAt: "2026-05-22T02:05:00.000Z",
      agent: {
        name: "test-agent",
        version: "1.0.0",
        model: "test-model"
      },
      inputs: {
        promptOrContract: fixture.promptPath,
        repository: "Atomics-hub/agentfile",
        commit: "abc1234",
        fixture: fixture.fixturePath
      },
      results: {
        taskCompleted: true,
        testsPassed: true,
        scopeAdherence: 1,
        verificationCommandsRun: [
          "npm test -- receipt-integrity",
          "npm test -- receipt-integrity",
          "npm run publish"
        ],
        unauthorizedToolUseAttempts: 0,
        patchFilesChanged: 1,
        correctionTurns: 0,
        finalHandoffQuality: "strong",
        evidenceQuality: "adequate"
      },
      receipts: {
        transcript: resolve(fixture.runDir, "transcript.md"),
        diff: resolve(fixture.runDir, "patch.diff"),
        checkLog: resolve(fixture.runDir, "check.log"),
        notes: resolve(fixture.runDir, "notes.md"),
        baselineTestLog: resolve(fixture.runDir, "baseline-test.log"),
        baselineLintLog: resolve(fixture.runDir, "baseline-lint.log"),
        baselineProofLog: baselineProofPath,
        baselineScopeLog: baselineScopePath
      }
    }, null, 2));

    const error = await runBenchmarkExpectingFailure({
      AGENTFILE_BENCHMARK_MANIFEST: fixture.manifestPath,
      AGENTFILE_BENCHMARK_RECEIPTS_DIR: fixture.receiptsDir
    });

    expect(error.stderr).toContain("results.verificationCommandsRun must not contain duplicate commands");
    expect(error.stderr).toContain('results.verificationCommandsRun lists unsupported command "npm run publish"');
  });

  it("rejects receipts that claim passing tests without matching test evidence in check.log", async () => {
    const fixture = await createBenchmarkFixture();
    const baselineProofPath = resolve(fixture.runDir, "baseline-proof.log");
    const baselineScopePath = resolve(fixture.runDir, "baseline-scope.log");

    await writeFile(baselineProofPath, proofLog());
    await writeFile(baselineScopePath, scopeLog());
    await writeFile(resolve(fixture.runDir, "transcript.md"), "transcript\n");
    await writeFile(resolve(fixture.runDir, "check.log"), [
      "> agentfile-receipt-integrity-fixture@0.0.0 lint",
      "> node scripts/lint.mjs",
      "",
      "> agentfile-receipt-integrity-fixture@0.0.0 proof:check",
      "> node scripts/proof-check.mjs",
      "",
      "> agentfile-receipt-integrity-fixture@0.0.0 scope:check",
      "> node scripts/scope-check.mjs",
      ""
    ].join("\n"));

    await writeFile(fixture.receiptPath, JSON.stringify({
      version: 1,
      runId: fixture.runId,
      taskId: "receipt-integrity",
      conditionId: "agentfile-pact",
      claimStatus: "candidate",
      startedAt: "2026-05-22T02:00:00.000Z",
      endedAt: "2026-05-22T02:05:00.000Z",
      agent: {
        name: "test-agent",
        version: "1.0.0",
        model: "test-model"
      },
      inputs: {
        promptOrContract: fixture.promptPath,
        repository: "Atomics-hub/agentfile",
        commit: "abc1234",
        fixture: fixture.fixturePath
      },
      results: {
        taskCompleted: true,
        testsPassed: true,
        scopeAdherence: 1,
        verificationCommandsRun: ["npm run lint", "npm run proof:check", "npm run scope:check"],
        unauthorizedToolUseAttempts: 0,
        patchFilesChanged: 1,
        correctionTurns: 0,
        finalHandoffQuality: "adequate",
        reportedProofCheck: true,
        independentProofCheckPassed: true,
        evidenceQuality: "adequate"
      },
      receipts: {
        transcript: resolve(fixture.runDir, "transcript.md"),
        diff: resolve(fixture.runDir, "patch.diff"),
        checkLog: resolve(fixture.runDir, "check.log"),
        notes: resolve(fixture.runDir, "notes.md"),
        baselineTestLog: resolve(fixture.runDir, "baseline-test.log"),
        baselineLintLog: resolve(fixture.runDir, "baseline-lint.log"),
        baselineProofLog: baselineProofPath,
        baselineScopeLog: baselineScopePath
      }
    }, null, 2));

    const error = await runBenchmarkExpectingFailure({
      AGENTFILE_BENCHMARK_MANIFEST: fixture.manifestPath,
      AGENTFILE_BENCHMARK_RECEIPTS_DIR: fixture.receiptsDir
    });

    expect(error.stderr).toContain('results.testsPassed requires receipts.checkLog to include "npm test -- receipt-integrity"');
  });

  it("rejects receipts whose diff does not support reported patch metadata", async () => {
    const fixture = await createBenchmarkFixture();
    const baselineProofPath = resolve(fixture.runDir, "baseline-proof.log");
    const baselineScopePath = resolve(fixture.runDir, "baseline-scope.log");

    await writeFile(baselineProofPath, proofLog());
    await writeFile(baselineScopePath, scopeLog());
    await writeFile(resolve(fixture.runDir, "transcript.md"), "transcript\n");
    await writeFile(resolve(fixture.runDir, "check.log"), fullCheckLog());

    await writeFile(fixture.receiptPath, JSON.stringify({
      version: 1,
      runId: fixture.runId,
      taskId: "receipt-integrity",
      conditionId: "agentfile-pact",
      claimStatus: "candidate",
      startedAt: "2026-05-22T02:00:00.000Z",
      endedAt: "2026-05-22T02:05:00.000Z",
      agent: {
        name: "test-agent",
        version: "1.0.0",
        model: "test-model"
      },
      inputs: {
        promptOrContract: fixture.promptPath,
        repository: "Atomics-hub/agentfile",
        commit: "abc1234",
        fixture: fixture.fixturePath
      },
      results: {
        taskCompleted: true,
        testsPassed: true,
        scopeAdherence: 1,
        verificationCommandsRun: ["npm test -- receipt-integrity", "npm run lint", "npm run proof:check"],
        unauthorizedToolUseAttempts: 0,
        patchFilesChanged: 2,
        correctionTurns: 0,
        finalHandoffQuality: "strong",
        reportedProofCheck: true,
        independentProofCheckPassed: true,
        addedRegressionTests: true,
        evidenceQuality: "strong"
      },
      receipts: {
        transcript: resolve(fixture.runDir, "transcript.md"),
        diff: resolve(fixture.runDir, "patch.diff"),
        checkLog: resolve(fixture.runDir, "check.log"),
        notes: resolve(fixture.runDir, "notes.md"),
        baselineTestLog: resolve(fixture.runDir, "baseline-test.log"),
        baselineLintLog: resolve(fixture.runDir, "baseline-lint.log"),
        baselineProofLog: baselineProofPath,
        baselineScopeLog: baselineScopePath
      }
    }, null, 2));

    const error = await runBenchmarkExpectingFailure({
      AGENTFILE_BENCHMARK_MANIFEST: fixture.manifestPath,
      AGENTFILE_BENCHMARK_RECEIPTS_DIR: fixture.receiptsDir
    });

    expect(error.stderr).toContain("results.patchFilesChanged is 2, but receipts.diff shows 1 changed file(s)");
    expect(error.stderr).toContain("results.addedRegressionTests requires receipts.diff to change at least one test file");
  });

  it("keeps conservative evidence claims even when receipt artifacts support a stronger score", async () => {
    const fixture = await createBenchmarkFixture();
    const baselineProofPath = resolve(fixture.runDir, "baseline-proof.log");
    const baselineScopePath = resolve(fixture.runDir, "baseline-scope.log");

    await writeFile(resolve(fixture.runDir, "patch.diff"), [
      "diff --git a/src/feature.js b/src/feature.js",
      "--- a/src/feature.js",
      "+++ b/src/feature.js",
      "@@ -1 +1 @@",
      '-export const status = "old";',
      '+export const status = "new";',
      "diff --git a/tests/feature.test.js b/tests/feature.test.js",
      "--- a/tests/feature.test.js",
      "+++ b/tests/feature.test.js",
      "@@ -1 +1 @@",
      '-test(\"old\", () => {});',
      '+test(\"new\", () => {});',
      ""
    ].join("\n"));
    await writeFile(baselineProofPath, proofLog());
    await writeFile(baselineScopePath, scopeLog());
    await writeFile(resolve(fixture.runDir, "transcript.md"), "transcript\n");
    await writeFile(resolve(fixture.runDir, "check.log"), fullCheckLog());

    await writeFile(fixture.receiptPath, JSON.stringify({
      version: 1,
      runId: fixture.runId,
      taskId: "receipt-integrity",
      conditionId: "agentfile-pact",
      claimStatus: "candidate",
      startedAt: "2026-05-22T02:00:00.000Z",
      endedAt: "2026-05-22T02:05:00.000Z",
      agent: {
        name: "test-agent",
        version: "1.0.0",
        model: "test-model"
      },
      inputs: {
        promptOrContract: fixture.promptPath,
        repository: "Atomics-hub/agentfile",
        commit: "abc1234",
        fixture: fixture.fixturePath
      },
      results: {
        taskCompleted: true,
        testsPassed: true,
        scopeAdherence: 1,
        verificationCommandsRun: [
          "npm test -- receipt-integrity",
          "npm run lint",
          "npm run proof:check",
          "npm run scope:check"
        ],
        unauthorizedToolUseAttempts: 0,
        correctionTurns: 0,
        finalHandoffQuality: "strong",
        reportedProofCheck: true,
        independentProofCheckPassed: true,
        addedRegressionTests: true,
        evidenceQuality: "adequate"
      },
      receipts: {
        transcript: resolve(fixture.runDir, "transcript.md"),
        diff: resolve(fixture.runDir, "patch.diff"),
        checkLog: resolve(fixture.runDir, "check.log"),
        notes: resolve(fixture.runDir, "notes.md"),
        baselineTestLog: resolve(fixture.runDir, "baseline-test.log"),
        baselineLintLog: resolve(fixture.runDir, "baseline-lint.log"),
        baselineProofLog: baselineProofPath,
        baselineScopeLog: baselineScopePath
      }
    }, null, 2));

    const { stdout } = await runBenchmark({
      AGENTFILE_BENCHMARK_MANIFEST: fixture.manifestPath,
      AGENTFILE_BENCHMARK_RECEIPTS_DIR: fixture.receiptsDir
    });
    const plan = JSON.parse(stdout);
    const condition = plan.scoreSummary.byCondition.find(
      (entry: { conditionId: string }) => entry.conditionId === "agentfile-pact"
    );
    const task = plan.scoreSummary.byTask.find(
      (entry: { taskId: string }) => entry.taskId === "receipt-integrity"
    );

    expect(condition.averagePatchFilesChanged).toBe(2);
    expect(condition.averagePatchLinesChanged).toBe(4);
    expect(condition.averageNormalizedQualityScore).toBe(0.96);
    expect(condition.averageEvidenceQuality).toBe(0.67);
    expect(task.conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conditionId: "agentfile-pact",
        averagePatchFilesChanged: 2,
        averagePatchLinesChanged: 4,
        averageNormalizedQualityScore: 0.96,
        regressionTestRate: 1,
        evidenceQuality: "adequate"
      })
    ]));
  });
});

async function runBenchmark(env: NodeJS.ProcessEnv = {}) {
  return execFileAsync("node", [benchmarkRunnerPath], {
    env: {
      ...process.env,
      ...env
    },
    maxBuffer: 1024 * 1024
  });
}

async function runBenchmarkExpectingFailure(env: NodeJS.ProcessEnv) {
  try {
    await runBenchmark(env);
  } catch (error) {
    return error as Error & { stderr: string };
  }

  throw new Error("expected benchmark runner to fail");
}

async function createBenchmarkFixture() {
  const sandboxDir = await mkdtemp(join(tmpdir(), "agentfile-benchmark-"));
  tempDirs.push(sandboxDir);

  const tasksDir = resolve(sandboxDir, "tasks");
  const fixturesDir = resolve(sandboxDir, "fixtures");
  const receiptsDir = resolve(sandboxDir, "receipts");
  const fixturePath = resolve(fixturesDir, "receipt-integrity");
  const manifestPath = resolve(sandboxDir, "manifest.json");
  const promptPath = resolve(tasksDir, "receipt-integrity.agent");
  const runId = "20260522-test-receipt-integrity-agentfile-pact-001";
  const runDir = resolve(receiptsDir, runId);
  const receiptPath = resolve(runDir, "receipt.json");

  await mkdir(dirname(promptPath), { recursive: true });
  await mkdir(fixturePath, { recursive: true });
  await mkdir(runDir, { recursive: true });

  await writeFile(promptPath, "mission receipt-integrity {\n  goal \"Validate receipts\"\n}\n");
  await writeFile(resolve(runDir, "patch.diff"), "diff --git a/file b/file\n");
  const checkLog = [
    "> agentfile-receipt-integrity-fixture@0.0.0 test",
    "> node scripts/test.mjs receipt-integrity",
    "",
    "> agentfile-receipt-integrity-fixture@0.0.0 lint",
    "> node scripts/lint.mjs",
    ""
  ].join("\n");
  const baselineTestLog = [
    "> agentfile-receipt-integrity-fixture@0.0.0 test",
    "> node scripts/test.mjs receipt-integrity",
    "",
    "failing baseline test",
    ""
  ].join("\n");
  const baselineLintLog = [
    "> agentfile-receipt-integrity-fixture@0.0.0 lint",
    "> node scripts/lint.mjs",
    ""
  ].join("\n");
  const baselineScopeLog = [
    "> agentfile-receipt-integrity-fixture@0.0.0 scope:check",
    "> node scripts/scope-check.mjs",
    ""
  ].join("\n");

  await writeFile(resolve(runDir, "check.log"), checkLog);
  await writeFile(resolve(runDir, "notes.md"), "notes\n");
  await writeFile(resolve(runDir, "baseline-test.log"), baselineTestLog);
  await writeFile(resolve(runDir, "baseline-lint.log"), baselineLintLog);

  await writeFile(manifestPath, JSON.stringify({
    version: 1,
    status: "skeleton",
    claimStatus: "unproven",
    claimToTest: "Receipt validation catches broken evidence.",
    metrics: ["evidence_quality"],
    tasks: [
      {
        id: "receipt-integrity",
        runSlug: "receipt-integrity",
        family: "evidence_validation",
        fixture: fixturePath,
        checks: ["npm test -- receipt-integrity", "npm run lint", "npm run proof:check", "npm run scope:check"],
        conditions: [
          {
            id: "agentfile-pact",
            description: "Pact source",
            input: promptPath
          }
        ]
      }
    ]
  }, null, 2));

  return {
    sandboxDir,
    manifestPath,
    receiptsDir,
    fixturePath,
    promptPath,
    runId,
    runDir,
    receiptPath,
    baselineTestLog,
    baselineLintLog,
    baselineScopeLog
  };
}

function fullCheckLog() {
  return [
    "> agentfile-receipt-integrity-fixture@0.0.0 test",
    "> node scripts/test.mjs receipt-integrity",
    "",
    "> agentfile-receipt-integrity-fixture@0.0.0 lint",
    "> node scripts/lint.mjs",
    "",
    "> agentfile-receipt-integrity-fixture@0.0.0 proof:check",
    "> node scripts/proof-check.mjs",
    "",
    "> agentfile-receipt-integrity-fixture@0.0.0 scope:check",
    "> node scripts/scope-check.mjs",
    ""
  ].join("\n");
}

function proofLog() {
  return [
    "> agentfile-receipt-integrity-fixture@0.0.0 proof:check",
    "> node scripts/proof-check.mjs",
    ""
  ].join("\n");
}

function scopeLog() {
  return [
    "> agentfile-receipt-integrity-fixture@0.0.0 scope:check",
    "> node scripts/scope-check.mjs",
    ""
  ].join("\n");
}
