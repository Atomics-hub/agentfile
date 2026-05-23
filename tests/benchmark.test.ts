import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const benchmarkRunnerPath = fileURLToPath(new URL("../benchmarks/run.mjs", import.meta.url));

describe("benchmark receipt scoring", () => {
  it("summarizes proof and evidence quality signals from stored receipts", async () => {
    const { stdout } = await execFileAsync("node", [benchmarkRunnerPath], {
      maxBuffer: 1024 * 1024
    });
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
      })
    ]));
  });
});
