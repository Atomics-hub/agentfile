#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname } from "node:path";
import { Command } from "commander";
import {
  compileAgentfile,
  compileTargets,
  defaultOutputPathForTarget,
  isSyncTarget,
  type CompileTarget
} from "./compiler.js";
import { AgentfileError, lintAgentfile } from "./diagnostics.js";
import { compileJsonSchema } from "./json-schema.js";
import type { Agentfile } from "./schema.js";
import { parseSource } from "./source.js";
import { findTarget, quotedTargetIds } from "./targets.js";

const program = new Command();

program
  .name("agentfile")
  .description("Validate and compile agent-native software task contracts.")
  .version("0.1.0");

program
  .command("init")
  .description("Create a minimal Agentfile starter in YAML or Pact source form.")
  .argument("[file]", "Agentfile path", "agentfile.yaml")
  .option("-f, --format <format>", "yaml or agent")
  .action(async (file: string, options: { format?: string }) => {
    const format = parseInitFormat(file, options.format);
    await writeFile(file, minimalAgentfile(format), { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
      throw new AgentfileError(error.message, file);
    });
    console.log(`Created ${file}`);
  });

program
  .command("validate")
  .alias("check")
  .description("Validate an Agentfile contract.")
  .argument("[file]", "Agentfile path")
  .action(async (file: string) => {
    const resolved = await resolveFile(file);
    await load(resolved);
    console.log(`OK ${resolved}`);
  });

program
  .command("lint")
  .description("Report non-blocking warnings for risky authority and broad permissions.")
  .argument("[file]", "Agentfile path")
  .action(async (file: string) => {
    const resolved = await resolveFile(file);
    const agentfile = await load(resolved);
    const diagnostics = lintAgentfile(agentfile);

    if (diagnostics.length === 0) {
      console.log(`OK ${resolved} (no lint warnings)`);
      return;
    }

    console.log(`WARN ${resolved}`);
    for (const diagnostic of diagnostics) {
      console.log(`- ${diagnostic.path}: ${diagnostic.message}`);
    }
  });

program
  .command("compile")
  .description("Compile an Agentfile contract.")
  .argument("[file]", "Agentfile path")
  .option("-t, --target <target>", compileTargetHelp(), "prompt")
  .action(async (file: string, options: { target: string }) => {
    const target = parseTarget(options.target);
    const resolved = await resolveFile(file);
    const agentfile = await load(resolved);
    process.stdout.write(compileAgentfile(agentfile, target));
  });

program
  .command("sync")
  .description("Generate an agent instruction file from an Agentfile contract.")
  .argument("[file]", "Agentfile path")
  .option("-t, --target <target>", syncTargetHelp(), "agents-md")
  .option("-o, --output <file>", "output path")
  .option("-f, --force", "overwrite an existing output file", false)
  .action(async (file: string, options: { target: string; output?: string; force: boolean }) => {
    const target = parseTarget(options.target);
    if (!isSyncTarget(target)) {
      throw new AgentfileError(
        `sync target "${target}" is not file-backed. Expected ${syncTargetList()}.`
      );
    }

    const resolved = await resolveFile(file);
    const agentfile = await load(resolved);
    const output = options.output ?? defaultOutputPathForTarget(target);

    if (!options.force && await exists(output)) {
      throw new AgentfileError(`refusing to overwrite ${output}; pass --force to replace it`);
    }

    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, compileAgentfile(agentfile, target), "utf8");
    console.log(`Wrote ${output}`);
  });

program
  .command("targets")
  .description("List compile targets and default sync output paths.")
  .action(() => {
    for (const target of compileTargets) {
      const output = target.fileBacked ? ` -> ${target.defaultOutputPath}` : "";
      console.log(`${target.id}${output}`);
      console.log(`  ${target.description}`);
    }
  });

program
  .command("schema")
  .description("Print the JSON Schema for strict Agentfile contract IR.")
  .action(() => {
    process.stdout.write(compileJsonSchema());
  });

program
  .command("explain")
  .description("Print a short human summary of an Agentfile contract.")
  .argument("[file]", "Agentfile path")
  .action(async (file: string) => {
    const resolved = await resolveFile(file);
    const agentfile = await load(resolved);
    console.log(`${agentfile.task.id}`);
    if (agentfile.info.summary) {
      console.log(agentfile.info.summary);
    }
    console.log("");
    console.log(`Goal: ${agentfile.task.goal}`);
    console.log(`Included paths: ${agentfile.scope.include.join(", ")}`);
    console.log(`Allowed commands: ${agentfile.permissions.shell.allow.length}`);
    console.log(`Network: ${agentfile.permissions.network.default}`);
    if (agentfile.permissions.network.allow.length > 0) {
      console.log(`Network allowlist: ${agentfile.permissions.network.allow.join(", ")}`);
    }
    console.log(`Secrets: ${agentfile.permissions.secrets.access}`);
    console.log(`Checks: ${agentfile.checks.length}`);
  });

program
  .command("receipt")
  .description("Print a receipt checklist for auditing an agent run against a contract.")
  .argument("[file]", "Agentfile path")
  .action(async (file: string) => {
    const resolved = await resolveFile(file);
    const agentfile = await load(resolved);
    process.stdout.write(renderReceiptChecklist(agentfile, resolved));
  });

program.parseAsync().catch((error: unknown) => {
  if (error instanceof AgentfileError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  throw error;
});

async function load(filePath: string) {
  const source = await readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    throw new AgentfileError(error.message, filePath);
  });

  return parseSource(source, filePath);
}

function renderReceiptChecklist(agentfile: Agentfile, contractPath: string): string {
  const lines = [
    "# Agentfile Receipt Checklist",
    "",
    `Contract: \`${contractPath}\``,
    `Task: \`${agentfile.task.id}\``,
    `Goal: ${agentfile.task.goal}`,
    "",
    "Use this after a harness run to tie the agent's work back to the contract.",
    "",
    "## Scope",
    "",
    `- Included paths: ${listOrNone(agentfile.scope.include)}`,
    `- Excluded paths: ${listOrNone(agentfile.scope.exclude)}`,
    `- Filesystem read: ${listOrNone(agentfile.permissions.filesystem.read)}`,
    `- Filesystem write: ${listOrNone(agentfile.permissions.filesystem.write)}`,
    `- Filesystem denied: ${listOrNone(agentfile.permissions.filesystem.deny)}`,
    "",
    "## Authority",
    "",
    `- Allowed shell commands: ${listCommandsOrNone(agentfile.permissions.shell.allow)}`,
    `- Denied shell commands: ${listCommandsOrNone(agentfile.permissions.shell.deny)}`,
    `- Network: ${agentfile.permissions.network.default}${agentfile.permissions.network.allow.length > 0 ? `; allow ${agentfile.permissions.network.allow.join(", ")}` : ""}`,
    `- Secrets: ${agentfile.permissions.secrets.access}${agentfile.permissions.secrets.allow.length > 0 ? `; allow ${agentfile.permissions.secrets.allow.join(", ")}` : ""}`,
    `- Approvals required: ${listOrNone(agentfile.permissions.approvals.requiredFor)}`,
    "",
    "## Required Proof",
    ""
  ];

  if (agentfile.checks.length === 0) {
    lines.push("- [ ] Record the proof performed for this run.");
  } else {
    for (const check of agentfile.checks) {
      const requirement = check.required ? "required" : "optional";
      if (check.command) {
        lines.push(`- [ ] Run \`${check.command}\` (${requirement}).`);
      } else if (check.description) {
        lines.push(`- [ ] Confirm ${check.description} (${requirement}).`);
      }
    }
  }

  if (agentfile.workflow.acceptance.length > 0) {
    lines.push("", "## Acceptance Evidence", "");
    for (const item of agentfile.workflow.acceptance) {
      lines.push(`- [ ] ${item}`);
    }
  }

  const reviewText = agentfile.workflow.review.join("\n").toLowerCase();
  const reviewListsChangedFiles = reviewText.includes("changed file");
  const reviewNotesRisks = reviewText.includes("risk");

  lines.push(
    "",
    "## Handoff Evidence",
    "",
    "- [ ] Attach or link the transcript/tool log.",
    "- [ ] Attach or link the patch diff.",
    "- [ ] Attach or link the check log."
  );

  if (!reviewListsChangedFiles) {
    lines.push("- [ ] List changed files.");
  }

  lines.push(reviewNotesRisks
    ? "- [ ] Note skipped checks, approvals, and policy limits."
    : "- [ ] Note risks, skipped checks, approvals, and policy limits."
  );

  if (agentfile.workflow.review.length > 0) {
    for (const item of agentfile.workflow.review) {
      lines.push(`- [ ] ${item}`);
    }
  }

  lines.push(
    "",
    "## Receipt Fields",
    "",
    "- Contract source used",
    "- Generated instruction surface used, if any",
    "- Agent, model, and harness",
    "- Started and ended timestamps",
    "- Verification commands run",
    "- Scope adherence notes",
    "- Final handoff summary",
    ""
  );

  return lines.join("\n");
}

function listOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function listCommandsOrNone(values: string[]): string {
  return values.length > 0 ? values.map((value) => `\`${value}\``).join(", ") : "none";
}

function parseTarget(value: string): CompileTarget {
  const target = findTarget(compileTargets, value);
  if (target) {
    return target.id;
  }

  throw new AgentfileError(`unknown compile target "${value}". Expected ${quotedTargetIds(compileTargets)}.`);
}

function compileTargetHelp(): string {
  return compileTargets.map((target) => target.id).join(", ");
}

function syncTargets() {
  return compileTargets.filter((target) => target.fileBacked);
}

function syncTargetHelp(): string {
  return syncTargets().map((target) => target.id).join(", ");
}

function syncTargetList(): string {
  return quotedTargetIds(syncTargets());
}

type InitFormat = "yaml" | "agent";

function parseInitFormat(filePath: string, value?: string): InitFormat {
  if (value === undefined) {
    return filePath.endsWith(".agent") ? "agent" : "yaml";
  }

  if (value === "yaml" || value === "agent") {
    return value;
  }

  throw new AgentfileError(`unknown init format "${value}". Expected "yaml" or "agent".`);
}

async function resolveFile(filePath?: string): Promise<string> {
  if (filePath) {
    return filePath;
  }

  for (const candidate of [
    "agentfile.yaml",
    "agentfile.json",
    ".agent/agentfile.yaml",
    "agentfile.agent",
    ".agent/agentfile.agent",
    ".agent/agentfile.json",
    "Agentfile"
  ]) {
    if (await exists(candidate)) {
      return candidate;
    }
  }

  throw new AgentfileError(
    "no Agentfile found. Tried agentfile.yaml, agentfile.json, .agent/agentfile.yaml, agentfile.agent, .agent/agentfile.agent, .agent/agentfile.json, Agentfile"
  );
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath, constants.F_OK)
    .then(() => true)
    .catch(() => false);
}

function minimalAgentfile(format: InitFormat): string {
  if (format === "agent") {
    return `mission my-agent-task {
  goal "State the concrete outcome the agent should produce"
  summary "Describe the work this agent may perform"

  read src/**, tests/**
  write src/**, tests/**
  never node_modules/**, dist/**

  can run "npm test"
  cannot use network
  cannot read secrets
  ask approval for dependency_change, network_access, scope_expansion

  should "Make the smallest coherent change that satisfies the task."

  prove {
    run "npm test"
    expect "Required checks pass"
    expect "Changes are summarized for review"
  }
}
`;
  }

  return `agentfile: "0.1.0"
kind: TaskContract

info:
  title: my-agent-task
  version: "0.1.0"
  summary: Describe the work this agent may perform.

task:
  id: my-agent-task
  goal: State the concrete outcome the agent should produce.

scope:
  include:
    - src/**
    - tests/**
  exclude:
    - node_modules/**
    - dist/**

permissions:
  shell:
    allow:
      - npm test
  network:
    default: deny
  secrets:
    access: deny
  approvals:
    requiredFor:
      - dependency_change
      - network_access
      - scope_expansion

policies:
  - id: smallest-safe-change
    level: should
    statement: Make the smallest coherent change that satisfies the task.

checks:
  - id: test
    command: npm test
    required: true

workflow:
  id: implement
  acceptance:
    - Required checks pass.
    - Changes are summarized for review.
`;
}
