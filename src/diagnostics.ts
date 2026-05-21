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

  for (const path of agentfile.scope.include) {
    if (isRepoWidePattern(path)) {
      diagnostics.push({
        code: "risky-scope-include-broad",
        path: "scope.include",
        message: `mission scope includes the entire repository; prefer narrower include paths: ${path}`
      });
    }
  }

  if (agentfile.permissions.network.default === "allow") {
    diagnostics.push({
      code: "risky-network-default-allow",
      path: "permissions.network.default",
      message: "broad network access is enabled; prefer deny plus explicit host allowlist"
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
