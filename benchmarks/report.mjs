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
  const coverage = summarizeCoverage(plan);
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
    `- Comparable pairs: ${plan.scoreSummary?.comparableConditionPairs ?? 0}`,
    `- Repeated pairs: ${plan.scoreSummary?.repeatedConditionPairs ?? 0}`,
    "",
    "## Coverage Summary",
    "",
    `- Fully covered tasks: ${coverage.fullyCoveredTaskCount} / ${coverage.taskCount}`,
    `- Missing condition receipts: ${coverage.missingConditionCount}`,
    `- Completed four-condition tasks: ${formatList(coverage.completedFourConditionTasks)}`,
    "",
    "## Condition Summary",
    "",
    table(
      ["Condition", "Receipts", "Checks", "Proof", "Proof Pass", "Regression", "Files", "Lines", "Quality", "Evidence"],
      (plan.scoreSummary?.byCondition ?? []).map((condition) => [
        code(condition.conditionId),
        number(condition.receiptCount),
        percent(condition.requiredCheckCoverageRate),
        nullablePercent(condition.proofCommandReportRate),
        nullablePercent(condition.independentProofCheckPassRate),
        nullablePercent(condition.regressionTestRate),
        nullableNumber(condition.averagePatchFilesChanged),
        nullableNumber(condition.averagePatchLinesChanged),
        nullableNumber(condition.averageNormalizedQualityScore),
        nullableNumber(condition.averageEvidenceQuality)
      ])
    ),
    ""
  ];

  const missingEvidence = missingEvidenceRows(plan);
  if (missingEvidence.length > 0) {
    lines.push("## Missing Evidence");
    lines.push("");
    lines.push(table(
      ["Task", "Condition", "Input"],
      missingEvidence.map((row) => [
        code(row.taskId),
        code(row.conditionId),
        code(row.input)
      ])
    ));
    lines.push("");
  }

  lines.push("## Task Coverage");
  lines.push("");

  for (const task of plan.scoreSummary?.byTask ?? []) {
    lines.push(`### ${code(task.taskId)}`);
    lines.push("");
    lines.push(table(
      ["Condition", "Receipts", "Checks", "Proof", "Proof Pass", "Regression", "Lines", "Evidence"],
      task.conditions.map((condition) => [
        code(condition.conditionId),
        number(condition.receiptCount),
        nullablePercent(condition.requiredCheckCoverage),
        nullablePercent(condition.proofCommandReportRate),
        nullablePercent(condition.independentProofCheckPassRate),
        nullablePercent(condition.regressionTestRate),
        nullableNumber(condition.averagePatchLinesChanged),
        code(condition.evidenceQuality)
      ])
    ));
    lines.push("");
    if ((task.comparisons ?? []).length > 0) {
      lines.push(table(
        ["Pair", "Matched", "Repeated", "Delta Quality", "Delta Proof", "Delta Proof Pass", "Delta Regression", "Delta Evidence"],
        task.comparisons.map((comparison) => [
          `${code(comparison.leftConditionId)} vs ${code(comparison.rightConditionId)}`,
          number(comparison.comparableReceiptCount),
          comparison.isRepeated ? "yes" : "no",
          nullableNumber(comparison.normalizedQualityDelta),
          nullableNumber(comparison.proofCommandReportDelta),
          nullableNumber(comparison.independentProofCheckPassDelta),
          nullableNumber(comparison.regressionTestDelta),
          nullableNumber(comparison.evidenceQualityDelta)
        ])
      ));
      lines.push("");
    }
  }

  lines.push("## Interpretation Guardrails");
  lines.push("");
  lines.push("- Treat normalized quality as a triage score, not a public claim.");
  lines.push("- Prefer receipt-level evidence for launch claims.");
  lines.push("- Missing receipts and low sample counts should block broad comparisons.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function summarizeCoverage(plan) {
  const tasks = plan.scoreSummary?.byTask ?? [];
  const fullyCoveredTasks = tasks
    .filter((task) => task.conditions.every((condition) => condition.receiptCount > 0))
    .map((task) => task.taskId);
  const completedFourConditionTasks = tasks
    .filter((task) => task.conditions.length >= 4 && task.conditions.every((condition) => condition.receiptCount > 0))
    .map((task) => task.taskId);
  const missingConditionCount = tasks.reduce(
    (count, task) => count + task.conditions.filter((condition) => condition.receiptCount === 0).length,
    0
  );

  return {
    taskCount: tasks.length,
    fullyCoveredTaskCount: fullyCoveredTasks.length,
    completedFourConditionTasks,
    missingConditionCount
  };
}

function missingEvidenceRows(plan) {
  const taskInputByCondition = new Map(
    (plan.tasks ?? []).map((task) => [
      task.id,
      new Map((task.conditions ?? []).map((condition) => [condition.id, condition.input]))
    ])
  );
  const rows = [];

  for (const task of plan.scoreSummary?.byTask ?? []) {
    for (const condition of task.conditions ?? []) {
      if (condition.receiptCount !== 0) {
        continue;
      }
      rows.push({
        taskId: task.taskId,
        conditionId: condition.conditionId,
        input: taskInputByCondition.get(task.taskId)?.get(condition.conditionId) ?? "unknown"
      });
    }
  }

  return rows;
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

function formatList(values) {
  return values.length > 0 ? values.map(code).join(", ") : "none";
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
