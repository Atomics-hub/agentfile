import { AgentfileError, formatZodError } from "./diagnostics.js";
import { parseAgentfile } from "./parser.js";
import { agentfileSchema, type Agentfile } from "./schema.js";

type Section = "mission" | "plan" | "prove" | "handoff";

export function parseSource(source: string, filePath?: string): Agentfile {
  if (filePath?.endsWith(".agent") || looksLikePact(source)) {
    return parsePactSource(source, filePath);
  }

  return parseAgentfile(source, filePath);
}

export function parsePactSource(source: string, filePath?: string): Agentfile {
  const lines = source.split(/\r?\n/);
  const sections: Section[] = [];
  const state = emptyState();

  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const raw = lines[index];
    const line = stripComment(raw).trim();

    if (line.length === 0) {
      continue;
    }

    if (line === "}") {
      const closed = sections.pop();
      if (!closed) {
        throw syntaxError("unexpected closing brace", filePath, lineNo);
      }
      continue;
    }

    if (sections.length === 0) {
      const match = line.match(/^mission\s+([a-z0-9][a-z0-9._-]*)\s*\{$/);
      if (!match) {
        throw syntaxError("expected mission declaration", filePath, lineNo);
      }
      state.id = match[1];
      sections.push("mission");
      continue;
    }

    const section = sections.at(-1);

    if (section === "mission") {
      parseMissionLine(line, state, sections, filePath, lineNo);
    } else if (section === "plan") {
      parsePlanLine(line, state, filePath, lineNo);
    } else if (section === "prove") {
      parseProveLine(line, state, filePath, lineNo);
    } else if (section === "handoff") {
      parseHandoffLine(line, state, filePath, lineNo);
    }
  }

  if (sections.length > 0) {
    throw new AgentfileError(`unclosed ${sections.at(-1)} block`, filePath);
  }

  validatePactState(state, filePath);

  const contract = agentfileSchema.safeParse({
    agentfile: "0.1.0",
    kind: "TaskContract",
    info: {
      title: state.id,
      version: "0.1.0",
      summary: state.goal
    },
    task: {
      id: state.id,
      goal: state.goal,
      background: state.background
    },
    scope: {
      include: state.touch,
      exclude: state.never
    },
    permissions: {
      shell: {
        allow: state.shellAllow,
        deny: state.shellDeny
      },
      network: {
        default: state.network,
        allow: state.networkAllow
      },
      filesystem: {
        read: state.touch,
        write: state.touch,
        deny: state.never
      },
      secrets: {
        access: state.secrets,
        allow: state.secretAllow
      },
      approvals: {
        requiredFor: state.approvals
      }
    },
    policies: state.policies,
    checks: state.checks,
    workflow: {
      id: "implement",
      steps: state.steps,
      acceptance: state.acceptance,
      review: state.review
    }
  });

  if (!contract.success) {
    throw new AgentfileError(formatZodError(contract.error), filePath);
  }

  return contract.data;
}

function parseMissionLine(
  line: string,
  state: PactState,
  sections: Section[],
  filePath: string | undefined,
  lineNo: number
): void {
  const goal = quotedArg(line, "goal");
  if (goal) {
    if (state.goalLine) {
      throw syntaxError("duplicate goal declaration", filePath, lineNo);
    }
    state.goal = goal;
    state.goalLine = lineNo;
    return;
  }

  const background = quotedArg(line, "background");
  if (background) {
    if (state.backgroundLine) {
      throw syntaxError("duplicate background declaration", filePath, lineNo);
    }
    state.background = background;
    state.backgroundLine = lineNo;
    return;
  }

  if (line.startsWith("touch ")) {
    state.touch.push(...parseList(line.slice("touch ".length)));
    return;
  }

  if (line.startsWith("never ")) {
    state.never.push(...parseList(line.slice("never ".length)));
    return;
  }

  const canRun = line.match(/^can\s+run\s+"([^"]+)"$/);
  if (canRun) {
    const command = canRun[1];
    if (state.shellDeny.includes(command)) {
      throw syntaxError(`conflicting shell policy for command: ${command}`, filePath, lineNo);
    }
    pushUnique(state.shellAllow, command);
    return;
  }

  const cannotRun = line.match(/^cannot\s+run\s+"([^"]+)"$/);
  if (cannotRun) {
    const command = cannotRun[1];
    if (state.shellAllow.includes(command)) {
      throw syntaxError(`conflicting shell policy for command: ${command}`, filePath, lineNo);
    }
    pushUnique(state.shellDeny, command);
    return;
  }

  if (line === "can use network") {
    if (state.networkAllow.length > 0) {
      throw syntaxError("conflicting network policy: already restricted to allowlisted hosts", filePath, lineNo);
    }
    ensureCapabilityConsistency(
      state.networkSpecified,
      state.network,
      "allow",
      "network policy",
      filePath,
      lineNo
    );
    state.network = "allow";
    state.networkSpecified = true;
    return;
  }

  if (line === "cannot use network") {
    if (state.networkAllow.length > 0) {
      throw syntaxError("conflicting network policy: already allowlisted hosts", filePath, lineNo);
    }
    ensureCapabilityConsistency(
      state.networkSpecified,
      state.network,
      "deny",
      "network policy",
      filePath,
      lineNo
    );
    state.network = "deny";
    state.networkSpecified = true;
    ensureApproval(state, "network_access");
    return;
  }

  const canUseNetworkHost = line.match(/^can\s+use\s+network\s+host\s+"([^"]+)"$/);
  if (canUseNetworkHost) {
    if (state.networkSpecified) {
      throw syntaxError(`conflicting network policy: already ${state.network}`, filePath, lineNo);
    }
    pushUnique(state.networkAllow, canUseNetworkHost[1]);
    return;
  }

  if (line === "can read secrets") {
    ensureCapabilityConsistency(
      state.secretsSpecified,
      state.secrets,
      "allow",
      "secrets policy",
      filePath,
      lineNo
    );
    state.secrets = "allow";
    state.secretsSpecified = true;
    return;
  }

  const canReadSecret = line.match(/^can\s+read\s+secret\s+"([^"]+)"$/);
  if (canReadSecret) {
    ensureCapabilityConsistency(
      state.secretsSpecified,
      state.secrets,
      "allow",
      "secrets policy",
      filePath,
      lineNo
    );
    state.secrets = "allow";
    state.secretsSpecified = true;
    pushUnique(state.secretAllow, canReadSecret[1]);
    return;
  }

  if (line === "cannot read secrets") {
    ensureCapabilityConsistency(
      state.secretsSpecified,
      state.secrets,
      "deny",
      "secrets policy",
      filePath,
      lineNo
    );
    state.secrets = "deny";
    state.secretsSpecified = true;
    return;
  }

  if (line === "cannot add dependency") {
    state.policies.push({
      id: "no-dependency-change",
      level: "must_not",
      appliesTo: [],
      statement: "New runtime dependencies may not be added."
    });
    ensureApproval(state, "dependency_change");
    return;
  }

  const mustPreserve = line.match(/^must\s+preserve\s+"([^"]+)"$/);
  if (mustPreserve) {
    state.policies.push({
      id: slug(`preserve-${mustPreserve[1]}`),
      level: "must",
      appliesTo: [],
      statement: `${mustPreserve[1]} must be preserved.`
    });
    return;
  }

  const mustNotLeak = line.match(/^must_not\s+leak\s+"([^"]+)"$/);
  if (mustNotLeak) {
    state.policies.push({
      id: slug(`no-${mustNotLeak[1]}-leak`),
      level: "must_not",
      appliesTo: [],
      statement: `${mustNotLeak[1]} must not be leaked.`
    });
    return;
  }

  if (line === "prove {") {
    sections.push("prove");
    return;
  }

  if (line === "plan {") {
    sections.push("plan");
    return;
  }

  if (line === "handoff {") {
    sections.push("handoff");
    return;
  }

  throw syntaxError(`unexpected mission line: ${line}`, filePath, lineNo);
}

function parsePlanLine(
  line: string,
  state: PactState,
  filePath: string | undefined,
  lineNo: number
): void {
  const step = quotedArg(line, "step");
  if (step) {
    state.steps.push({
      id: nextStepId(state.steps, step),
      do: step
    });
    return;
  }

  throw syntaxError(`unexpected plan line: ${line}`, filePath, lineNo);
}

function parseProveLine(
  line: string,
  state: PactState,
  filePath: string | undefined,
  lineNo: number
): void {
  const run = line.match(/^run\s+"([^"]+)"$/);
  if (run) {
    const command = run[1];
    if (state.shellDeny.includes(command)) {
      throw syntaxError(`proof command is denied by shell policy: ${command}`, filePath, lineNo);
    }
    if (!state.shellAllow.includes(command)) {
      pushUnique(state.shellAllow, command);
    }
    state.checks.push({
      id: slug(command),
      command,
      required: true
    });
    return;
  }

  const expect = quotedArg(line, "expect");
  if (expect) {
    state.acceptance.push(expect);
    return;
  }

  throw syntaxError(`unexpected prove line: ${line}`, filePath, lineNo);
}

function parseHandoffLine(
  line: string,
  state: PactState,
  filePath: string | undefined,
  lineNo: number
): void {
  const explain = quotedArg(line, "explain");
  if (explain) {
    state.review.push(`Explain ${explain}.`);
    return;
  }

  throw syntaxError(`unexpected handoff line: ${line}`, filePath, lineNo);
}

function emptyState(): PactState {
  return {
    id: "untitled",
    goal: "",
    touch: [],
    never: [],
    shellAllow: [],
    shellDeny: [],
    network: "deny",
    networkSpecified: false,
    networkAllow: [],
    secrets: "deny",
    secretsSpecified: false,
    secretAllow: [],
    approvals: ["dependency_change", "network_access", "scope_expansion"],
    policies: [],
    checks: [],
    steps: [],
    acceptance: [],
    review: []
  };
}

interface PactState {
  id: string;
  goal: string;
  goalLine?: number;
  background?: string;
  backgroundLine?: number;
  touch: string[];
  never: string[];
  shellAllow: string[];
  shellDeny: string[];
  network: "allow" | "deny";
  networkSpecified: boolean;
  networkAllow: string[];
  secrets: "allow" | "deny";
  secretsSpecified: boolean;
  secretAllow: string[];
  approvals: string[];
  policies: Agentfile["policies"];
  checks: Agentfile["checks"];
  steps: Agentfile["workflow"]["steps"];
  acceptance: string[];
  review: string[];
}

function validatePactState(state: PactState, filePath?: string): void {
  if (!state.goalLine) {
    throw new AgentfileError("mission requires a goal declaration", filePath);
  }

  if (state.touch.length === 0) {
    throw new AgentfileError("mission must declare at least one touch path", filePath);
  }
}

function parseList(source: string): string[] {
  return source
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function quotedArg(line: string, keyword: string): string | undefined {
  const match = line.match(new RegExp(`^${keyword}\\s+"([^"]+)"$`));
  return match?.[1];
}

function ensureApproval(state: PactState, approval: string): void {
  if (!state.approvals.includes(approval)) {
    state.approvals.push(approval);
  }
}

function ensureCapabilityConsistency(
  specified: boolean,
  current: "allow" | "deny",
  next: "allow" | "deny",
  label: string,
  filePath: string | undefined,
  lineNo: number
): void {
  if (specified && current !== next) {
    throw syntaxError(`conflicting ${label}: already ${current}`, filePath, lineNo);
  }
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextStepId(steps: Agentfile["workflow"]["steps"], description: string): string {
  const base = slug(description) || "step";
  const matching = steps.filter((step) => step.id === base || step.id.startsWith(`${base}-`)).length;
  return matching === 0 ? base : `${base}-${matching + 1}`;
}

function stripComment(line: string): string {
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      inString = !inString;
    }
    if (char === "#" && !inString) {
      return line.slice(0, index);
    }
  }
  return line;
}

function looksLikePact(source: string): boolean {
  return /^\s*mission\s+[a-z0-9][a-z0-9._-]*\s*\{/m.test(source);
}

function syntaxError(message: string, filePath: string | undefined, lineNo: number): AgentfileError {
  return new AgentfileError(`${lineNo}: ${message}`, filePath);
}
