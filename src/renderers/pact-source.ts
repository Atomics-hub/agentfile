import { AgentfileError } from "../diagnostics.js";
import type { Agentfile } from "../schema.js";

export function compileAgentSource(agentfile: Agentfile): string {
  ensurePactRepresentable(agentfile);
  const lines = [`mission ${agentfile.task.id} {`];
  const writesMatchReads =
    agentfile.permissions.filesystem.write.length > 0 &&
    agentfile.permissions.filesystem.write.length === agentfile.permissions.filesystem.read.length &&
    agentfile.permissions.filesystem.write.every(
      (path, index) => path === agentfile.permissions.filesystem.read[index]
    );
  const touchPaths = writesMatchReads
    ? agentfile.permissions.filesystem.write
    : [];
  const readOnlyPaths = writesMatchReads
    ? []
    : agentfile.permissions.filesystem.read.filter(
        (path) => !agentfile.permissions.filesystem.write.includes(path)
      );
  const sharedNeverPaths = agentfile.scope.exclude.filter(
    (path) => agentfile.permissions.filesystem.deny.includes(path)
  );
  const excludeOnlyPaths = agentfile.scope.exclude.filter(
    (path) => !agentfile.permissions.filesystem.deny.includes(path)
  );
  const denyOnlyPaths = agentfile.permissions.filesystem.deny.filter(
    (path) => !agentfile.scope.exclude.includes(path)
  );
  const proofCommands = new Set(
    agentfile.checks
      .filter((check) => check.command)
      .map((check) => check.command as string)
  );
  const shellAllow = agentfile.permissions.shell.allow.filter((command) => !proofCommands.has(command));

  lines.push(`  goal ${quoteAgentString(agentfile.task.goal)}`);

  if (agentfile.info.summary) {
    lines.push(`  summary ${quoteAgentString(agentfile.info.summary)}`);
  }

  if (agentfile.task.background) {
    lines.push(`  background ${quoteAgentString(agentfile.task.background)}`);
  }

  for (const owner of agentfile.info.owners) {
    lines.push(`  owner ${quoteAgentString(owner)}`);
  }

  for (const label of agentfile.info.labels) {
    lines.push(`  label ${quoteAgentString(label)}`);
  }

  if (
    agentfile.info.summary ||
    agentfile.task.background ||
    agentfile.info.owners.length > 0 ||
    agentfile.info.labels.length > 0
  ) {
    lines.push("");
  }

  if (readOnlyPaths.length > 0) {
    lines.push(`  read ${readOnlyPaths.join(", ")}`);
  }

  if (touchPaths.length > 0) {
    lines.push(`  touch ${touchPaths.join(", ")}`);
  } else if (agentfile.permissions.filesystem.write.length > 0) {
    lines.push(`  write ${agentfile.permissions.filesystem.write.join(", ")}`);
  }

  if (sharedNeverPaths.length > 0) {
    lines.push(`  never ${sharedNeverPaths.join(", ")}`);
  }

  if (excludeOnlyPaths.length > 0) {
    lines.push(`  exclude ${excludeOnlyPaths.join(", ")}`);
  }

  if (denyOnlyPaths.length > 0) {
    lines.push(`  deny ${denyOnlyPaths.join(", ")}`);
  }

  if (
    readOnlyPaths.length > 0 ||
    touchPaths.length > 0 ||
    agentfile.permissions.filesystem.write.length > 0 ||
    sharedNeverPaths.length > 0 ||
    excludeOnlyPaths.length > 0 ||
    denyOnlyPaths.length > 0
  ) {
    lines.push("");
  }

  for (const command of shellAllow) {
    lines.push(`  can run ${quoteAgentString(command)}`);
  }

  for (const command of agentfile.permissions.shell.deny) {
    lines.push(`  cannot run ${quoteAgentString(command)}`);
  }

  if (agentfile.permissions.network.default === "allow") {
    lines.push("  can use network");
  } else {
    if (agentfile.permissions.network.allow.length === 0) {
      lines.push("  cannot use network");
    } else {
      for (const host of agentfile.permissions.network.allow) {
        lines.push(`  can use network host ${quoteAgentString(host)}`);
      }
    }
  }

  if (agentfile.permissions.secrets.access === "allow") {
    if (agentfile.permissions.secrets.allow.length === 0) {
      lines.push("  can read secrets");
    } else {
      for (const secret of agentfile.permissions.secrets.allow) {
        lines.push(`  can read secret ${quoteAgentString(secret)}`);
      }
    }
  } else {
    lines.push("  cannot read secrets");
  }

  if (rendersNoDependencyChange(agentfile)) {
    lines.push("  cannot add dependency");
  }

  if (agentfile.permissions.approvals.requiredFor.length > 0) {
    lines.push(`  ask approval for ${agentfile.permissions.approvals.requiredFor.join(", ")}`);
  }

  const renderedPolicies = agentfile.policies.filter((policy) => !isNoDependencyChangePolicy(policy));
  for (const policy of renderedPolicies) {
    lines.push(`  ${renderPolicy(policy)}`);
  }

  if (
    shellAllow.length > 0 ||
    agentfile.permissions.shell.deny.length > 0 ||
    agentfile.permissions.network.default === "allow" ||
    agentfile.permissions.network.allow.length > 0 ||
    agentfile.permissions.secrets.access === "allow" ||
    rendersNoDependencyChange(agentfile) ||
    agentfile.permissions.approvals.requiredFor.length > 0 ||
    renderedPolicies.length > 0
  ) {
    lines.push("");
  }

  if (agentfile.workflow.steps.length > 0) {
    lines.push("  plan {");
    for (const step of agentfile.workflow.steps) {
      lines.push(`    step ${quoteAgentString(step.do)}`);
    }
    lines.push("  }", "");
  }

  if (agentfile.checks.length > 0 || agentfile.workflow.acceptance.length > 0) {
    lines.push("  prove {");
    for (const check of agentfile.checks) {
      if (check.command) {
        lines.push(`    ${check.required ? "run" : "run optional"} ${quoteAgentString(check.command)}`);
        continue;
      }

      lines.push(`    ${check.required ? "check" : "check optional"} ${quoteAgentString(check.description as string)}`);
    }
    for (const item of agentfile.workflow.acceptance) {
      lines.push(`    expect ${quoteAgentString(item)}`);
    }
    lines.push("  }", "");
  }

  if (agentfile.workflow.review.length > 0) {
    lines.push("  handoff {");
    for (const item of agentfile.workflow.review) {
      lines.push(`    ${renderReviewLine(item)}`);
    }
    lines.push("  }");
  } else if (lines.at(-1) === "") {
    lines.pop();
  }

  lines.push("}");

  return `${lines.join("\n")}\n`;
}

function ensurePactRepresentable(agentfile: Agentfile): void {
  const unreadableScopePath = agentfile.scope.include.find(
    (path) => !agentfile.permissions.filesystem.read.includes(path)
  );

  if (unreadableScopePath) {
    throw new AgentfileError(
      `cannot compile target "agent": scope.include path must appear in permissions.filesystem.read to render Pact source: ${unreadableScopePath}`
    );
  }
}

function quoteAgentString(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")}"`;
}

function renderPolicy(policy: Agentfile["policies"][number]): string {
  const preserveTarget = renderPreservePolicy(policy);
  if (preserveTarget) {
    return `must preserve ${quoteAgentString(preserveTarget)}${renderPolicyTargets(policy.appliesTo)}`;
  }

  const leakTarget = renderLeakPolicy(policy);
  if (leakTarget) {
    return `must_not leak ${quoteAgentString(leakTarget)}${renderPolicyTargets(policy.appliesTo)}`;
  }

  return `${policy.level} ${quoteAgentString(policy.statement)}${renderPolicyTargets(policy.appliesTo)}`;
}

function renderPolicyTargets(appliesTo: string[]): string {
  const rendered = appliesTo.length > 0
    ? ` for ${appliesTo.join(", ")}`
    : "";

  return rendered;
}

function renderReviewLine(item: string): string {
  if (item === "List changed files.") {
    return "list changed_files";
  }

  const explain = item.match(/^Explain (.+)\.$/u);
  if (explain) {
    return `explain ${quoteAgentString(explain[1])}`;
  }

  const note = item.match(/^Note (.+)\.$/u);
  if (note) {
    return `note ${quoteAgentString(note[1])}`;
  }

  return `note ${quoteAgentString(item.replace(/[.!?]+$/u, ""))}`;
}

function rendersNoDependencyChange(agentfile: Agentfile): boolean {
  return agentfile.policies.some((policy) => isNoDependencyChangePolicy(policy));
}

function isNoDependencyChangePolicy(policy: Agentfile["policies"][number]): boolean {
  return (
    policy.id === "no-dependency-change" &&
    policy.level === "must_not" &&
    policy.appliesTo.length === 0 &&
    policy.statement === "New runtime dependencies may not be added."
  );
}

function renderPreservePolicy(policy: Agentfile["policies"][number]): string | undefined {
  const match = policy.statement.match(/^(.+) must be preserved\.$/u);
  if (!match || policy.level !== "must") {
    return undefined;
  }

  const base = `preserve-${slug(policy.statement)}`;
  if (policy.id !== base && !policy.id.startsWith(`${base}-`)) {
    return undefined;
  }

  return match[1];
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderLeakPolicy(policy: Agentfile["policies"][number]): string | undefined {
  const match = policy.statement.match(/^(.+) must not be leaked\.$/u);
  if (!match || policy.level !== "must_not") {
    return undefined;
  }

  const base = `no-${slug(policy.statement)}`;
  if (policy.id !== base && !policy.id.startsWith(`${base}-`)) {
    return undefined;
  }

  return match[1];
}
