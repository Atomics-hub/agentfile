#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const maxBuffer = 20 * 1024 * 1024;
const expectedPendingFailure = 'requiredProof[npm-test-auth].status: expected "passed", got "pending"';
const generatedArtifacts = [
  { name: "AGENTS.md", target: "agents-md", outputName: "AGENTS.md" },
  { name: "CLAUDE.md", target: "claude-md", outputName: "CLAUDE.md" },
  { name: "Cursor rule", target: "cursor-mdc", outputName: "agentfile.mdc" },
  { name: "Copilot instructions", target: "copilot-md", outputName: "copilot-instructions.md" }
];

const results = [];
const artifactPreviews = [];
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
    name: "Review machine-readable health",
    command: "node dist/cli.js doctor examples/fix-login-race.agent --format json",
    run: () => execFileAsync("node", ["dist/cli.js", "doctor", "examples/fix-login-race.agent", "--format", "json"], {
      cwd: root,
      env: process.env,
      maxBuffer
    })
  });

  await runStep({
    name: "Inspect generated surfaces",
    command: "node dist/cli.js surfaces examples/fix-login-race.agent",
    run: () => execFileAsync("node", ["dist/cli.js", "surfaces", "examples/fix-login-race.agent"], {
      cwd: root,
      env: process.env,
      maxBuffer
    })
  });

  await runStep({
    name: "Generate all default surfaces",
    command: "node dist/cli.js sync examples/fix-login-race.agent --all --force (cwd <temp>)",
    run: () => syncAllDefaults(false)
  });

  await runStep({
    name: "Check all default surfaces",
    command: "node dist/cli.js sync examples/fix-login-race.agent --all --check (cwd <temp>)",
    run: () => syncAllDefaults(true)
  });

  await runStep({
    name: "Generate AGENTS.md",
    command: "node dist/cli.js sync examples/fix-login-race.agent --target agents-md --output <temp>/AGENTS.md --force",
    run: () => sync(generatedArtifacts[0])
  });

  await runStep({
    name: "Generate CLAUDE.md",
    command: "node dist/cli.js sync examples/fix-login-race.agent --target claude-md --output <temp>/CLAUDE.md --force",
    run: () => sync(generatedArtifacts[1])
  });

  await runStep({
    name: "Generate Cursor rule",
    command: "node dist/cli.js sync examples/fix-login-race.agent --target cursor-mdc --output <temp>/agentfile.mdc --force",
    run: () => sync(generatedArtifacts[2])
  });

  await runStep({
    name: "Generate Copilot instructions",
    command: "node dist/cli.js sync examples/fix-login-race.agent --target copilot-md --output <temp>/copilot-instructions.md --force",
    run: () => sync(generatedArtifacts[3])
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

  artifactPreviews.push(...await collectArtifactPreviews());
} finally {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const failed = results.some((result) => result.status === "fail");
process.stdout.write(renderReport({ failed, artifactPreviews }));

if (failed) {
  process.exitCode = 1;
}

function sync(artifact) {
  return execFileAsync("node", [
    "dist/cli.js",
    "sync",
    "examples/fix-login-race.agent",
    "--target",
    artifact.target,
    "--output",
    join(tempRoot, artifact.outputName),
    "--force"
  ], { cwd: root, env: process.env, maxBuffer });
}

async function syncAllDefaults(check) {
  const cwd = join(tempRoot, "sync-all");
  await mkdir(cwd, { recursive: true });
  return execFileAsync("node", [
    join(root, "dist/cli.js"),
    "sync",
    join(root, "examples/fix-login-race.agent"),
    "--all",
    check ? "--check" : "--force"
  ], { cwd, env: process.env, maxBuffer });
}

async function collectArtifactPreviews() {
  const previews = [];

  for (const artifact of generatedArtifacts) {
    try {
      const content = await readFile(join(tempRoot, artifact.outputName), "utf8");
      previews.push({
        ...artifact,
        excerpt: excerpt(content, 32)
      });
    } catch {
      // Failed generation is already captured in the step table.
    }
  }

  return previews;
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

function renderReport({ failed, artifactPreviews }) {
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
    ...renderDemoEvidence(),
    ...renderArtifactPreviews(artifactPreviews),
    ...results.filter((result) => result.status === "fail").flatMap((result) => [
      `## ${result.name}`,
      "",
      result.detail || "No output.",
      ""
    ]),
    ""
  ].join("\n");
}

function renderDemoEvidence() {
  return [
    "## What This Demonstrates",
    "",
    table(
      ["Visible behavior", "Why it matters"],
      [
        [
          "The `.agent` source validates before any work starts.",
          "Scope, authority, proof, and handoff are reviewable as a contract instead of scattered prose."
        ],
        [
          "The same source generates AGENTS.md, CLAUDE.md, Cursor, and Copilot instruction files.",
          "Existing harnesses can consume the contract without replacing the user's agent stack."
        ],
        [
          "Generated instruction surfaces can be inspected, generated, and checked before handoff.",
          "Reviewers can see which harness projections exist and verify adopted defaults are current."
        ],
        [
          "The same health check can be printed as JSON.",
          "CI and dashboards can consume doctor status without scraping terminal prose."
        ],
        [
          "A filled JSON receipt verifies against the original contract.",
          "Completed work can be audited against the same source that delegated it."
        ],
        [
          "A pending JSON receipt fails on missing required proof.",
          "The receipt loop catches incomplete evidence instead of treating a final answer as enough."
        ]
      ]
    ),
    "",
    "This quick loop does not run a live coding agent or prove broad outcome superiority. It proves the contract-to-instructions-to-receipt mechanics that Phase 1 can honestly launch with.",
    ""
  ];
}

function renderArtifactPreviews(previews) {
  if (previews.length === 0) {
    return [];
  }

  return [
    "## Generated Instruction Excerpts",
    "",
    "The files are rendered in a temporary directory during this run; the excerpts show what each harness receives from the same `.agent` source.",
    "",
    ...previews.flatMap((preview) => [
      `### ${preview.name}`,
      "",
      fence(preview.excerpt),
      ""
    ])
  ];
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

function excerpt(value, lineCount) {
  return String(value).trimEnd().split(/\r?\n/).slice(0, lineCount).join("\n");
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
