#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
const maxBuffer = 20 * 1024 * 1024;
const expectedPendingFailure = 'requiredProof[npm-test-auth].status: expected "passed", got "pending"';

const results = [];
let tempRoot;

try {
  tempRoot = await mkdtemp(join(tmpdir(), "agentfile-readme-demo-"));

  await runStep({
    name: "Build CLI",
    command: "npm run build",
    run: () => execFileAsync("npm", ["run", "build"], { cwd: root, env: process.env, maxBuffer })
  });

  await runStep({
    name: "Validate example contract",
    command: "node dist/cli.js check examples/fix-login-race.agent",
    run: () => execFileAsync("node", ["dist/cli.js", "check", "examples/fix-login-race.agent"], {
      cwd: root,
      env: process.env,
      maxBuffer
    })
  });

  await runStep({
    name: "Generate AGENTS.md",
    command: "node dist/cli.js sync examples/fix-login-race.agent --target agents-md --output <temp>/AGENTS.md --force",
    run: () => sync("agents-md", "AGENTS.md")
  });

  await runStep({
    name: "Generate CLAUDE.md",
    command: "node dist/cli.js sync examples/fix-login-race.agent --target claude-md --output <temp>/CLAUDE.md --force",
    run: () => sync("claude-md", "CLAUDE.md")
  });

  await runStep({
    name: "Generate Cursor rule",
    command: "node dist/cli.js sync examples/fix-login-race.agent --target cursor-mdc --output <temp>/agentfile.mdc --force",
    run: () => sync("cursor-mdc", "agentfile.mdc")
  });

  await runStep({
    name: "Generate Copilot instructions",
    command: "node dist/cli.js sync examples/fix-login-race.agent --target copilot-md --output <temp>/copilot-instructions.md --force",
    run: () => sync("copilot-md", "copilot-instructions.md")
  });

  await runStep({
    name: "Verify passing receipt",
    command: "node dist/cli.js receipt verify examples/fix-login-race.agent examples/receipts/fix-login-passing.receipt.json",
    run: () => execFileAsync("node", [
      "dist/cli.js",
      "receipt",
      "verify",
      "examples/fix-login-race.agent",
      "examples/receipts/fix-login-passing.receipt.json"
    ], { cwd: root, env: process.env, maxBuffer })
  });

  await runStep({
    name: "Verify pending receipt fails",
    command: "node dist/cli.js receipt verify examples/fix-login-race.agent examples/receipts/fix-login-pending.receipt.json",
    run: () => expectFailureWith(
      ["dist/cli.js", "receipt", "verify", "examples/fix-login-race.agent", "examples/receipts/fix-login-pending.receipt.json"],
      expectedPendingFailure
    )
  });
} finally {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const failed = results.some((result) => result.status === "fail");
process.stdout.write(renderReport(failed));

if (failed) {
  process.exitCode = 1;
}

function sync(target, outputName) {
  return execFileAsync("node", [
    "dist/cli.js",
    "sync",
    "examples/fix-login-race.agent",
    "--target",
    target,
    "--output",
    join(tempRoot, outputName),
    "--force"
  ], { cwd: root, env: process.env, maxBuffer });
}

async function expectFailureWith(args, expectedText) {
  try {
    await execFileAsync("node", args, { cwd: root, env: process.env, maxBuffer });
    return {
      stdout: "",
      stderr: `Expected command to fail with: ${expectedText}`
    };
  } catch (error) {
    const output = [error.stdout ?? "", error.stderr ?? String(error)].filter(Boolean).join("\n");
    if (output.includes(expectedText)) {
      return {
        stdout: output,
        stderr: ""
      };
    }

    throw error;
  }
}

async function runStep(step) {
  const started = Date.now();

  try {
    const { stdout, stderr } = await step.run();
    const detail = summarizeOutput(stdout, stderr);
    const status = detail.includes("Expected command to fail with:") ? "fail" : "pass";
    results.push({
      ...step,
      status,
      durationMs: Date.now() - started,
      detail
    });
  } catch (error) {
    results.push({
      ...step,
      status: "fail",
      durationMs: Date.now() - started,
      detail: summarizeOutput(error.stdout ?? "", error.stderr ?? String(error))
    });
  }
}

function renderReport(failed) {
  return [
    "# Agentfile README Quick Loop",
    "",
    `Status: ${failed ? "blocked" : "pass"}`,
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
    ...results.filter((result) => result.status === "fail").flatMap((result) => [
      `## ${result.name}`,
      "",
      result.detail || "No output.",
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
