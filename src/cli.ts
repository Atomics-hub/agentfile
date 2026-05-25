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
import { diffContracts, renderContractDiff, type ContractDiffFormat } from "./diff.js";
import { compileJsonSchema } from "./json-schema.js";
import { parseReceiptFormat, renderReceipt, verifyReceipt } from "./receipt.js";
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
  .command("doctor")
  .description("Check contract validity, lint posture, and generated instruction freshness.")
  .argument("[file]", "Agentfile path")
  .action(async (file: string) => {
    const result = await runDoctor(file);
    process.stdout.write(renderDoctorReport(result));

    if (result.surfaces.some((surface) => surface.status === "stale")) {
      process.exitCode = 1;
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
  .option("--check", "verify the generated output is already up to date without writing", false)
  .action(async (file: string, options: { target: string; output?: string; force: boolean; check: boolean }) => {
    const target = parseTarget(options.target);
    if (!isSyncTarget(target)) {
      throw new AgentfileError(
        `sync target "${target}" is not file-backed. Expected ${syncTargetList()}.`
      );
    }

    const resolved = await resolveFile(file);
    const agentfile = await load(resolved);
    const output = options.output ?? defaultOutputPathForTarget(target);
    const generated = compileAgentfile(agentfile, target);

    if (options.check) {
      const current = await readFile(output, "utf8").catch(() => {
        throw new AgentfileError(`generated output is missing: ${output}`, output);
      });

      if (current !== generated) {
        throw new AgentfileError(
          `generated output is stale: ${output}; run agentfile sync ${resolved} --target ${target} --output ${output} --force to update it`,
          output
        );
      }

      console.log(`OK ${output} is up to date`);
      return;
    }

    if (!options.force && await exists(output)) {
      throw new AgentfileError(`refusing to overwrite ${output}; pass --force to replace it`);
    }

    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, generated, "utf8");
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
  .command("diff")
  .description("Compare two Agentfile contracts after parsing and normalization.")
  .argument("<before>", "base Agentfile contract path")
  .argument("<after>", "changed Agentfile contract path")
  .option("--format <format>", "text or json", "text")
  .action(async (beforePath: string, afterPath: string, options: { format: string }) => {
    const format = parseDiffFormat(options.format);
    const before = await load(beforePath);
    const after = await load(afterPath);
    process.stdout.write(renderContractDiff(diffContracts(before, after), format));
  });

const receiptCommand = program
  .command("receipt")
  .description("Print a receipt checklist for auditing an agent run against a contract.")
  .argument("[file]", "Agentfile path")
  .option("--format <format>", "markdown or json", "markdown")
  .option("-o, --output <file>", "write the receipt artifact to a file")
  .option("--force", "overwrite an existing output file", false)
  .action(async (file: string, options: { format: string; output?: string; force: boolean }) => {
    const resolved = await resolveFile(file);
    const agentfile = await load(resolved);
    const format = parseReceiptFormat(options.format);
    const receipt = renderReceipt(agentfile, resolved, format);

    if (options.output) {
      if (!options.force && await exists(options.output)) {
        throw new AgentfileError(`refusing to overwrite ${options.output}; pass --force to replace it`);
      }

      await mkdir(dirname(options.output), { recursive: true });
      await writeFile(options.output, receipt, "utf8");
      console.log(`Wrote ${options.output}`);
      return;
    }

    process.stdout.write(receipt);
  });

receiptCommand
  .command("verify")
  .description("Verify a filled JSON receipt against its Agentfile contract.")
  .argument("<contract>", "Agentfile contract path")
  .argument("<receipt>", "JSON receipt path")
  .action(async (contract: string, receiptPath: string) => {
    const agentfile = await load(contract);
    const receipt = await loadReceipt(receiptPath);
    const issues = verifyReceipt(agentfile, receipt);

    if (issues.length > 0) {
      throw new AgentfileError(
        `receipt verification failed\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
        receiptPath
      );
    }

    console.log(`OK ${receiptPath} satisfies ${contract}`);
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

async function loadReceipt(filePath: string): Promise<unknown> {
  const source = await readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    throw new AgentfileError(error.message, filePath);
  });

  try {
    return JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AgentfileError(`invalid receipt JSON: ${message}`, filePath);
  }
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

interface DoctorSurface {
  target: CompileTarget;
  outputPath: string;
  status: "missing" | "stale" | "up-to-date";
}

interface DoctorResult {
  contractPath: string;
  lintDiagnostics: ReturnType<typeof lintAgentfile>;
  surfaces: DoctorSurface[];
}

async function runDoctor(file?: string): Promise<DoctorResult> {
  const contractPath = await resolveFile(file);
  const agentfile = await load(contractPath);
  const lintDiagnostics = lintAgentfile(agentfile);
  const surfaces = await inspectGeneratedSurfaces(agentfile);

  return {
    contractPath,
    lintDiagnostics,
    surfaces
  };
}

async function inspectGeneratedSurfaces(agentfile: Agentfile): Promise<DoctorSurface[]> {
  const surfaces: DoctorSurface[] = [];

  for (const definition of syncTargets()) {
    const target = definition.id;
    if (!isSyncTarget(target)) {
      continue;
    }

    const outputPath = defaultOutputPathForTarget(target);
    const generated = compileAgentfile(agentfile, target);
    const current = await readOptionalFile(outputPath);
    const status = current === undefined
      ? "missing"
      : current === generated
        ? "up-to-date"
        : "stale";

    surfaces.push({
      target,
      outputPath,
      status
    });
  }

  return surfaces;
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  return readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return undefined;
    }

    throw new AgentfileError(error.message, filePath);
  });
}

function renderDoctorReport(result: DoctorResult): string {
  const staleSurfaces = result.surfaces.filter((surface) => surface.status === "stale");
  const lines = [
    "Agentfile Doctor",
    `Contract: OK ${result.contractPath}`,
    `Lint warnings: ${result.lintDiagnostics.length}`
  ];

  for (const diagnostic of result.lintDiagnostics) {
    lines.push(`- ${diagnostic.path}: ${diagnostic.message}`);
  }

  lines.push("Generated surfaces:");
  for (const surface of result.surfaces) {
    lines.push(`- ${surface.outputPath} [${surface.target}]: ${doctorSurfaceLabel(surface.status)}`);
  }

  lines.push(`Status: ${staleSurfaces.length > 0 ? "fail" : "pass"}`);

  if (staleSurfaces.length > 0) {
    lines.push("Next steps:");
    for (const surface of staleSurfaces) {
      lines.push(
        `- Run agentfile sync ${result.contractPath} --target ${surface.target} --output ${surface.outputPath} --force`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function doctorSurfaceLabel(status: DoctorSurface["status"]): string {
  if (status === "missing") {
    return "not found";
  }

  if (status === "up-to-date") {
    return "up to date";
  }

  return status;
}

function parseDiffFormat(value: string): ContractDiffFormat {
  if (value === "text" || value === "json") {
    return value;
  }

  throw new AgentfileError(`unknown diff format "${value}". Expected "text" or "json".`);
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
