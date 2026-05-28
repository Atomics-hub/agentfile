import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AgentfileError } from "./diagnostics.js";
import type { Agentfile } from "./schema.js";

export interface CheckRunOptions {
  contractPath: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  logPath: string;
  resultsPath: string;
  timeoutMs: number;
}

export interface CheckRunReport {
  contractPath: string;
  logPath: string;
  resultsPath: string;
  checks: CheckRunResult[];
  failedRequiredCheckIds: string[];
  failedOptionalCheckIds: string[];
}

interface CheckRunResult {
  id: string;
  command: string;
  required: boolean;
  status: "passed" | "failed";
  evidence: string;
}

interface ShellCommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

const maxCommandOutputBytes = 20 * 1024 * 1024;

export async function runCommandChecks(agentfile: Agentfile, options: CheckRunOptions): Promise<CheckRunReport> {
  const commandChecks = agentfile.checks.filter((check) => check.command);

  if (commandChecks.length === 0) {
    throw new AgentfileError("checks run requires at least one command-backed check in the contract");
  }

  const logChunks: string[] = [];
  const checks: CheckRunResult[] = [];
  const failedRequiredCheckIds: string[] = [];
  const failedOptionalCheckIds: string[] = [];

  for (const check of commandChecks) {
    const command = check.command;
    if (!command) {
      continue;
    }

    const result = await execShellCommand(command, options);
    const status = result.exitCode === 0 ? "passed" : "failed";

    logChunks.push(renderCommandLog(command, result));
    checks.push({
      id: check.id,
      command,
      required: check.required,
      status,
      evidence: options.logPath
    });

    if (status === "failed") {
      if (check.required) {
        failedRequiredCheckIds.push(check.id);
      } else {
        failedOptionalCheckIds.push(check.id);
      }
    }
  }

  await writeTextArtifact(options.logPath, `${logChunks.join("\n\n").trimEnd()}\n`);
  await writeTextArtifact(options.resultsPath, `${JSON.stringify({
    checks: checks.map(({ id, command, status, evidence }) => ({
      id,
      command,
      status,
      evidence
    }))
  }, null, 2)}\n`);

  return {
    contractPath: options.contractPath,
    logPath: options.logPath,
    resultsPath: options.resultsPath,
    checks,
    failedRequiredCheckIds,
    failedOptionalCheckIds
  };
}

export function renderCheckRunReport(report: CheckRunReport): string {
  const lines = [
    `Ran ${report.checks.length} command-backed check${report.checks.length === 1 ? "" : "s"} for ${report.contractPath}.`,
    ...report.checks.map((check) => `- ${check.status} ${check.id}: ${check.command}`),
    `Wrote ${report.logPath}`,
    `Wrote ${report.resultsPath}`
  ];

  if (report.failedRequiredCheckIds.length > 0) {
    lines.push(`Required checks failed: ${report.failedRequiredCheckIds.join(", ")}`);
  }

  if (report.failedOptionalCheckIds.length > 0) {
    lines.push(`Optional checks failed: ${report.failedOptionalCheckIds.join(", ")}`);
  }

  return `${lines.join("\n")}\n`;
}

function execShellCommand(command: string, options: CheckRunOptions): Promise<ShellCommandResult> {
  return new Promise((resolve) => {
    exec(command, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs,
      maxBuffer: maxCommandOutputBytes
    }, (error, stdout, stderr) => {
      const commandError = error as NodeJS.ErrnoException & {
        code?: number | string;
        killed?: boolean;
        signal?: NodeJS.Signals | null;
      } | null;
      const exitCode = commandError && typeof commandError.code === "number" ? commandError.code : error ? null : 0;
      const signal = commandError?.signal ?? null;
      const timedOut = Boolean(commandError?.killed && signal === "SIGTERM");

      resolve({
        exitCode,
        signal,
        timedOut,
        stdout,
        stderr
      });
    });
  });
}

function renderCommandLog(command: string, result: ShellCommandResult): string {
  const chunks = [`$ ${command}`];

  if (result.stdout.trim().length > 0) {
    chunks.push(result.stdout.trimEnd());
  }

  if (result.stderr.trim().length > 0) {
    chunks.push(result.stderr.trimEnd());
  }

  if (result.exitCode === 0) {
    chunks.push("[exit 0]");
  } else if (result.timedOut) {
    chunks.push(`[timeout signal ${result.signal ?? "unknown"}]`);
  } else if (result.exitCode !== null) {
    chunks.push(`[exit ${result.exitCode}]`);
  } else {
    chunks.push(`[signal ${result.signal ?? "unknown"}]`);
  }

  return chunks.join("\n");
}

async function writeTextArtifact(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}
