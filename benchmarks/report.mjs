import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchmarkRunnerPath = resolve(root, "benchmarks/run.mjs");

const { stdout } = await execFileAsync("node", [benchmarkRunnerPath], {
  env: process.env,
  maxBuffer: 1024 * 1024
});

process.stdout.write(renderReport(JSON.parse(stdout)));

function renderReport(plan) {
  const lines = [
    "# Agentfile Benchmark Report",
    "",
    `Claim status: ${code(plan.claimStatus)}`,
    "",
    plan.claimToTest,
    "",
    "## Dataset",
    "",
    `- Tasks: ${plan.taskCount}`,
    `- Conditions: ${plan.conditionCount}`,
    `- Receipts: ${plan.receiptCount}`,
    `- Receipts scored: ${plan.scoreSummary?.receiptsScored ?? 0}`,
    "",
    "## Condition Summary",
    "",
    table(
      ["Condition", "Receipts", "Checks", "Proof", "Regression", "Files", "Lines", "Quality", "Evidence"],
      (plan.scoreSummary?.byCondition ?? []).map((condition) => [
        code(condition.conditionId),
        number(condition.receiptCount),
        percent(condition.requiredCheckCoverageRate),
        nullablePercent(condition.proofCommandReportRate),
        nullablePercent(condition.regressionTestRate),
        nullableNumber(condition.averagePatchFilesChanged),
        nullableNumber(condition.averagePatchLinesChanged),
        nullableNumber(condition.averageNormalizedQualityScore),
        nullableNumber(condition.averageEvidenceQuality)
      ])
    ),
    "",
    "## Task Coverage",
    ""
  ];

  for (const task of plan.scoreSummary?.byTask ?? []) {
    lines.push(`### ${code(task.taskId)}`);
    lines.push("");
    lines.push(table(
      ["Condition", "Receipts", "Checks", "Proof", "Regression", "Lines", "Evidence"],
      task.conditions.map((condition) => [
        code(condition.conditionId),
        number(condition.receiptCount),
        nullablePercent(condition.requiredCheckCoverage),
        nullablePercent(condition.proofCommandReportRate),
        nullablePercent(condition.regressionTestRate),
        nullableNumber(condition.averagePatchLinesChanged),
        code(condition.evidenceQuality)
      ])
    ));
    lines.push("");
  }

  lines.push("## Interpretation Guardrails");
  lines.push("");
  lines.push("- Treat normalized quality as a triage score, not a public claim.");
  lines.push("- Prefer receipt-level evidence for launch claims.");
  lines.push("- Missing receipts and low sample counts should block broad comparisons.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`)
  ].join("\n");
}

function code(value) {
  return `\`${String(value)}\``;
}

function number(value) {
  return String(value);
}

function nullableNumber(value) {
  return value === null || value === undefined ? "n/a" : String(value);
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function nullablePercent(value) {
  return value === null || value === undefined ? "n/a" : percent(value);
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}
