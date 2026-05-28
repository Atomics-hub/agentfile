#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { Command } from "commander";
import {
  compileAgentfile,
  compileTargets,
  defaultOutputPathForTarget,
  isSyncTarget,
  type CompileTarget,
  type SyncTarget
} from "./compiler.js";
import { AgentfileError, lintAgentfile } from "./diagnostics.js";
import { diffContracts, renderContractDiff, type ContractDiffFormat } from "./diff.js";
import { defaultVscodeSchemaPath, defaultVscodeSettingsPath, renderVscodeSettings } from "./editor.js";
import { compileJsonSchema } from "./json-schema.js";
import {
  fillReceiptProofFromCheckLog,
  fillReceiptProofFromCheckResults,
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

const allInspectFailureChecks = ["stale-surfaces", "missing-surfaces", "lint"] as const;
const defaultGithubActionsWorkflowPath = ".github/workflows/agentfile.yml";
const defaultGithubActionsReceiptPath = "receipts/latest.receipt.json";

const program = new Command();

program
  .name("agentfile")
  .description("Validate and compile agent-native software task contracts.")
  .version("0.1.0");

program
  .command("init")
  .description("Create a minimal Agentfile starter in YAML or Pact source form.")
  .argument("[file]", "Agentfile path")
  .option("-f, --format <format>", "yaml or agent")
  .option("--kit <kit>", "starter kit preset: reviewable")
  .option("--editor <editor>", "also create editor integration files: vscode")
  .option("--schema <file>", "schema path for generated editor setup", defaultVscodeSchemaPath)
  .option("--github-actions", "also create a GitHub Actions validation workflow", false)
  .option("--github-actions-surfaces <targets>", `generated surfaces to create and check, or "none": ${githubActionSurfaceHelp()}`)
  .option("--github-actions-receipt <file>", "receipt JSON path for the generated GitHub Actions workflow to verify when present")
  .action(async (file: string | undefined, options: InitOptions) => {
    for (const message of await runInit(file, options)) {
      console.log(message);
    }
  });

program
  .command("adopt")
  .description("Scaffold Agentfile into an existing repo with editor, CI, and generated instruction surfaces.")
  .argument("[file]", "Pact Agentfile source path")
  .option("--schema <file>", "schema path for generated editor setup", defaultVscodeSchemaPath)
  .option("--surfaces <targets>", `generated surfaces to create and check, or "none": ${githubActionSurfaceHelp()}`, syncTargetHelp())
  .option("--receipt <file>", "receipt JSON path for the generated GitHub Actions workflow to verify when present", defaultGithubActionsReceiptPath)
  .action(async (file: string | undefined, options: AdoptOptions) => {
    for (const message of await runAdopt(file, options)) {
      console.log(message);
    }
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
  .option("--strict", "fail on stale or missing generated surfaces and lint warnings", false)
  .option(
    "--fail-on <checks>",
    `comma-separated readiness checks that should fail inspection: ${inspectFailureCheckHelp()}`,
    "stale-surfaces"
  )
  .action(async (file: string, options: { format: string; strict: boolean; failOn: string }) => {
    const failureChecks = options.strict ? [...allInspectFailureChecks] : parseInspectFailureChecks(options.failOn);
    const result = await runInspect(file, failureChecks);
    process.stdout.write(renderInspectReport(result, parseInspectFormat(options.format)));

    if (result.status === "fail") {
      process.exitCode = 1;
    }
  });

program
  .command("github-actions")
  .description("Print a GitHub Actions workflow for validating an Agentfile contract from source.")
  .argument("[file]", "Agentfile path")
  .option("--tool-ref <ref>", "Agentfile repository ref to checkout", "main")
  .option("--surfaces <targets>", `comma-separated generated surfaces to check, or "none": ${githubActionSurfaceHelp()}`, "agents-md,claude-md")
  .option("--receipt <file>", "optional receipt JSON path to verify")
  .option("-o, --output <file>", "write the generated workflow to a file")
  .option("--check", "verify the generated workflow file is already up to date", false)
  .option("-f, --force", "overwrite an existing workflow file", false)
  .action(async (file: string, options: GithubActionsOptions) => {
    const contractPath = await resolveFile(file);
    await load(contractPath);
    const surfaces = parseGithubActionSurfaces(options.surfaces);

    const workflow = renderGithubActionsWorkflow({
      contractPath: toWorkflowPath(contractPath),
      toolRef: options.toolRef,
      surfaces,
      receiptPath: options.receipt ? toWorkflowPath(options.receipt) : undefined
    });

    await emitGithubActionsWorkflow(workflow, options);
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
  .option("-o, --output <file>", "write the generated schema to a file")
  .option("--check", "verify the generated schema file is already up to date", false)
  .option("-f, --force", "overwrite an existing schema file", false)
  .action(async (options: SchemaOptions) => {
    await emitSchema(compileJsonSchema(), options);
  });

const editorCommand = program
  .command("editor")
  .description("Generate editor integration files.");

editorCommand
  .command("vscode")
  .description("Print, write, or check VS Code settings for Agentfile schema associations.")
  .option("--schema <file>", "schema path VS Code should use", defaultVscodeSchemaPath)
  .option("-o, --output <file>", "write generated VS Code settings to a file")
  .option("--check", "verify generated VS Code settings are already up to date", false)
  .option("-f, --force", "overwrite an existing settings file", false)
  .action(async (options: VscodeSettingsCommandOptions) => {
    await emitVscodeSettings(
      renderVscodeSettings({
        schemaPath: normalizePathSeparators(options.schema)
      }),
      options
    );
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
      await writeReceiptArtifact(receipt, options.output, options.force);
      return;
    }

    process.stdout.write(receipt);
  });

receiptCommand
  .command("init")
  .description("Create a JSON receipt template for the default CI receipt gate.")
  .argument("[file]", "Agentfile path")
  .option("-o, --output <file>", "receipt JSON output path", defaultGithubActionsReceiptPath)
  .option("--force", "overwrite an existing receipt file", false)
  .action(async (file: string, options: { output: string; force: boolean }, command: Command) => {
    const resolved = await resolveFile(file);
    const agentfile = await load(resolved);
    const receipt = renderReceipt(agentfile, resolved, "json");
    const parentOptions = command.parent?.opts() as { output?: string; force?: boolean };
    const output = parentOptions.output ?? options.output;
    const force = options.force || Boolean(parentOptions.force);

    await writeReceiptArtifact(receipt, output, force);
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
  .option("--format <format>", "text or json", "text")
  .action(async (contract: string, receiptPath: string, options: { format: string }, command: Command) => {
    const agentfile = await load(contract);
    const receipt = await loadReceipt(receiptPath);
    const review = reviewReceipt(agentfile, receipt, receiptPath);
    const parentOptions = command.parent?.opts() as { format?: string };
    const format = parseReceiptReviewFormat(parentOptions.format === "markdown" ? options.format : parentOptions.format ?? options.format);

    if (format === "json") {
      process.stdout.write(`${JSON.stringify(review, null, 2)}\n`);
    } else {
      process.stdout.write(renderReceiptReview(review));
    }

    if (review.status === "fail") {
      process.exitCode = 1;
    }
  });

receiptCommand
  .command("fill")
  .description("Fill command-backed receipt proof from check output.")
  .argument("<contract>", "Agentfile contract path")
  .argument("<receipt>", "JSON receipt path")
  .option("--check-log <file>", "check log path whose content contains completed proof commands")
  .option("--check-results <file>", "structured check results JSON path with a checks array")
  .option("--write", "write the updated JSON receipt back to the receipt path", false)
  .action(async (
    contract: string,
    receiptPath: string,
    options: { checkLog?: string; checkResults?: string; write: boolean }
  ) => {
    const agentfile = await load(contract);
    const receipt = await loadReceipt(receiptPath);
    const result = await fillReceiptProof(agentfile, receipt, options);
    const rendered = `${JSON.stringify(result.receipt, null, 2)}\n`;

    if (!options.write) {
      process.stdout.write(rendered);
      return;
    }

    await writeFile(receiptPath, rendered, "utf8");
    console.log(`Updated ${receiptPath}`);
    console.log(`Filled proof: ${result.filledProofIds.length > 0 ? result.filledProofIds.join(", ") : "none"}`);
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

async function fillReceiptProof(
  agentfile: Agentfile,
  receipt: unknown,
  options: { checkLog?: string; checkResults?: string }
) {
  if (options.checkLog && options.checkResults) {
    throw new AgentfileError("receipt fill accepts only one input: use --check-log or --check-results");
  }

  if (options.checkResults) {
    const checkResults = await loadJson(options.checkResults, "check results");
    return fillReceiptProofFromCheckResults(agentfile, receipt, options.checkResults, checkResults);
  }

  if (options.checkLog) {
    const checkLog = await readTextFile(options.checkLog);
    return fillReceiptProofFromCheckLog(agentfile, receipt, options.checkLog, checkLog);
  }

  throw new AgentfileError("receipt fill requires --check-log or --check-results");
}

async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    throw new AgentfileError(error.message, filePath);
  });
}

async function loadJson(filePath: string, label: string): Promise<unknown> {
  const source = await readTextFile(filePath);

  try {
    return JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AgentfileError(`invalid ${label} JSON: ${message}`, filePath);
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

function githubActionSurfaceHelp(): string {
  return `${syncTargetHelp()}, none`;
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
  readiness: {
    failOn: InspectFailureCheck[];
    failures: InspectGateFailure[];
  };
  doctor: DoctorResult;
}

interface InspectGateFailure {
  check: InspectFailureCheck;
  count: number;
  message: string;
}

interface GithubActionsOptions {
  toolRef: string;
  surfaces: string;
  receipt?: string;
  output?: string;
  check: boolean;
  force: boolean;
}

interface GithubActionsWorkflow {
  contractPath: string;
  toolRef: string;
  surfaces: SyncTarget[];
  receiptPath?: string;
}

interface SchemaOptions {
  output?: string;
  check: boolean;
  force: boolean;
}

interface InitOptions {
  format?: string;
  kit?: string;
  editor?: string;
  schema: string;
  githubActions: boolean;
  githubActionsSurfaces?: string;
  githubActionsReceipt?: string;
}

interface AdoptOptions {
  schema: string;
  surfaces: string;
  receipt: string;
}

type InitKit = "none" | "reviewable";
type InitEditor = "none" | "vscode";

interface InitGithubActions {
  enabled: boolean;
  surfaces: SyncTarget[];
  receiptPath?: string;
}

interface InitPlanItem {
  path: string;
  content: string;
}

interface VscodeSettingsCommandOptions {
  schema: string;
  output?: string;
  check: boolean;
  force: boolean;
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

async function runAdopt(file: string | undefined, options: AdoptOptions): Promise<string[]> {
  return runInit(file ?? "agentfile.agent", {
    format: "agent",
    kit: "reviewable",
    editor: "vscode",
    schema: options.schema,
    githubActions: true,
    githubActionsSurfaces: options.surfaces,
    githubActionsReceipt: options.receipt
  });
}

async function runInit(file: string | undefined, options: InitOptions): Promise<string[]> {
  const kit = parseInitKit(options.kit);
  const outputPath = resolveInitFile(file, options.format, kit);
  const format = parseInitFormat(outputPath, options.format);
  const editor = parseInitEditor(options.editor ?? defaultInitEditorForKit(kit));
  const githubActionsEnabled = options.githubActions || kit === "reviewable";
  const githubActions = parseInitGithubActions(
    githubActionsEnabled,
    options.githubActionsSurfaces,
    options.githubActionsReceipt ?? defaultInitGithubActionsReceiptForKit(kit)
  );
  const plan = buildInitPlan(outputPath, format, editor, options.schema, githubActions);

  await assertInitPlanCanWrite(plan);

  for (const item of plan) {
    await mkdir(dirname(item.path), { recursive: true });
    await writeFile(item.path, item.content, "utf8");
  }

  return plan.map((item) => `Created ${item.path}`);
}

function buildInitPlan(
  file: string,
  format: InitFormat,
  editor: InitEditor,
  schemaPath: string,
  githubActions: InitGithubActions
): InitPlanItem[] {
  const source = minimalAgentfile(format);
  const plan: InitPlanItem[] = [
    {
      path: file,
      content: source
    }
  ];

  if (editor === "vscode") {
    plan.push(
      {
        path: schemaPath,
        content: compileJsonSchema()
      },
      {
        path: defaultVscodeSettingsPath,
        content: renderVscodeSettings({
          schemaPath: normalizePathSeparators(schemaPath)
        })
      }
    );
  }

  if (githubActions.enabled) {
    const agentfile = parseSource(source, file);
    for (const target of githubActions.surfaces) {
      plan.push({
        path: defaultOutputPathForTarget(target),
        content: compileAgentfile(agentfile, target)
      });
    }

    plan.push({
      path: defaultGithubActionsWorkflowPath,
      content: renderGithubActionsWorkflow({
        contractPath: toWorkflowPath(file),
        toolRef: "main",
        surfaces: githubActions.surfaces,
        receiptPath: githubActions.receiptPath ? toWorkflowPath(githubActions.receiptPath) : undefined
      })
    });
  }

  return plan;
}

async function assertInitPlanCanWrite(plan: InitPlanItem[]): Promise<void> {
  const planned = new Set<string>();
  const duplicate = plan.find((item) => {
    if (planned.has(item.path)) {
      return true;
    }

    planned.add(item.path);
    return false;
  });

  if (duplicate) {
    throw new AgentfileError(`init output paths must be unique: ${duplicate.path}`, duplicate.path);
  }

  const conflicts: string[] = [];
  for (const item of plan) {
    if (await exists(item.path)) {
      conflicts.push(item.path);
    }
  }

  if (conflicts.length === 0) {
    return;
  }

  throw new AgentfileError([
    "refusing to overwrite existing init files:",
    ...conflicts.map((path) => `- ${path}`),
    "Run init in an empty project or choose different output paths."
  ].join("\n"), conflicts[0]);
}

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

async function runInspect(
  file: string | undefined,
  failureChecks: InspectFailureCheck[] = ["stale-surfaces"]
): Promise<InspectResult> {
  const contractPath = await resolveFile(file);
  const agentfile = await load(contractPath);
  const doctor = await createDoctorResult(contractPath, agentfile);
  const handoffEvidence = receiptHandoffEvidence(agentfile);
  const gateFailures = inspectGateFailures(doctor, failureChecks);

  return {
    contractPath,
    status: gateFailures.length > 0 ? "fail" : "pass",
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
    readiness: {
      failOn: failureChecks,
      failures: gateFailures
    },
    doctor
  };
}

function inspectGateFailures(doctor: DoctorResult, failureChecks: InspectFailureCheck[]): InspectGateFailure[] {
  const failures: InspectGateFailure[] = [];

  if (failureChecks.includes("stale-surfaces")) {
    const count = doctor.surfaces.filter((surface) => surface.status === "stale").length;
    if (count > 0) {
      failures.push({
        check: "stale-surfaces",
        count,
        message: `${count} stale generated ${pluralize(count, "surface")}`
      });
    }
  }

  if (failureChecks.includes("missing-surfaces")) {
    const count = doctor.surfaces.filter((surface) => surface.status === "missing").length;
    if (count > 0) {
      failures.push({
        check: "missing-surfaces",
        count,
        message: `${count} missing generated ${pluralize(count, "surface")}`
      });
    }
  }

  if (failureChecks.includes("lint")) {
    const count = doctor.lintDiagnostics.length;
    if (count > 0) {
      failures.push({
        check: "lint",
        count,
        message: `${count} lint ${pluralize(count, "warning")}`
      });
    }
  }

  return failures;
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

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
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

  const gateFailureLines = result.readiness.failures.length === 0
    ? ["Gate failures: none"]
    : [
        "Gate failures:",
        ...result.readiness.failures.map((failure) => `- ${failure.check}: ${failure.message}`)
      ];
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
    `Readiness gates: ${result.readiness.failOn.join(", ")}`,
    ...gateFailureLines,
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

type InspectFailureCheck = typeof allInspectFailureChecks[number];

function parseInspectFormat(value: string): InspectFormat {
  if (value === "text" || value === "json") {
    return value;
  }

  throw new AgentfileError(`unknown inspect format "${value}". Expected "text" or "json".`);
}

function parseInspectFailureChecks(value: string): InspectFailureCheck[] {
  const checks = value.split(",").map((check) => check.trim()).filter(Boolean);

  if (checks.length === 0) {
    throw new AgentfileError(`inspect --fail-on requires at least one check. Expected ${inspectFailureCheckHelp()}.`);
  }

  const unknown = checks.find((check) => !allInspectFailureChecks.includes(check as InspectFailureCheck));
  if (unknown) {
    throw new AgentfileError(`unknown inspect failure check "${unknown}". Expected ${inspectFailureCheckHelp()}.`);
  }

  return Array.from(new Set(checks)) as InspectFailureCheck[];
}

function inspectFailureCheckHelp(): string {
  return allInspectFailureChecks.map((check) => `"${check}"`).join(", ");
}

function parseGithubActionSurfaces(value: string): SyncTarget[] {
  const requested = value.split(",").map((target) => target.trim()).filter(Boolean);

  if (requested.length === 0) {
    throw new AgentfileError(`github-actions --surfaces requires at least one target or "none". Expected ${githubActionSurfaceHelp()}.`);
  }

  if (requested.includes("none")) {
    if (requested.length === 1) {
      return [];
    }

    throw new AgentfileError('github-actions --surfaces cannot combine "none" with generated surface targets.');
  }

  const surfaces: SyncTarget[] = [];
  for (const value of requested) {
    const target = parseTarget(value);
    if (!isSyncTarget(target)) {
      throw new AgentfileError(
        `github-actions surface "${target}" is not file-backed. Expected ${syncTargetList()} or "none".`
      );
    }

    if (!surfaces.includes(target)) {
      surfaces.push(target);
    }
  }

  return surfaces;
}

function renderGithubActionsWorkflow(workflow: GithubActionsWorkflow): string {
  const cli = "node .agentfile/tool/dist/cli.js";
  const contract = shellQuote(workflow.contractPath);
  const steps = [
    "      - name: Checkout project",
    "        uses: actions/checkout@v6",
    "",
    "      - name: Checkout Agentfile",
    "        uses: actions/checkout@v6",
    "        with:",
    "          repository: Atomics-hub/agentfile",
    `          ref: ${yamlString(workflow.toolRef)}`,
    "          path: .agentfile/tool",
    "",
    "      - name: Setup Node",
    "        uses: actions/setup-node@v6",
    "        with:",
    "          node-version: 20",
    "          cache: npm",
    "          cache-dependency-path: .agentfile/tool/package-lock.json",
    "",
    "      - name: Install Agentfile",
    "        run: npm ci --prefix .agentfile/tool",
    "",
    "      - name: Build Agentfile CLI",
    "        run: npm run build --prefix .agentfile/tool",
    "",
    "      - name: Inspect contract readiness",
    `        run: ${cli} inspect ${contract} --fail-on stale-surfaces,lint --format json`
  ];

  for (const target of workflow.surfaces) {
    steps.push(
      "",
      `      - name: Check generated ${target}`,
      `        run: ${cli} sync ${contract} --target ${target} --output ${shellQuote(defaultOutputPathForTarget(target))} --check`
    );
  }

  if (workflow.receiptPath) {
    steps.push(
      "",
      "      - name: Verify receipt",
      `        if: hashFiles(${githubExpressionString(workflow.receiptPath)}) != ''`,
      `        run: ${cli} receipt verify ${contract} ${shellQuote(workflow.receiptPath)}`
    );
  }

  return [
    "name: Agentfile",
    "",
    "on:",
    "  pull_request:",
    "  push:",
    "    branches:",
    "      - main",
    "",
    "jobs:",
    "  contract:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    ...steps,
    ""
  ].join("\n");
}

async function emitGithubActionsWorkflow(content: string, options: GithubActionsOptions): Promise<void> {
  if (options.check && !options.output) {
    throw new AgentfileError("github-actions --check requires --output so there is a workflow file to verify");
  }

  if (options.check && options.force) {
    throw new AgentfileError("github-actions cannot use --check and --force together");
  }

  if (!options.output) {
    process.stdout.write(content);
    return;
  }

  if (options.check) {
    const current = await readOptionalFile(options.output);
    if (current === undefined) {
      throw new AgentfileError(`generated workflow is missing: ${options.output}`, options.output);
    }

    if (current !== content) {
      throw new AgentfileError(
        `generated workflow is stale: ${options.output}; rerun without --check and pass --force to update it`,
        options.output
      );
    }

    console.log(`OK ${options.output} is up to date`);
    return;
  }

  if (!options.force && await exists(options.output)) {
    throw new AgentfileError(`refusing to overwrite ${options.output}; pass --force to replace it`, options.output);
  }

  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, content, "utf8");
  console.log(`Wrote ${options.output}`);
}

async function writeReceiptArtifact(content: string, outputPath: string, force: boolean): Promise<void> {
  if (!force && await exists(outputPath)) {
    throw new AgentfileError(`refusing to overwrite ${outputPath}; pass --force to replace it`);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");
  console.log(`Wrote ${outputPath}`);
}

async function emitSchema(content: string, options: SchemaOptions): Promise<void> {
  if (options.check && !options.output) {
    throw new AgentfileError("schema --check requires --output so there is a schema file to verify");
  }

  if (options.check && options.force) {
    throw new AgentfileError("schema cannot use --check and --force together");
  }

  if (!options.output) {
    process.stdout.write(content);
    return;
  }

  if (options.check) {
    const current = await readOptionalFile(options.output);
    if (current === undefined) {
      throw new AgentfileError(`generated schema is missing: ${options.output}`, options.output);
    }

    if (current !== content) {
      throw new AgentfileError(
        `generated schema is stale: ${options.output}; rerun without --check and pass --force to update it`,
        options.output
      );
    }

    console.log(`OK ${options.output} is up to date`);
    return;
  }

  if (!options.force && await exists(options.output)) {
    throw new AgentfileError(`refusing to overwrite ${options.output}; pass --force to replace it`, options.output);
  }

  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, content, "utf8");
  console.log(`Wrote ${options.output}`);
}

async function emitVscodeSettings(content: string, options: VscodeSettingsCommandOptions): Promise<void> {
  if (options.check && !options.output) {
    throw new AgentfileError("editor vscode --check requires --output so there is a settings file to verify");
  }

  if (options.check && options.force) {
    throw new AgentfileError("editor vscode cannot use --check and --force together");
  }

  if (!options.output) {
    process.stdout.write(content);
    return;
  }

  if (options.check) {
    const current = await readOptionalFile(options.output);
    if (current === undefined) {
      throw new AgentfileError(`generated VS Code settings are missing: ${options.output}`, options.output);
    }

    if (current !== content) {
      throw new AgentfileError(
        `generated VS Code settings are stale: ${options.output}; rerun without --check and pass --force to update it`,
        options.output
      );
    }

    console.log(`OK ${options.output} is up to date`);
    return;
  }

  if (!options.force && await exists(options.output)) {
    throw new AgentfileError(`refusing to overwrite ${options.output}; pass --force to replace it`, options.output);
  }

  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, content, "utf8");
  console.log(`Wrote ${options.output}`);
}

function toWorkflowPath(filePath: string): string {
  if (!isAbsolute(filePath)) {
    return normalizePathSeparators(filePath);
  }

  const relativePath = relative(process.cwd(), filePath);
  if (!relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return normalizePathSeparators(relativePath);
  }

  return normalizePathSeparators(filePath);
}

function normalizePathSeparators(filePath: string): string {
  return sep === "/" ? filePath : filePath.split(sep).join("/");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function githubExpressionString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

type SurfacesFormat = "text" | "json";

type ReceiptReviewFormat = "text" | "json";

function parseReceiptReviewFormat(value: string): ReceiptReviewFormat {
  if (value === "text" || value === "json") {
    return value;
  }

  throw new AgentfileError(`unknown receipt review format "${value}". Expected "text" or "json".`);
}

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

function resolveInitFile(filePath: string | undefined, format: string | undefined, kit: InitKit): string {
  if (filePath) {
    return filePath;
  }

  if (format === "agent") {
    return "agentfile.agent";
  }

  if (format === "yaml") {
    return "agentfile.yaml";
  }

  if (kit === "reviewable") {
    return "agentfile.agent";
  }

  return "agentfile.yaml";
}

function parseInitFormat(filePath: string, value?: string): InitFormat {
  if (value === undefined) {
    return filePath.endsWith(".agent") ? "agent" : "yaml";
  }

  if (value === "yaml" || value === "agent") {
    return value;
  }

  throw new AgentfileError(`unknown init format "${value}". Expected "yaml" or "agent".`);
}

function parseInitKit(value?: string): InitKit {
  if (value === undefined) {
    return "none";
  }

  if (value === "reviewable") {
    return value;
  }

  throw new AgentfileError(`unknown init kit "${value}". Expected "reviewable".`);
}

function defaultInitEditorForKit(kit: InitKit): string | undefined {
  return kit === "reviewable" ? "vscode" : undefined;
}

function defaultInitGithubActionsReceiptForKit(kit: InitKit): string | undefined {
  return kit === "reviewable" ? defaultGithubActionsReceiptPath : undefined;
}

function parseInitEditor(value?: string): InitEditor {
  if (value === undefined) {
    return "none";
  }

  if (value === "vscode") {
    return value;
  }

  throw new AgentfileError(`unknown init editor "${value}". Expected "vscode".`);
}

function parseInitGithubActions(enabled: boolean, surfacesValue?: string, receiptPath?: string): InitGithubActions {
  if (!enabled && surfacesValue !== undefined) {
    throw new AgentfileError("init --github-actions-surfaces requires --github-actions");
  }

  if (!enabled && receiptPath !== undefined) {
    throw new AgentfileError("init --github-actions-receipt requires --github-actions");
  }

  return {
    enabled,
    surfaces: enabled ? parseGithubActionSurfaces(surfacesValue ?? "none") : [],
    receiptPath: enabled ? receiptPath : undefined
  };
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
