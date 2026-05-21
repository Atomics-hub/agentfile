import type { ZodError } from "zod";
import type { Agentfile } from "./schema.js";

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

  for (const host of agentfile.permissions.network.allow) {
    if (looksLikeBroadNetworkHost(host)) {
      diagnostics.push({
        code: "risky-network-host-pattern",
        path: "permissions.network.allow",
        message: `network allowlist entry should be a bare host without wildcard, scheme, or path: ${host}`
      });
    }
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

  for (const secret of agentfile.permissions.secrets.allow) {
    if (secret.includes("*")) {
      diagnostics.push({
        code: "risky-secret-allow-pattern",
        path: "permissions.secrets.allow",
        message: `secret allowlist entry should name a concrete secret instead of a wildcard: ${secret}`
      });
    }
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

function looksLikeBroadNetworkHost(host: string): boolean {
  return host.includes("*") || host.includes("://") || host.includes("/");
}

function isRepoWidePattern(path: string): boolean {
  return path === "*" || path === "**" || path === "./**" || path === "/**";
}

function normalizeShellCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function looksLikePublishCommand(command: string): boolean {
  return /^(?:npm|pnpm|yarn|bun)\s+publish(?:\s|$)/.test(command);
}

function looksLikeDependencyChangeCommand(command: string): boolean {
  return /^(?:(?:npm|pnpm)\s+(?:install|i|add)|yarn\s+add|bun\s+add|pip3?\s+install|uv\s+add|poetry\s+add|cargo\s+add|go\s+get)(?:\s|$)/.test(command);
}

function looksLikeDestructiveShellCommand(command: string): boolean {
  return (
    /^rm\s+-rf(?:\s|$)/.test(command) ||
    /^git\s+reset\s+--hard(?:\s|$)/.test(command) ||
    /^git\s+clean(?:\s|$)/.test(command) && /(?:^|\s)-f/.test(command)
  );
}
