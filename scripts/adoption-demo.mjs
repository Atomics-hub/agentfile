#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const maxBuffer = 20 * 1024 * 1024;
const keep = process.argv.includes("--keep");
const results = [];
let tempRoot;
let repo;

try {
  tempRoot = await mkdtemp(join(tmpdir(), "agentfile-adoption-demo-"));
  repo = join(tempRoot, "existing-node-service");

  await runStep({
    name: "Build Agentfile CLI",
    command: "npm run build",
    run: () => execFileAsync("npm", ["run", "build"], { cwd: root, env: process.env, maxBuffer })
  });

  await runStep({
    name: "Create existing project",
    command: "write small Node service fixture",
    run: () => createExistingProject()
  });

  await runStep({
    name: "Adopt Agentfile",
    command: "node dist/cli.js adopt (cwd existing repo)",
    run: () => execFileAsync("node", [join(root, "dist/cli.js"), "adopt"], {
      cwd: repo,
      env: process.env,
      maxBuffer
    })
  });

  await runStep({
    name: "Replace starter contract with task contract",
    command: "write realistic agentfile.agent",
    run: () => writeTaskContract()
  });

  await runStep({
    name: "Refresh generated instruction surfaces",
    command: "node dist/cli.js sync agentfile.agent --all --force",
    run: () => execFileAsync("node", [join(root, "dist/cli.js"), "sync", "agentfile.agent", "--all", "--force"], {
      cwd: repo,
      env: process.env,
      maxBuffer
    })
  });

  await runStep({
    name: "Refresh CI workflow",
    command: "node dist/cli.js github-actions agentfile.agent --surfaces agents-md,claude-md,cursor-mdc,copilot-md --receipt receipts/latest.receipt.json --run-checks --output .github/workflows/agentfile.yml --force",
    run: () => execFileAsync("node", [
      join(root, "dist/cli.js"),
      "github-actions",
      "agentfile.agent",
      "--surfaces",
      "agents-md,claude-md,cursor-mdc,copilot-md",
      "--receipt",
      "receipts/latest.receipt.json",
      "--run-checks",
      "--output",
      ".github/workflows/agentfile.yml",
      "--force"
    ], {
      cwd: repo,
      env: process.env,
      maxBuffer
    })
  });

  await runStep({
    name: "Inspect adopted project",
    command: "node dist/cli.js inspect agentfile.agent --strict --format json",
    run: () => execFileAsync("node", [join(root, "dist/cli.js"), "inspect", "agentfile.agent", "--strict", "--format", "json"], {
      cwd: repo,
      env: process.env,
      maxBuffer
    })
  });

  await runStep({
    name: "Run project checks",
    command: "node dist/cli.js checks run agentfile.agent --log logs/checks.txt --results logs/check-results.json",
    run: () => execFileAsync("node", [
      join(root, "dist/cli.js"),
      "checks",
      "run",
      "agentfile.agent",
      "--log",
      "logs/checks.txt",
      "--results",
      "logs/check-results.json"
    ], {
      cwd: repo,
      env: process.env,
      maxBuffer
    })
  });

  await runStep({
    name: "Write check-results schema",
    command: "node dist/cli.js receipt check-results-schema --output schemas/receipt-check-results.schema.json",
    run: () => execFileAsync("node", [
      join(root, "dist/cli.js"),
      "receipt",
      "check-results-schema",
      "--output",
      "schemas/receipt-check-results.schema.json"
    ], {
      cwd: repo,
      env: process.env,
      maxBuffer
    })
  });

  await runStep({
    name: "Check check-results schema",
    command: "node dist/cli.js receipt check-results-schema --output schemas/receipt-check-results.schema.json --check",
    run: () => execFileAsync("node", [
      join(root, "dist/cli.js"),
      "receipt",
      "check-results-schema",
      "--output",
      "schemas/receipt-check-results.schema.json",
      "--check"
    ], {
      cwd: repo,
      env: process.env,
      maxBuffer
    })
  });

  await runStep({
    name: "Create receipt template",
    command: "node dist/cli.js receipt init agentfile.agent --force",
    run: () => execFileAsync("node", [join(root, "dist/cli.js"), "receipt", "init", "agentfile.agent", "--force"], {
      cwd: repo,
      env: process.env,
      maxBuffer
    })
  });

  await runStep({
    name: "Fill proof from structured check results",
    command: "node dist/cli.js receipt fill agentfile.agent receipts/latest.receipt.json --check-results logs/check-results.json --write",
    run: () => execFileAsync("node", [
      join(root, "dist/cli.js"),
      "receipt",
      "fill",
      "agentfile.agent",
      "receipts/latest.receipt.json",
      "--check-results",
      "logs/check-results.json",
      "--write"
    ], {
      cwd: repo,
      env: process.env,
      maxBuffer
    })
  });

  await runStep({
    name: "Attach acceptance and handoff evidence",
    command: "node dist/cli.js receipt evidence agentfile.agent receipts/latest.receipt.json --evidence-file logs/receipt-evidence.json --write",
    run: () => completeReceiptEvidence()
  });

  await runStep({
    name: "Review receipt",
    command: "node dist/cli.js receipt review agentfile.agent receipts/latest.receipt.json",
    run: () => execFileAsync("node", [
      join(root, "dist/cli.js"),
      "receipt",
      "review",
      "agentfile.agent",
      "receipts/latest.receipt.json"
    ], {
      cwd: repo,
      env: process.env,
      maxBuffer
    })
  });

  await runStep({
    name: "Verify receipt",
    command: "node dist/cli.js receipt verify agentfile.agent receipts/latest.receipt.json",
    run: () => execFileAsync("node", [
      join(root, "dist/cli.js"),
      "receipt",
      "verify",
      "agentfile.agent",
      "receipts/latest.receipt.json"
    ], {
      cwd: repo,
      env: process.env,
      maxBuffer
    })
  });
} finally {
  if (tempRoot && !keep) {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const failed = results.some((result) => result.status === "fail");
process.stdout.write(renderReport(failed));

if (failed) {
  process.exitCode = 1;
}

async function createExistingProject() {
  await mkdir(join(repo, "src"), { recursive: true });
  await mkdir(join(repo, "tests"), { recursive: true });
  await mkdir(join(repo, "scripts"), { recursive: true });
  await mkdir(join(repo, "logs"), { recursive: true });

  await writeFile(join(repo, "package.json"), `${JSON.stringify({
    type: "module",
    private: true,
    scripts: {
      test: "node tests/title-slug.test.mjs",
      lint: "node scripts/lint.mjs"
    }
  }, null, 2)}\n`, "utf8");

  await writeFile(join(repo, "src", "title-slug.js"), [
    "export function titleSlug(input) {",
    "  return input",
    "    .trim()",
    "    .toLowerCase()",
    "    .normalize(\"NFKD\")",
    "    .replace(/[\\u0300-\\u036f]/g, \"\")",
    "    .replace(/[^a-z0-9]+/g, \"-\")",
    "    .replace(/^-+|-+$/g, \"\");",
    "}",
    ""
  ].join("\n"), "utf8");

  await writeFile(join(repo, "tests", "title-slug.test.mjs"), [
    "import assert from \"node:assert/strict\";",
    "import { titleSlug } from \"../src/title-slug.js\";",
    "",
    "assert.equal(titleSlug(\" Launch Readiness Review \"), \"launch-readiness-review\");",
    "assert.equal(titleSlug(\"API & CLI: v2\"), \"api-cli-v2\");",
    "assert.equal(titleSlug(\"Cafe deja vu\"), \"cafe-deja-vu\");",
    "console.log(\"title-slug tests passed\");",
    ""
  ].join("\n"), "utf8");

  await writeFile(join(repo, "scripts", "lint.mjs"), [
    "import { readFile } from \"node:fs/promises\";",
    "",
    "const source = await readFile(\"src/title-slug.js\", \"utf8\");",
    "if (!source.includes(\"normalize(\\\"NFKD\\\")\")) {",
    "  throw new Error(\"titleSlug must normalize unicode input before slugging\");",
    "}",
    "if (!source.includes(\"/[^a-z0-9]+/g\")) {",
    "  throw new Error(\"titleSlug must collapse non-url-safe runs\");",
    "}",
    "console.log(\"lint passed\");",
    ""
  ].join("\n"), "utf8");
}

async function writeTaskContract() {
  await writeFile(join(repo, "agentfile.agent"), [
    "mission normalize-title-slugs {",
    "  goal \"Keep generated title slugs stable and URL-safe\"",
    "  version \"0.1.0\"",
    "  license \"MIT\"",
    "  summary \"Adopt Agentfile in a small existing Node service\"",
    "  background \"The service exposes title slugs that must remain deterministic across docs and UI routes\"",
    "  owner \"docs-platform\"",
    "  label \"adoption-demo\"",
    "",
    "  touch src/**, tests/**, scripts/**",
    "  never node_modules/**, dist/**",
    "",
    "  cannot use network",
    "  cannot read secrets",
    "  cannot add dependency",
    "  ask approval for dependency_change, network_access, scope_expansion",
    "  must preserve \"Public titleSlug API\"",
    "  must_not leak \"Repository secrets\"",
    "",
    "  plan {",
    "    step \"Inspect the existing titleSlug behavior\"",
    "    step \"Confirm URL-safe punctuation and whitespace handling\"",
    "    step \"Record check evidence before handoff\"",
    "  }",
    "",
    "  prove {",
    "    run \"npm test\"",
    "    run \"npm run lint\"",
    "    expect \"Slug output is lowercase and dash-separated\"",
    "    expect \"Punctuation and whitespace collapse into one dash\"",
    "  }",
    "",
    "  handoff {",
    "    explain \"adoption files generated\"",
    "    explain \"receipt evidence recorded\"",
    "    list changed_files",
    "    note \"risks\"",
    "  }",
    "}",
    ""
  ].join("\n"), "utf8");
}

async function completeReceiptEvidence() {
  const receiptPath = join(repo, "receipts", "latest.receipt.json");
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  const evidencePath = join(repo, "logs", "receipt-evidence.json");
  const evidence = {
    generatedInstructionSurfaceUsed: "AGENTS.md",
    acceptance: receipt.acceptanceEvidence.map((_, index) => ({
      selector: index + 1,
      evidence: "tests/title-slug.test.mjs"
    })),
    handoff: receipt.handoffEvidence.map((entry, index) => ({
      selector: index + 1,
      evidence: evidenceForHandoff(entry.item)
    }))
  };

  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  const evidenceArgs = [
    join(root, "dist/cli.js"),
    "receipt",
    "evidence",
    "agentfile.agent",
    "receipts/latest.receipt.json",
    "--evidence-file",
    "logs/receipt-evidence.json",
    "--write"
  ];

  return execFileAsync("node", evidenceArgs, {
    cwd: repo,
    env: process.env,
    maxBuffer
  });
}

function evidenceForHandoff(item) {
  const lower = item.toLowerCase();
  if (lower.includes("transcript") || lower.includes("tool log") || lower.includes("check log")) {
    return "logs/checks.txt";
  }
  if (lower.includes("patch diff") || lower.includes("changed files")) {
    return ["agentfile.agent", "AGENTS.md", "CLAUDE.md", ".cursor/rules/agentfile.mdc", ".github/copilot-instructions.md"];
  }
  if (lower.includes("risk") || lower.includes("approval") || lower.includes("policy")) {
    return "No skipped checks, approvals, or policy limit changes in this local adoption demo.";
  }
  return "Recorded in adoption demo receipt.";
}

async function runStep(step) {
  const started = Date.now();

  try {
    const result = await step.run();
    const stdout = result?.stdout ?? "";
    const stderr = result?.stderr ?? "";
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
  }
}

function renderReport(failed) {
  return [
    "# Agentfile Existing-Repo Adoption Demo",
    "",
    `Status: ${failed ? "blocked" : "pass"}`,
    keep && tempRoot ? `Kept workspace: ${repo}` : "Workspace: temporary directory removed",
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
    "## What This Demonstrates",
    "",
    "- `agentfile adopt` can be run inside an existing project without hand-writing editor, harness, or CI surfaces.",
    "- Generated instruction surfaces can be refreshed and drift-checked from the same `.agent` contract.",
    "- Generated GitHub Actions workflows can include receipt-ready check runs when a project is ready to execute contract checks in CI.",
    "- Structured check-result JSON has a generated schema surface that wrappers can write and drift-check before filling receipts.",
    "- `agentfile checks run` can execute command-backed proof checks and feed structured results into `receipt fill --check-results`.",
    "- `agentfile receipt evidence --evidence-file` can attach explicit acceptance and handoff evidence from a structured artifact.",
    "- The demo uses a local Node fixture and does not run a live coding agent or publish a package.",
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

function summarizeOutput(stdout, stderr) {
  const output = [stdout, stderr].filter(Boolean).join("\n").trim();
  if (!output) {
    return "No output.";
  }

  return fence(tail(output, 40));
}

function tail(value, lineCount) {
  const lines = String(value).split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - lineCount)).join("\n");
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`)
  ].join("\n");
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
