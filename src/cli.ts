#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname } from "node:path";
import { Command } from "commander";
import {
  compileAgentfile,
  defaultOutputPathForTarget,
  isSyncTarget,
  type CompileTarget
} from "./compiler.js";
import { AgentfileError } from "./diagnostics.js";
import { parseSource } from "./source.js";

const program = new Command();

program
  .name("agentfile")
  .description("Validate and compile agent-native software task contracts.")
  .version("0.1.0");

program
  .command("init")
  .description("Create a minimal agentfile.yaml.")
  .argument("[file]", "Agentfile path", "agentfile.yaml")
  .action(async (file: string) => {
    await writeFile(file, minimalAgentfile(), { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
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
  .command("compile")
  .description("Compile an Agentfile contract.")
  .argument("[file]", "Agentfile path")
  .option(
    "-t, --target <target>",
    "prompt, json, agents-md, claude-md, cursor-mdc, or copilot-md",
    "prompt"
  )
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
  .option("-t, --target <target>", "agents-md, claude-md, cursor-mdc, or copilot-md", "agents-md")
  .option("-o, --output <file>", "output path")
  .option("-f, --force", "overwrite an existing output file", false)
  .action(async (file: string, options: { target: string; output?: string; force: boolean }) => {
    const target = parseTarget(options.target);
    if (!isSyncTarget(target)) {
      throw new AgentfileError(
        `sync target "${target}" is not file-backed. Expected "agents-md", "claude-md", "cursor-mdc", or "copilot-md".`
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

function parseTarget(value: string): CompileTarget {
  if (
    value === "prompt" ||
    value === "json" ||
    value === "agents-md" ||
    value === "claude-md" ||
    value === "cursor-mdc" ||
    value === "copilot-md"
  ) {
    return value;
  }

  throw new AgentfileError(
    `unknown compile target "${value}". Expected "prompt", "json", "agents-md", "claude-md", "cursor-mdc", or "copilot-md".`
  );
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

function minimalAgentfile(): string {
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
