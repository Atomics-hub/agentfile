#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expected = {
  packageName: "agentfile-contract",
  packageDescription: "Contract language for reviewable AI coding agent delegation.",
  repositoryUrl: "git+https://github.com/Atomics-hub/agentfile.git",
  homepage: "https://github.com/Atomics-hub/agentfile#readme",
  bugsUrl: "https://github.com/Atomics-hub/agentfile/issues",
  githubDescription: "Contract language for reviewable AI coding agent delegation."
};

export async function reviewLaunchMetadata() {
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const checks = [
    check("Package remains private", packageJson.private === true, "`package.json` keeps `private: true`."),
    check("Package name", packageJson.name === expected.packageName, `Expected package name: ${expected.packageName}`),
    check("Package description", packageJson.description === expected.packageDescription, `Expected package description: ${expected.packageDescription}`),
    check("Repository URL", packageJson.repository?.url === expected.repositoryUrl, `Expected repository URL: ${expected.repositoryUrl}`),
    check("Homepage URL", packageJson.homepage === expected.homepage, `Expected homepage: ${expected.homepage}`),
    check("Issues URL", packageJson.bugs?.url === expected.bugsUrl, `Expected issues URL: ${expected.bugsUrl}`),
    check("Package publishing gated", packageJson.private === true && Boolean(packageJson.bin?.agentfile), "Package has a CLI bin but remains private until an explicit release decision.")
  ];

  return {
    status: checks.every((entry) => entry.status === "pass") ? "pass" : "blocked",
    expectedGithubDescription: expected.githubDescription,
    checks
  };
}

export function renderLaunchMetadataReview(review) {
  return [
    "# Agentfile Launch Metadata Review",
    "",
    `Status: ${review.status}`,
    "",
    "## Local Metadata",
    "",
    table(
      ["Check", "Status", "Evidence"],
      review.checks.map((entry) => [entry.name, entry.status, entry.evidence])
    ),
    "",
    "## GitHub Metadata",
    "",
    `Expected GitHub repo description: ${review.expectedGithubDescription}`,
    "",
    "Verify current remote visibility and description separately with:",
    "",
    "```sh",
    "gh repo view Atomics-hub/agentfile --json visibility,description",
    "```",
    "",
    "This command does not publish packages, push commits, or change repository visibility.",
    ""
  ].join("\n");
}

function check(name, passed, evidence) {
  return {
    name,
    status: passed ? "pass" : "fail",
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const json = process.argv.includes("--json");
  const review = await reviewLaunchMetadata();

  process.stdout.write(json ? `${JSON.stringify(review, null, 2)}\n` : renderLaunchMetadataReview(review));

  if (review.status !== "pass") {
    process.exitCode = 1;
  }
}
