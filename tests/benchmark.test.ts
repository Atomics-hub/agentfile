import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const benchmarkRunnerPath = fileURLToPath(new URL("../benchmarks/run.mjs", import.meta.url));
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
    expect(plan.metrics).toContain("proof_vector_regression_tests");
    expect(plan.metrics).toContain("evidence_quality");

    const agentfile = plan.scoreSummary.byCondition.find(
      (condition: { conditionId: string }) => condition.conditionId === "agentfile-pact"
    );
    const plainIssue = plan.scoreSummary.byCondition.find(
      (condition: { conditionId: string }) => condition.conditionId === "plain-issue"
    );

    expect(agentfile.requiredCheckCoverageRate).toBeGreaterThanOrEqual(plainIssue.requiredCheckCoverageRate);
    expect(agentfile.proofCommandReportRate).toBeGreaterThanOrEqual(plainIssue.proofCommandReportRate);
    expect(agentfile.regressionTestRate).toBeGreaterThan(plainIssue.regressionTestRate);
    expect(agentfile.averageEvidenceQuality).toBeGreaterThanOrEqual(plainIssue.averageEvidenceQuality);

    const webhookTask = plan.scoreSummary.byTask.find(
      (task: { taskId: string }) => task.taskId === "verify-webhook-raw-signature"
    );

    expect(webhookTask.conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conditionId: "compiled-agents-md",
        receiptCount: 1,
        regressionTestRate: 1,
        evidenceQuality: "strong"
      }),
      expect.objectContaining({
        conditionId: "agentfile-pact",
        receiptCount: 2,
        regressionTestRate: 1,
        evidenceQuality: "strong"
      }),
      expect.objectContaining({
        conditionId: "plain-issue",
        receiptCount: 2,
        regressionTestRate: 0,
        evidenceQuality: "adequate"
      }),
      expect.objectContaining({
        conditionId: "agents-md",
        receiptCount: 1,
        regressionTestRate: 1,
        evidenceQuality: "strong"
      })
    ]));

    const redactTask = plan.scoreSummary.byTask.find(
      (task: { taskId: string }) => task.taskId === "redact-auth-logs"
    );

    expect(redactTask.conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conditionId: "agentfile-pact",
        proofCommandReportRate: 1,
        evidenceQuality: "strong"
      }),
      expect.objectContaining({
        conditionId: "plain-issue",
        proofCommandReportRate: 0,
        evidenceQuality: "weak"
      }),
      expect.objectContaining({
        conditionId: "agents-md",
        proofCommandReportRate: 1,
        evidenceQuality: "strong"
      }),
      expect.objectContaining({
        conditionId: "compiled-agents-md",
        proofCommandReportRate: 1,
        evidenceQuality: "strong"
      })
    ]));
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
    expect(error.stderr).toContain("inputs.promptOrContract must match receipt-integrity/agentfile-pact input");
    expect(error.stderr).toContain("results.reportedProofCheck requires verificationCommandsRun to include npm run proof:check");
    expect(error.stderr).toContain('receipts.baselineProofLog is required for task check "npm run proof:check"');
    expect(error.stderr).toContain('receipts.baselineScopeLog is required for task check "npm run scope:check"');
    expect(error.stderr).toContain(`receipts.transcript file is missing: ${missingTranscriptPath}`);
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
    expect(error.stderr).toContain('receipts.baselineProofLog must show command "npm run proof:check"');
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
  const runId = "receipt-integrity-agentfile-pact-001";
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
    baselineLintLog,
    baselineScopeLog
  };
}
