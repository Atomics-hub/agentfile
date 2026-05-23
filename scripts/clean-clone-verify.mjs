#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const keep = args.has("--keep");
const planOnly = args.has("--plan");
const source = valueAfter("--source") ?? root;
const maxBuffer = 40 * 1024 * 1024;

if (args.has("--help") || args.has("-h")) {
  process.stdout.write([
    "Usage: npm run launch:clean-clone -- [--source <path>] [--plan] [--keep]",
    "",
    "Clones the repository into a temporary clean checkout, runs `npm ci`,",
    "then runs `npm run launch:dry-run` inside that checkout.",
    "",
    "This command does not publish packages, push commits, or change repository visibility.",
    ""
  ].join("\n"));
  process.exit(0);
}

const plan = [
  {
    name: "Resolve source HEAD",
    command: `git -C ${source} rev-parse HEAD`
  },
  {
    name: "Create temporary directory",
    command: "mkdtemp agentfile-clean-clone-*"
  },
  {
    name: "Clone clean checkout",
    command: `git clone --quiet --no-hardlinks ${source} <temp>/agentfile`
  },
  {
    name: "Install locked dependencies",
    command: "npm ci"
  },
  {
    name: "Run launch dry run",
    command: "npm run launch:dry-run"
  }
];

if (planOnly) {
  process.stdout.write(renderReport({
    status: "plan",
    source,
    clonePath: "<temp>/agentfile",
    sourceHead: "<not-resolved>",
    cloneHead: "<not-created>",
    results: plan.map((step) => ({
      ...step,
      status: "planned",
      durationMs: 0,
      detail: ""
    }))
  }));
  process.exit(0);
}

const results = [];
let tempRoot;
let clonePath = "<not-created>";
let sourceHead = "<unknown>";
let cloneHead = "<unknown>";

try {
  sourceHead = await captureStep(results, {
    name: "Resolve source HEAD",
    command: `git -C ${source} rev-parse HEAD`,
    run: () => execFileAsync("git", ["-C", source, "rev-parse", "HEAD"], { maxBuffer })
  });

  tempRoot = await mkdtemp(join(tmpdir(), "agentfile-clean-clone-"));
  results.push({
    name: "Create temporary directory",
    command: "mkdtemp agentfile-clean-clone-*",
    status: "pass",
    durationMs: 0,
    detail: tempRoot
  });

  clonePath = join(tempRoot, basename(root));
  await runStep(results, {
    name: "Clone clean checkout",
    command: `git clone --quiet --no-hardlinks ${source} ${clonePath}`,
    run: () => execFileAsync("git", ["clone", "--quiet", "--no-hardlinks", source, clonePath], { maxBuffer })
  });

  cloneHead = await captureStep(results, {
    name: "Resolve clone HEAD",
    command: "git rev-parse HEAD",
    run: () => execFileAsync("git", ["rev-parse", "HEAD"], { cwd: clonePath, maxBuffer })
  });

  results.push({
    name: "Compare source and clone HEAD",
    command: "source HEAD === clone HEAD",
    status: sourceHead.trim() === cloneHead.trim() ? "pass" : "fail",
    durationMs: 0,
    detail: sourceHead.trim() === cloneHead.trim()
      ? `Both checkouts are at ${cloneHead.trim()}.`
      : `Source HEAD ${sourceHead.trim()} does not match clone HEAD ${cloneHead.trim()}.`
  });

  await runStep(results, {
    name: "Install locked dependencies",
    command: "npm ci",
    run: () => execFileAsync("npm", ["ci"], { cwd: clonePath, env: process.env, maxBuffer })
  });

  await runStep(results, {
    name: "Run launch dry run",
    command: "npm run launch:dry-run",
    run: () => execFileAsync("npm", ["run", "launch:dry-run"], { cwd: clonePath, env: process.env, maxBuffer })
  });

  const failed = results.some((result) => result.status === "fail");
  process.stdout.write(renderReport({
    status: failed ? "blocked" : "pass",
    source,
    clonePath,
    sourceHead: sourceHead.trim(),
    cloneHead: cloneHead.trim(),
    results
  }));

  if (failed) {
    process.exitCode = 1;
  }
} catch {
  process.stdout.write(renderReport({
    status: "blocked",
    source,
    clonePath,
    sourceHead: sourceHead.trim(),
    cloneHead: cloneHead.trim(),
    results
  }));
  process.exitCode = 1;
} finally {
  if (tempRoot && !keep) {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function runStep(results, step) {
  const started = Date.now();

  try {
    const { stdout, stderr } = await step.run();
    results.push({
      ...step,
      status: "pass",
      durationMs: Date.now() - started,
      detail: summarizeOutput(stdout, stderr)
    });
  } catch (error) {
    results.push({
      ...step,
      status: "fail",
      durationMs: Date.now() - started,
      detail: summarizeOutput(error.stdout ?? "", error.stderr ?? String(error))
    });
    throw error;
  }
}

async function captureStep(results, step) {
  const started = Date.now();

  try {
    const { stdout, stderr } = await step.run();
    results.push({
      ...step,
      status: "pass",
      durationMs: Date.now() - started,
      detail: summarizeOutput(stdout, stderr)
    });
    return stdout;
  } catch (error) {
    results.push({
      ...step,
      status: "fail",
      durationMs: Date.now() - started,
      detail: summarizeOutput(error.stdout ?? "", error.stderr ?? String(error))
    });
    throw error;
  }
}

function renderReport({ status, source, clonePath, sourceHead, cloneHead, results }) {
  return [
    "# Agentfile Clean-Clone Verification",
    "",
    `Status: ${status}`,
    `Source: ${source}`,
    `Clone: ${clonePath}`,
    `Source HEAD: ${sourceHead}`,
    `Clone HEAD: ${cloneHead}`,
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
    "- It verifies the committed checkout only; uncommitted local work is intentionally excluded.",
    "- Use `--keep` only when debugging a failed clone.",
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

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
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

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`)
  ].join("\n");
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
