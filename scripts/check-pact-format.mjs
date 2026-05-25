#!/usr/bin/env node

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
const cliPath = resolve(root, "dist/cli.js");

const files = (await execFileAsync("git", ["ls-files", "*.agent"], {
  cwd: root,
  maxBuffer: 1024 * 1024
})).stdout
  .split(/\r?\n/)
  .filter(Boolean);

const results = [];

for (const file of files) {
  results.push(await runCheck(file));
}

const failed = results.some((result) => result.status === "fail");
process.stdout.write(renderReport(results));

if (failed) {
  process.exitCode = 1;
}

async function runCheck(file) {
  try {
    await execFileAsync("node", [cliPath, "format", file, "--check"], {
      cwd: root,
      env: process.env,
      maxBuffer: 1024 * 1024
    });

    return {
      file,
      status: "pass",
      detail: "formatted"
    };
  } catch (error) {
    return {
      file,
      status: "fail",
      detail: summarizeFailure(error)
    };
  }
}

function renderReport(results) {
  return [
    "# Agentfile Pact Source Format Check",
    "",
    table(
      ["Source", "Status"],
      results.map((result) => [result.file, result.status])
    ),
    "",
    ...results
      .filter((result) => result.status === "fail")
      .flatMap((result) => [
        `## ${result.file}`,
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
