import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
const benchmarkRunnerPath = resolve(root, "benchmarks/run.mjs");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const benchmarkPlan = await loadBenchmarkPlan();

process.stdout.write(renderLaunchReview({
  packageJson,
  benchmarkPlan,
  files: await probeFiles([
    "README.md",
    "docs/demo.md",
    "docs/cli.md",
    "docs/security-model.md",
    "docs/roadmap.md",
    "docs/benchmark-results.md",
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

async function probeFiles(paths) {
  const entries = await Promise.all(paths.map(async (path) => [path, await exists(resolve(root, path))]));
  return Object.fromEntries(entries);
}

async function exists(path) {
  return access(path).then(() => true).catch(() => false);
}

function renderLaunchReview({ packageJson, benchmarkPlan, files }) {
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
    gate("Fast reliable tests", null, [
      "This report does not execute `npm run check`.",
      "Launch gate requires a fresh clean-clone `npm run check`."
    ]),
    gate("Private security posture", packageJson.private === true && files["docs/security-model.md"], [
      "`package.json` is private and security docs are present.",
      "Remote visibility still requires `gh repo view Atomics-hub/agentfile --json visibility`."
    ]),
    gate("Benchmark/demo proof", benchmarkPlan.receiptCount >= 16 && benchmarkPlan.scoreSummary?.repeatedConditionPairs >= 1, [
      `${benchmarkPlan.receiptCount} receipts, ${benchmarkPlan.scoreSummary?.comparableConditionPairs ?? 0} comparable pairs, ${benchmarkPlan.scoreSummary?.repeatedConditionPairs ?? 0} repeated pairs.`,
      "Claims must cite receipt-level evidence, not just aggregate scores."
    ]),
    gate("Launch risk", false, [
      "Broad claims are still not supported.",
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
    "- Run `npm run check` from a clean clone.",
    "- Verify GitHub remote visibility is private before any push or launch review.",
    "- Review public README, package metadata, and docs for overbroad claims.",
    "- Keep package publishing disabled until an explicit release decision.",
    ""
  ].join("\n");
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
