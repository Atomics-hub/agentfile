import type { ZodError } from "zod";
import type { Agentfile } from "./schema.js";
import {
  isRepoWidePattern,
  looksLikeDependencyChangeCommand,
  looksLikeDestructiveShellCommand,
  looksLikePublishCommand,
  normalizeShellCommand
} from "./risk.js";

export class AgentfileError extends Error {
  constructor(message: string, readonly filePath?: string) {
    super(filePath ? `${filePath}: ${message}` : message);
    this.name = "AgentfileError";
  }
}

export interface LintDiagnostic {
  code: string;
  path: string;
  message: string;
}

export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("\n");
}

export function lintAgentfile(agentfile: Agentfile): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const approvals = new Set(agentfile.permissions.approvals.requiredFor);
  const hasProofRequirement =
    agentfile.checks.length > 0 || agentfile.workflow.acceptance.length > 0;
  const hasExecutableCheck = agentfile.checks.some((check) => check.command);

  if (!hasProofRequirement) {
    diagnostics.push({
      code: "missing-proof-requirement",
      path: "checks",
      message: "contract defines no proof requirements; add a check or workflow.acceptance expectation"
    });
  } else if (!hasExecutableCheck) {
    diagnostics.push({
      code: "missing-executable-proof-check",
      path: "checks",
      message: "contract has no executable verification command; prefer at least one command-backed check"
    });
  }

  for (const path of agentfile.scope.include) {
    if (isRepoWidePattern(path)) {
      diagnostics.push({
        code: "risky-scope-include-broad",
        path: "scope.include",
        message: `mission scope includes the entire repository; prefer narrower include paths: ${path}`
      });
    }
  }

  for (const command of agentfile.permissions.shell.allow) {
    const normalized = normalizeShellCommand(command);

    if (looksLikePublishCommand(normalized)) {
      diagnostics.push({
        code: "risky-shell-publish-command",
        path: "permissions.shell.allow",
        message: `shell allowlist includes a publish command; prefer approval-gated release flows: ${command}`
      });

      if (!approvals.has("release_publish")) {
        diagnostics.push({
          code: "missing-shell-publish-approval-gate",
          path: "permissions.approvals.requiredFor",
          message: `publish command is allowed without release_publish approval gating: ${command}`
        });
      }
    }

    if (looksLikeDependencyChangeCommand(normalized)) {
      diagnostics.push({
        code: "risky-shell-dependency-change-command",
        path: "permissions.shell.allow",
        message: `shell allowlist includes a dependency-changing command; prefer approval for dependency_change: ${command}`
      });

      if (!approvals.has("dependency_change")) {
        diagnostics.push({
          code: "missing-shell-dependency-change-approval-gate",
          path: "permissions.approvals.requiredFor",
          message: `dependency-changing command is allowed without dependency_change approval gating: ${command}`
        });
      }
    }

    if (looksLikeDestructiveShellCommand(normalized)) {
      diagnostics.push({
        code: "risky-shell-destructive-command",
        path: "permissions.shell.allow",
        message: `shell allowlist includes a destructive command; prefer approval for destructive_write: ${command}`
      });

      if (!approvals.has("destructive_write")) {
        diagnostics.push({
          code: "missing-shell-destructive-approval-gate",
          path: "permissions.approvals.requiredFor",
          message: `destructive command is allowed without destructive_write approval gating: ${command}`
        });
      }
    }
  }

  if (agentfile.permissions.network.default === "allow") {
    diagnostics.push({
      code: "risky-network-default-allow",
      path: "permissions.network.default",
      message: "broad network access is enabled; prefer deny plus explicit host allowlist"
    });
  }

  if (
    (agentfile.permissions.network.default === "allow" || agentfile.permissions.network.allow.length > 0) &&
    !approvals.has("network_access")
  ) {
    diagnostics.push({
      code: "missing-network-approval-gate",
      path: "permissions.approvals.requiredFor",
      message: "network access is allowed without network_access approval gating"
    });
  }

  if (
    agentfile.permissions.secrets.access === "allow" &&
    agentfile.permissions.secrets.allow.length === 0
  ) {
    diagnostics.push({
      code: "risky-secret-access-broad",
      path: "permissions.secrets.access",
      message: "secret access allows every secret; prefer a named secret allowlist"
    });
  }

  if (
    agentfile.permissions.secrets.access === "allow" &&
    !approvals.has("secret_access")
  ) {
    diagnostics.push({
      code: "missing-secret-approval-gate",
      path: "permissions.approvals.requiredFor",
      message: "secret access is allowed without secret_access approval gating"
    });
  }

  for (const path of agentfile.permissions.filesystem.read) {
    if (isRepoWidePattern(path)) {
      diagnostics.push({
        code: "risky-filesystem-read-broad",
        path: "permissions.filesystem.read",
        message: `filesystem read scope is repository-wide; prefer narrower read paths: ${path}`
      });
    }
  }

  for (const path of agentfile.permissions.filesystem.write) {
    if (isRepoWidePattern(path)) {
      diagnostics.push({
        code: "risky-filesystem-write-broad",
        path: "permissions.filesystem.write",
        message: `filesystem write scope is repository-wide; prefer narrower write paths: ${path}`
      });
    }
  }

  return diagnostics;
}
