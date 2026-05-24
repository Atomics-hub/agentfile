#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
const args = process.argv.slice(2);
const json = args.includes("--json");
const help = args.includes("--help") || args.includes("-h");
const taskId = args.find((arg) => !arg.startsWith("-"));
const manifestPath = resolve(root, process.env.AGENTFILE_BENCHMARK_MANIFEST ?? "benchmarks/manifest.json");
const maxBuffer = 10 * 1024 * 1024;

if (help || !taskId) {
  process.stdout.write([
    "Usage: npm run benchmark:baseline -- <task-id> [--json]",
    "",
    "Runs a benchmark task's manifest checks against the fixture baseline.",
    "Failing task tests are allowed; this command is for receipt preparation,",
    "not for claiming a completed run.",
    ""
  ].join("\n"));
  process.exit(help ? 0 : 1);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const task = (manifest.tasks ?? []).find((candidate) => candidate.id === taskId);

if (!task) {
  console.error(`Unknown benchmark task "${taskId}".`);
  process.exit(1);
}

if (!task.fixture) {
  console.error(`Benchmark task "${taskId}" does not define a fixture.`);
  process.exit(1);
}

const report = {
  taskId: task.id,
  family: task.family,
  fixture: task.fixture,
  checks: [],
  failedCheckCount: 0,
  passedCheckCount: 0
};

for (const command of task.checks ?? []) {
  const result = await runCheck(command, resolve(root, task.fixture));
  report.checks.push(result);
}

report.failedCheckCount = report.checks.filter((check) => check.status === "fail").length;
report.passedCheckCount = report.checks.filter((check) => check.status === "pass").length;
report.status = report.failedCheckCount > 0 ? "baseline-has-failures" : "baseline-passes";

process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderReport(report));

async function runCheck(command, cwd) {
  const started = Date.now();
  const [executable, ...commandArgs] = command.split(" ");

  try {
    const { stdout, stderr } = await execFileAsync(executable, commandArgs, {
      cwd,
      env: process.env,
      maxBuffer
    });

    return {
      command,
      status: "pass",
      exitCode: 0,
      durationMs: Date.now() - started,
      summary: summarizeOutput(stdout, stderr)
    };
  } catch (error) {
    return {
      command,
      status: "fail",
      exitCode: error.code ?? 1,
      durationMs: Date.now() - started,
      summary: summarizeOutput(error.stdout ?? "", error.stderr ?? String(error))
    };
  }
}

function renderReport(report) {
  return [
    "# Agentfile Benchmark Baseline",
    "",
    `Task: \`${report.taskId}\``,
    `Family: \`${report.family}\``,
    `Fixture: \`${report.fixture}\``,
    `Status: ${report.status}`,
    "",
    "## Checks",
    "",
    table(
      ["Command", "Status", "Exit", "Duration", "Summary"],
      report.checks.map((check) => [
        `\`${check.command}\``,
        check.status,
        String(check.exitCode),
        formatDuration(check.durationMs),
        check.summary
      ])
    ),
    "",
    "## Receipt Notes",
    "",
    "- Store the failing baseline test log as `baseline-test.log` when a task test fails before the agent run.",
    "- Store passing guard logs such as lint, proof, or scope checks when the manifest requires them.",
    "- A baseline failure here is expected for tasks that encode the bug to be fixed.",
    ""
  ].join("\n");
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`)
  ].join("\n");
}

function summarizeOutput(stdout, stderr) {
  const text = [stdout, stderr].filter(Boolean).join("\n").trim();
  if (!text) {
    return "no output";
  }

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join("<br>");
}

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}
