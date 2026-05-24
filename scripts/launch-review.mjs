import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { reviewPublicClaims } from "./public-claim-review.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
const benchmarkRunnerPath = resolve(root, "benchmarks/run.mjs");
const cleanCloneReportPath = resolve(root, process.env.AGENTFILE_CLEAN_CLONE_REPORT ?? ".agentfile/clean-clone-report.json");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const benchmarkPlan = await loadBenchmarkPlan();
const claimReview = await reviewPublicClaims();
const currentCommit = await loadCurrentCommit();
const cleanCloneReport = await loadCleanCloneReport();

process.stdout.write(renderLaunchReview({
  packageJson,
  benchmarkPlan,
  claimReview,
  currentCommit,
  cleanCloneReport,
  files: await probeFiles([
    "README.md",
    "docs/demo.md",
    "docs/cli.md",
    "docs/security-model.md",
    "docs/roadmap.md",
    "docs/benchmark-results.md",
    "docs/public-claims.md",
    "examples/fix-login-race.agent",
    "src/cli.ts",
    "src/compiler.ts",
    "src/source.ts",
    "src/renderers/instructions.ts",
    "benchmarks/report.mjs"
  ])
}));

async function loadBenchmarkPlan() {
  const { stdout } = await execFileAsync("node", [benchmarkRunnerPath], {
    env: process.env,
    maxBuffer: 1024 * 1024
  });

  return JSON.parse(stdout);
}

async function loadCurrentCommit() {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    env: process.env,
    maxBuffer: 1024 * 1024
  });

  return stdout.trim();
}

async function loadCleanCloneReport() {
  try {
    const report = JSON.parse(await readFile(cleanCloneReportPath, "utf8"));
    const valid = report.status === "pass"
      && typeof report.sourceHead === "string"
      && report.sourceHead === report.cloneHead
      && Array.isArray(report.steps)
      && report.steps.some((step) => step.name === "Run launch dry run" && step.status === "pass");

    return {
      ...report,
      valid
    };
  } catch {
    return null;
  }
}

async function probeFiles(paths) {
  const entries = await Promise.all(paths.map(async (path) => [path, await exists(resolve(root, path))]));
  return Object.fromEntries(entries);
}

async function exists(path) {
  return access(path).then(() => true).catch(() => false);
}

function renderLaunchReview({ packageJson, benchmarkPlan, claimReview, currentCommit, cleanCloneReport, files }) {
  const cleanCloneReady = cleanCloneReport?.valid === true && cleanCloneReport.sourceHead === currentCommit;
  const benchmarkCoverage = summarizeBenchmarkCoverage(benchmarkPlan);
  const benchmarkProofReady = benchmarkPlan.receiptCount >= 24
    && (benchmarkPlan.scoreSummary?.comparableConditionPairs ?? 0) >= 24
    && (benchmarkPlan.scoreSummary?.repeatedConditionPairs ?? 0) >= 4
    && benchmarkCoverage.missingConditionCount === 0
    && benchmarkCoverage.completedFourConditionTasks.length >= 2;
  const gates = [
    gate("Clear README/demo", files["README.md"] && files["docs/demo.md"] && files["examples/fix-login-race.agent"], [
      "README, demo doc, and Pact example are present.",
      "Verify the demo from a clean clone before public launch."
    ]),
    gate("Clean compiler architecture", files["src/compiler.ts"] && files["src/source.ts"] && files["src/renderers/instructions.ts"], [
      "Compiler, source parser, and instruction renderer modules are separated.",
      "Keep broad refactors out of launch unless they reduce real risk."
    ]),
    gate("Stable CLI", files["src/cli.ts"] && files["docs/cli.md"] && Boolean(packageJson.bin?.agentfile), [
      "CLI entry point, package bin, and CLI docs are present.",
      "Run `npm run check` before any launch decision."
    ]),
    gate("Fast reliable tests", cleanCloneReady ? true : null, [
      cleanCloneReady
        ? `Clean-clone verification passed for current commit ${currentCommit.slice(0, 7)}.`
        : "No current clean-clone verification report found.",
      "Run `npm run launch:clean-clone` after committing launch-gate changes."
    ]),
    gate("Private security posture", packageJson.private === true && files["docs/security-model.md"], [
      "`package.json` is private and security docs are present.",
      "Remote visibility still requires `gh repo view Atomics-hub/agentfile --json visibility`."
    ]),
    gate("Benchmark/demo proof", benchmarkProofReady, [
      `${benchmarkPlan.receiptCount} receipts, ${benchmarkPlan.scoreSummary?.comparableConditionPairs ?? 0} comparable pairs, ${benchmarkPlan.scoreSummary?.repeatedConditionPairs ?? 0} repeated pairs.`,
      `${benchmarkCoverage.completedFourConditionTasks.length} completed four-condition task families, ${benchmarkCoverage.missingConditionCount} missing condition receipts.`,
      "Claims must cite receipt-level evidence, not just aggregate scores."
    ]),
    gate("Launch risk", claimReview.violationCount === 0 && files["docs/public-claims.md"], [
      `Automated public-claim review found ${claimReview.violationCount} blocked claim pattern(s) across ${claimReview.surfaceCount} launch-facing surfaces.`,
      "Public copy must stay limited to reviewable contracts, compiled instruction surfaces, and auditable proof obligations."
    ])
  ];

  return [
    "# Agentfile Launch Review",
    "",
    `Benchmark receipts: ${benchmarkPlan.receiptCount}`,
    `Benchmark conditions: ${benchmarkPlan.conditionCount}`,
    `Comparable pairs: ${benchmarkPlan.scoreSummary?.comparableConditionPairs ?? 0}`,
    `Repeated pairs: ${benchmarkPlan.scoreSummary?.repeatedConditionPairs ?? 0}`,
    `Fully covered tasks: ${benchmarkCoverage.fullyCoveredTaskCount} / ${benchmarkCoverage.taskCount}`,
    `Missing condition receipts: ${benchmarkCoverage.missingConditionCount}`,
    "",
    "## Benchmark Coverage",
    "",
    `Fully covered tasks: ${formatList(benchmarkCoverage.fullyCoveredTasks)}`,
    `Completed four-condition tasks: ${formatList(benchmarkCoverage.completedFourConditionTasks)}`,
    `Missing condition receipts: ${benchmarkCoverage.missingConditionCount}`,
    "",
    "## Gate Summary",
    "",
    table(
      ["Gate", "Status", "Evidence"],
      gates.map((entry) => [
        entry.name,
        entry.status,
        entry.evidence.join("<br>")
      ])
    ),
    "",
    "## Required Manual Checks",
    "",
    "- Run `npm run launch:clean-clone` after launch-gate changes.",
    "- Verify GitHub remote visibility is private before any push or launch review.",
    "- Review public README, package metadata, and docs against `docs/public-claims.md`.",
    "- Keep package publishing disabled until an explicit release decision.",
    ""
  ].join("\n");
}

function summarizeBenchmarkCoverage(benchmarkPlan) {
  const tasks = benchmarkPlan.scoreSummary?.byTask ?? [];
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
    fullyCoveredTasks,
    completedFourConditionTasks,
    missingConditionCount
  };
}

function formatList(values) {
  return values.length > 0 ? values.map((value) => `\`${value}\``).join(", ") : "none";
}

function gate(name, passed, evidence) {
  return {
    name,
    status: passed === true ? "ready" : (passed === false ? "blocked" : "manual-check"),
    evidence
  };
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`)
  ].join("\n");
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}
