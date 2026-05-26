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
import {
  parseReceiptFormat,
  receiptHandoffEvidence,
  renderReceipt,
  renderReceiptReview,
  reviewReceipt,
  verifyReceipt
} from "./receipt.js";
import type { Agentfile } from "./schema.js";
import { looksLikePactSource, parseSource } from "./source.js";
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
  .option("--format <format>", "text or json", "text")
  .action(async (file: string, options: { format: string }) => {
    const result = await runDoctor(file);
    process.stdout.write(renderDoctorReport(result, parseDoctorFormat(options.format)));

    if (result.status === "fail") {
      process.exitCode = 1;
    }
  });

program
  .command("surfaces")
  .description("Inspect generated instruction surfaces without writing files.")
  .argument("[file]", "Agentfile path")
  .option("--format <format>", "text or json", "text")
  .action(async (file: string, options: { format: string }) => {
    const result = await runSurfaceInspection(file);
    process.stdout.write(renderSurfaceInspection(result, parseSurfacesFormat(options.format)));
  });

program
  .command("inspect")
  .description("Summarize contract, health, generated surfaces, and receipt readiness.")
  .argument("[file]", "Agentfile path")
  .option("--format <format>", "text or json", "text")
  .action(async (file: string, options: { format: string }) => {
    const result = await runInspect(file);
    process.stdout.write(renderInspectReport(result, parseInspectFormat(options.format)));

    if (result.status === "fail") {
      process.exitCode = 1;
    }
  });

program
  .command("format")
  .description("Print, write, or check canonical Pact .agent source formatting.")
  .argument("[file]", "Agentfile path")
  .option("--check", "verify the source is already formatted without writing", false)
  .option("-w, --write", "write formatted Pact source back to the .agent file", false)
  .action(async (file: string, options: { check: boolean; write: boolean }) => {
    const result = await runFormat(file, options);

    if (result.status === "printed") {
      process.stdout.write(result.formatted);
      return;
    }

    if (result.status === "checked") {
      console.log(`OK ${result.filePath} is formatted`);
      return;
    }

    if (result.status === "unchanged") {
      console.log(`OK ${result.filePath} is formatted`);
      return;
    }

    console.log(`Wrote ${result.filePath}`);
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
  .option("-t, --target <target>", syncTargetHelp())
  .option("-o, --output <file>", "output path")
  .option("-f, --force", "overwrite an existing output file", false)
  .option("--check", "verify the generated output is already up to date without writing", false)
  .option("--all", "generate or check all default file-backed instruction surfaces", false)
  .action(async (file: string, options: SyncCommandOptions) => {
    for (const message of await runSync(file, options)) {
      console.log(message);
    }
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

receiptCommand
  .command("review")
  .description("Print a human review summary for a filled JSON receipt.")
  .argument("<contract>", "Agentfile contract path")
  .argument("<receipt>", "JSON receipt path")
  .action(async (contract: string, receiptPath: string) => {
    const agentfile = await load(contract);
    const receipt = await loadReceipt(receiptPath);
    const review = reviewReceipt(agentfile, receipt, receiptPath);

    process.stdout.write(renderReceiptReview(review));

    if (review.status === "fail") {
      process.exitCode = 1;
    }
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
  description: string;
  outputPath: string;
  status: "missing" | "stale" | "up-to-date";
  lineCount: number;
  byteCount: number;
}

interface DoctorResult {
  contractPath: string;
  status: "pass" | "fail";
  lintDiagnostics: ReturnType<typeof lintAgentfile>;
  surfaces: DoctorSurface[];
  nextSteps: string[];
}

interface SurfaceInspectionResult {
  contractPath: string;
  surfaces: DoctorSurface[];
}

interface InspectResult {
  contractPath: string;
  status: "pass" | "fail";
  task: {
    id: string;
    goal: string;
    summary?: string;
    owners: string[];
    labels: string[];
  };
  scope: {
    includeCount: number;
    excludeCount: number;
    filesystemReadCount: number;
    filesystemWriteCount: number;
  };
  authority: {
    shellAllowCount: number;
    shellDenyCount: number;
    networkDefault: string;
    networkAllowCount: number;
    secretsAccess: string;
    secretAllowCount: number;
    approvalGates: string[];
  };
  workflow: {
    stepCount: number;
    checkCount: number;
    requiredCheckCount: number;
    commandCheckCount: number;
    acceptanceCount: number;
    handoffEvidenceCount: number;
  };
  doctor: DoctorResult;
}

interface SyncCommandOptions {
  target?: string;
  output?: string;
  force: boolean;
  check: boolean;
  all: boolean;
}

interface SyncPlanItem {
  target: CompileTarget;
  outputPath: string;
  generated: string;
}

type FormatResult =
  | { status: "printed"; formatted: string }
  | { status: "checked"; filePath: string }
  | { status: "unchanged"; filePath: string }
  | { status: "written"; filePath: string };

async function runSync(file: string | undefined, options: SyncCommandOptions): Promise<string[]> {
  if (options.all && options.output) {
    throw new AgentfileError("sync --all cannot use --output because each target has its own default path");
  }

  if (options.all && options.target) {
    throw new AgentfileError("sync --all cannot use --target; omit --all to sync one target");
  }

  const resolved = await resolveFile(file);
  const agentfile = await load(resolved);
  const plan = options.all
    ? buildAllSyncPlan(agentfile)
    : [buildSingleSyncPlanItem(agentfile, options.target ?? "agents-md", options.output)];

  if (options.check) {
    return checkSyncPlan(resolved, plan, options.all);
  }

  if (!options.force) {
    await assertSyncPlanCanWrite(plan, options.all);
  }

  for (const item of plan) {
    await mkdir(dirname(item.outputPath), { recursive: true });
    await writeFile(item.outputPath, item.generated, "utf8");
  }

  return plan.map((item) => options.all ? `Wrote ${item.outputPath} [${item.target}]` : `Wrote ${item.outputPath}`);
}

function buildSingleSyncPlanItem(agentfile: Agentfile, targetValue: string, outputPath?: string): SyncPlanItem {
  const target = parseTarget(targetValue);
  if (!isSyncTarget(target)) {
    throw new AgentfileError(
      `sync target "${target}" is not file-backed. Expected ${syncTargetList()}.`
    );
  }

  return {
    target,
    outputPath: outputPath ?? defaultOutputPathForTarget(target),
    generated: compileAgentfile(agentfile, target)
  };
}

function buildAllSyncPlan(agentfile: Agentfile): SyncPlanItem[] {
  return syncTargets().map((definition) => {
    const target = definition.id;
    if (!isSyncTarget(target)) {
      throw new AgentfileError(`sync target "${target}" is not file-backed. Expected ${syncTargetList()}.`);
    }

    return {
      target,
      outputPath: defaultOutputPathForTarget(target),
      generated: compileAgentfile(agentfile, target)
    };
  });
}

async function checkSyncPlan(resolved: string, plan: SyncPlanItem[], all: boolean): Promise<string[]> {
  const missing: SyncPlanItem[] = [];
  const stale: SyncPlanItem[] = [];
  const messages: string[] = [];

  for (const item of plan) {
    const current = await readOptionalFile(item.outputPath);
    if (current === undefined) {
      missing.push(item);
      continue;
    }

    if (current !== item.generated) {
      stale.push(item);
      continue;
    }

    messages.push(all ? `OK ${item.outputPath} [${item.target}] is up to date` : `OK ${item.outputPath} is up to date`);
  }

  if (!all && missing.length > 0) {
    throw new AgentfileError(`generated output is missing: ${missing[0].outputPath}`, missing[0].outputPath);
  }

  if (!all && stale.length > 0) {
    throw new AgentfileError(
      `generated output is stale: ${stale[0].outputPath}; run agentfile sync ${resolved} --target ${stale[0].target} --output ${stale[0].outputPath} --force to update it`,
      stale[0].outputPath
    );
  }

  if (missing.length > 0 || stale.length > 0) {
    throw new AgentfileError([
      "generated outputs are not up to date",
      ...missing.map((item) => `- missing ${item.outputPath} [${item.target}]`),
      ...stale.map((item) => `- stale ${item.outputPath} [${item.target}]`),
      `Run agentfile sync ${resolved} --all --force to update default generated surfaces.`
    ].join("\n"));
  }

  return messages;
}

async function assertSyncPlanCanWrite(plan: SyncPlanItem[], all: boolean): Promise<void> {
  const conflicts: SyncPlanItem[] = [];
  for (const item of plan) {
    if (await exists(item.outputPath)) {
      conflicts.push(item);
    }
  }

  if (conflicts.length === 0) {
    return;
  }

  if (!all) {
    throw new AgentfileError(`refusing to overwrite ${conflicts[0].outputPath}; pass --force to replace it`);
  }

  throw new AgentfileError([
    "refusing to overwrite generated outputs:",
    ...conflicts.map((item) => `- ${item.outputPath} [${item.target}]`),
    "Pass --force to replace them."
  ].join("\n"));
}

async function runFormat(
  file: string | undefined,
  options: { check: boolean; write: boolean }
): Promise<FormatResult> {
  if (options.check && options.write) {
    throw new AgentfileError("format cannot use --check and --write together");
  }

  const filePath = await resolveFile(file);
  const source = await readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    throw new AgentfileError(error.message, filePath);
  });
  const isPactSource = filePath.endsWith(".agent") || looksLikePactSource(source);

  if ((options.check || options.write) && !isPactSource) {
    throw new AgentfileError(
      `format ${options.check ? "--check" : "--write"} only applies to Pact .agent source; use compile --target agent to convert YAML/JSON IR`,
      filePath
    );
  }

  const agentfile = parseSource(source, filePath);
  const formatted = compileAgentfile(agentfile, "agent");

  if (options.check) {
    if (source !== formatted) {
      throw new AgentfileError(`format check failed: ${filePath}; run agentfile format ${filePath} --write`, filePath);
    }

    return {
      status: "checked",
      filePath
    };
  }

  if (options.write) {
    if (source === formatted) {
      return {
        status: "unchanged",
        filePath
      };
    }

    await writeFile(filePath, formatted, "utf8");
    return {
      status: "written",
      filePath
    };
  }

  return {
    status: "printed",
    formatted
  };
}

async function runDoctor(file?: string): Promise<DoctorResult> {
  const contractPath = await resolveFile(file);
  const agentfile = await load(contractPath);
  return createDoctorResult(contractPath, agentfile);
}

async function createDoctorResult(contractPath: string, agentfile: Agentfile): Promise<DoctorResult> {
  const lintDiagnostics = lintAgentfile(agentfile);
  const surfaces = await inspectGeneratedSurfaces(agentfile);
  const staleSurfaces = surfaces.filter((surface) => surface.status === "stale");

  return {
    contractPath,
    status: staleSurfaces.length > 0 ? "fail" : "pass",
    lintDiagnostics,
    surfaces,
    nextSteps: staleSurfaces.map((surface) =>
      `Run agentfile sync ${contractPath} --target ${surface.target} --output ${surface.outputPath} --force`
    )
  };
}

async function runInspect(file?: string): Promise<InspectResult> {
  const contractPath = await resolveFile(file);
  const agentfile = await load(contractPath);
  const doctor = await createDoctorResult(contractPath, agentfile);
  const handoffEvidence = receiptHandoffEvidence(agentfile);

  return {
    contractPath,
    status: doctor.status,
    task: {
      id: agentfile.task.id,
      goal: agentfile.task.goal,
      summary: agentfile.info.summary,
      owners: agentfile.info.owners,
      labels: agentfile.info.labels
    },
    scope: {
      includeCount: agentfile.scope.include.length,
      excludeCount: agentfile.scope.exclude.length,
      filesystemReadCount: agentfile.permissions.filesystem.read.length,
      filesystemWriteCount: agentfile.permissions.filesystem.write.length
    },
    authority: {
      shellAllowCount: agentfile.permissions.shell.allow.length,
      shellDenyCount: agentfile.permissions.shell.deny.length,
      networkDefault: agentfile.permissions.network.default,
      networkAllowCount: agentfile.permissions.network.allow.length,
      secretsAccess: agentfile.permissions.secrets.access,
      secretAllowCount: agentfile.permissions.secrets.allow.length,
      approvalGates: agentfile.permissions.approvals.requiredFor
    },
    workflow: {
      stepCount: agentfile.workflow.steps.length,
      checkCount: agentfile.checks.length,
      requiredCheckCount: agentfile.checks.filter((check) => check.required).length,
      commandCheckCount: agentfile.checks.filter((check) => check.command).length,
      acceptanceCount: agentfile.workflow.acceptance.length,
      handoffEvidenceCount: handoffEvidence.length
    },
    doctor
  };
}

async function runSurfaceInspection(file?: string): Promise<SurfaceInspectionResult> {
  const contractPath = await resolveFile(file);
  const agentfile = await load(contractPath);
  const surfaces = await inspectGeneratedSurfaces(agentfile);

  return {
    contractPath,
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
      description: definition.description,
      outputPath,
      status,
      lineCount: countLines(generated),
      byteCount: Buffer.byteLength(generated, "utf8")
    });
  }

  return surfaces;
}

function countLines(content: string): number {
  const trimmedFinalNewline = content.endsWith("\n") ? content.slice(0, -1) : content;
  if (trimmedFinalNewline.length === 0) {
    return 0;
  }

  return trimmedFinalNewline.split(/\r?\n/).length;
}

function listOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  return readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return undefined;
    }

    throw new AgentfileError(error.message, filePath);
  });
}

function renderDoctorReport(result: DoctorResult, format: DoctorFormat): string {
  if (format === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

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

  lines.push(`Status: ${result.status}`);

  if (result.nextSteps.length > 0) {
    lines.push("Next steps:");
    for (const step of result.nextSteps) {
      lines.push(`- ${step}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderInspectReport(result: InspectResult, format: InspectFormat): string {
  if (format === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [
    "# Agentfile Inspect",
    `Contract: ${result.contractPath}`,
    `Status: ${result.status}`,
    "",
    `Task: ${result.task.id}`,
    `Goal: ${result.task.goal}`
  ];

  if (result.task.summary) {
    lines.push(`Summary: ${result.task.summary}`);
  }

  lines.push(
    `Owners: ${listOrNone(result.task.owners)}`,
    `Labels: ${listOrNone(result.task.labels)}`,
    "",
    "## Contract Shape",
    `Scope: ${result.scope.includeCount} include, ${result.scope.excludeCount} exclude`,
    `Filesystem: ${result.scope.filesystemReadCount} read, ${result.scope.filesystemWriteCount} write`,
    `Authority: ${result.authority.shellAllowCount} shell allow, ${result.authority.shellDenyCount} shell deny, network ${result.authority.networkDefault}, secrets ${result.authority.secretsAccess}`,
    `Approval gates: ${listOrNone(result.authority.approvalGates)}`,
    "",
    "## Workflow And Receipt",
    `Steps: ${result.workflow.stepCount}`,
    `Checks: ${result.workflow.checkCount} total, ${result.workflow.requiredCheckCount} required, ${result.workflow.commandCheckCount} command-backed`,
    `Acceptance evidence: ${result.workflow.acceptanceCount}`,
    `Handoff evidence: ${result.workflow.handoffEvidenceCount}`,
    "",
    "## Generated Surfaces"
  );

  for (const surface of result.doctor.surfaces) {
    lines.push(`- ${surface.outputPath} [${surface.target}]: ${doctorSurfaceLabel(surface.status)}`);
  }

  lines.push("", `Lint warnings: ${result.doctor.lintDiagnostics.length}`);
  for (const diagnostic of result.doctor.lintDiagnostics) {
    lines.push(`- ${diagnostic.path}: ${diagnostic.message}`);
  }

  if (result.doctor.nextSteps.length > 0) {
    lines.push("", "Next steps:");
    for (const step of result.doctor.nextSteps) {
      lines.push(`- ${step}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderSurfaceInspection(result: SurfaceInspectionResult, format: SurfacesFormat): string {
  if (format === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [
    "# Agentfile Generated Surfaces",
    `Contract: ${result.contractPath}`,
    "",
    "| Target | Output | Status | Lines | Bytes |",
    "| --- | --- | --- | ---: | ---: |"
  ];

  for (const surface of result.surfaces) {
    lines.push(
      `| ${surface.target} | ${surface.outputPath} | ${doctorSurfaceLabel(surface.status)} | ${surface.lineCount} | ${surface.byteCount} |`
    );
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

type DoctorFormat = "text" | "json";

function parseDoctorFormat(value: string): DoctorFormat {
  if (value === "text" || value === "json") {
    return value;
  }

  throw new AgentfileError(`unknown doctor format "${value}". Expected "text" or "json".`);
}

type InspectFormat = "text" | "json";

function parseInspectFormat(value: string): InspectFormat {
  if (value === "text" || value === "json") {
    return value;
  }

  throw new AgentfileError(`unknown inspect format "${value}". Expected "text" or "json".`);
}

type SurfacesFormat = "text" | "json";

function parseSurfacesFormat(value: string): SurfacesFormat {
  if (value === "text" || value === "json") {
    return value;
  }

  throw new AgentfileError(`unknown surfaces format "${value}". Expected "text" or "json".`);
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
