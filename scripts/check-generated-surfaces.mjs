#!/usr/bin/env node

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
const cliPath = resolve(root, "dist/cli.js");

const checks = [
  {
    name: "demo AGENTS.md",
    source: "examples/fix-login-race.agent",
    target: "agents-md",
    output: "tests/fixtures/demo/AGENTS.md"
  },
  {
    name: "demo CLAUDE.md",
    source: "examples/fix-login-race.agent",
    target: "claude-md",
    output: "tests/fixtures/demo/CLAUDE.md"
  },
  {
    name: "demo Cursor rule",
    source: "examples/fix-login-race.agent",
    target: "cursor-mdc",
    output: "tests/fixtures/demo/agentfile.mdc"
  },
  {
    name: "demo Copilot instructions",
    source: "examples/fix-login-race.agent",
    target: "copilot-md",
    output: "tests/fixtures/demo/copilot-instructions.md"
  },
  {
    name: "redaction benchmark AGENTS.md",
    source: "benchmarks/tasks/redact-logs/redact-logs.agent",
    target: "agents-md",
    output: "benchmarks/tasks/redact-logs/compiled-agentfile.AGENTS.md"
  },
  {
    name: "webhook benchmark AGENTS.md",
    source: "benchmarks/tasks/webhook-signature/webhook-signature.agent",
    target: "agents-md",
    output: "benchmarks/tasks/webhook-signature/compiled-agentfile.AGENTS.md"
  },
  {
    name: "audit benchmark AGENTS.md",
    source: "benchmarks/tasks/audit-evidence/audit-evidence.agent",
    target: "agents-md",
    output: "benchmarks/tasks/audit-evidence/compiled-agentfile.AGENTS.md"
  },
  {
    name: "tenant export benchmark AGENTS.md",
    source: "benchmarks/tasks/tenant-export/tenant-export.agent",
    target: "agents-md",
    output: "benchmarks/tasks/tenant-export/compiled-agentfile.AGENTS.md"
  },
  {
    name: "fulfillment benchmark AGENTS.md",
    source: "benchmarks/tasks/fulfillment-pii/fulfillment-pii.agent",
    target: "agents-md",
    output: "benchmarks/tasks/fulfillment-pii/compiled-agentfile.AGENTS.md"
  },
  {
    name: "pricing benchmark AGENTS.md",
    source: "benchmarks/tasks/pricing-refactor/pricing-refactor.agent",
    target: "agents-md",
    output: "benchmarks/tasks/pricing-refactor/compiled-agentfile.AGENTS.md"
  }
];

const results = [];

for (const check of checks) {
  results.push(await runCheck(check));
}

const failed = results.some((result) => result.status === "fail");
process.stdout.write(renderReport(results));

if (failed) {
  process.exitCode = 1;
}

async function runCheck(check) {
  try {
    await execFileAsync("node", [
      cliPath,
      "sync",
      check.source,
      "--target",
      check.target,
      "--output",
      check.output,
      "--check"
    ], {
      cwd: root,
      env: process.env,
      maxBuffer: 1024 * 1024
    });

    return {
      ...check,
      status: "pass",
      detail: `${check.output} is up to date.`
    };
  } catch (error) {
    return {
      ...check,
      status: "fail",
      detail: summarizeFailure(error)
    };
  }
}

function renderReport(results) {
  return [
    "# Agentfile Generated Surface Check",
    "",
    table(
      ["Surface", "Status", "Source", "Output"],
      results.map((result) => [
        result.name,
        result.status,
        result.source,
        result.output
      ])
    ),
    "",
    ...results
      .filter((result) => result.status === "fail")
      .flatMap((result) => [
        `## ${result.name}`,
        "",
        result.detail,
        ""
      ]),
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

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}

function summarizeFailure(error) {
  const output = [
    error.stdout,
    error.stderr,
    error instanceof Error ? error.message : String(error)
  ].filter(Boolean).join("\n").trim();

  return fence(output || "No failure output.");
}

function fence(value) {
  return ["```", value.replaceAll("```", "'''"), "```"].join("\n");
}
