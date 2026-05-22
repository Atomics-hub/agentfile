export function normalizeShellCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

export function looksLikePublishCommand(command: string): boolean {
  return /^(?:npm|pnpm|yarn|bun)\s+publish(?:\s|$)/.test(command);
}

export function looksLikeDependencyChangeCommand(command: string): boolean {
  return /^(?:(?:npm|pnpm)\s+(?:install|i|add)|yarn\s+add|bun\s+add|pip3?\s+install|uv\s+add|poetry\s+add|cargo\s+add|go\s+get)(?:\s|$)/.test(command);
}

export function looksLikeDestructiveShellCommand(command: string): boolean {
  return (
    /^rm\s+-rf(?:\s|$)/.test(command) ||
    /^git\s+reset\s+--hard(?:\s|$)/.test(command) ||
    /^git\s+clean(?:\s|$)/.test(command) && /(?:^|\s)-f/.test(command)
  );
}

export function looksLikeBroadNetworkHost(host: string): boolean {
  return host.includes("*") || host.includes("://") || host.includes("/");
}

export function isWildcardSecret(secret: string): boolean {
  return secret.includes("*");
}

export function isRepoWidePattern(path: string): boolean {
  return path === "*" || path === "**" || path === "./**" || path === "/**";
}
