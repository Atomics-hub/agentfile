#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const skipCheck = args.has("--skip-check") || process.env.AGENTFILE_LAUNCH_DRY_RUN_SKIP_CHECK === "1";
const maxBuffer = 20 * 1024 * 1024;

const results = [];

const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
results.push({
  name: "Package remains private",
  command: "package.json private === true",
  status: packageJson.private === true ? "pass" : "fail",
  durationMs: 0,
  detail: packageJson.private === true
    ? "`package.json` still has `private: true`."
    : "`package.json` must keep `private: true` until an explicit release decision."
});

const commands = [
  ...(skipCheck ? [] : [{
    name: "Full local checks",
    command: "npm run check",
    args: ["run", "check"]
  },
  {
    name: "README quick loop",
    command: "npm run demo:quick",
    args: ["run", "demo:quick"]
  }]),
  {
    name: "Launch metadata review",
    command: "npm run launch:metadata",
    args: ["run", "launch:metadata"]
  },
  {
    name: "Benchmark plan validation",
    command: "npm run benchmark:plan",
    args: ["run", "benchmark:plan"]
  },
  {
    name: "Benchmark report render",
    command: "npm run benchmark:report",
    args: ["run", "benchmark:report"]
  },
  {
    name: "Launch gate review",
    command: "npm run launch:review",
    args: ["run", "launch:review"]
  }
];

for (const step of commands) {
  results.push(await runStep(step));
}

const failed = results.some((result) => result.status === "fail");
process.stdout.write(renderReport({ failed, results, skipCheck }));

if (failed) {
  process.exitCode = 1;
}

async function runStep(step) {
  const started = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync("npm", step.args, {
      cwd: root,
      env: process.env,
      maxBuffer
    });

    return {
      ...step,
      status: "pass",
      durationMs: Date.now() - started,
      detail: summarizeOutput(stdout, stderr)
    };
  } catch (error) {
    return {
      ...step,
      status: "fail",
      durationMs: Date.now() - started,
      detail: summarizeOutput(error.stdout ?? "", error.stderr ?? String(error))
    };
  }
}

function renderReport({ failed, results, skipCheck }) {
  return [
    "# Agentfile Pre-Public Dry Run",
    "",
    `Status: ${failed ? "blocked" : "pass"}`,
    `Mode: ${skipCheck ? "skip-check" : "full"}`,
    "",
    "## Steps",
    "",
    table(
      ["Step", "Status", "Duration", "Command"],
      results.map((result) => [
        result.name,
        result.status,
        formatDuration(result.durationMs),
        result.command
      ])
    ),
    "",
    "## Guardrails",
    "",
    "- This command does not publish packages, push commits, or change repository visibility.",
    "- Verify GitHub visibility separately before any push or public launch decision.",
    "- Treat a passing dry run as necessary but not sufficient; broad public claims still require manual review.",
    "",
    ...results.flatMap((result) => renderDetail(result)),
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

function renderDetail(result) {
  if (result.status === "pass" && result.name !== "Package remains private") {
    return [];
  }

  return [
    `## ${result.name}`,
    "",
    result.detail || "No output.",
    ""
  ];
}

function summarizeOutput(stdout, stderr) {
  const output = [stdout, stderr].filter(Boolean).join("\n").trim();
  if (!output) {
    return "No output.";
  }

  return fence(tail(output, 60));
}

function tail(value, lineCount) {
  const lines = String(value).split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - lineCount)).join("\n");
}

function fence(value) {
  return ["```", value.replaceAll("```", "'''"), "```"].join("\n");
}

function formatDuration(durationMs) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}
