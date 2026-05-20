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
      if (closed === "mission") {
        state.missionClosed = true;
      }
      continue;
    }

    if (sections.length === 0) {
      const match = line.match(/^mission\s+([a-z0-9][a-z0-9._-]*)\s*\{$/);
      if (match && state.missionStarted) {
        throw syntaxError("source may only declare one mission", filePath, lineNo);
      }
      if (state.missionClosed) {
        throw syntaxError("unexpected content after mission block", filePath, lineNo);
      }
      if (!match) {
        throw syntaxError("expected mission declaration", filePath, lineNo);
      }
      state.id = match[1];
      state.missionStarted = true;
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
    addScopePaths(state.touch, state.never, parseList(line.slice("touch ".length)), filePath, lineNo);
    return;
  }

  if (line.startsWith("never ")) {
    addScopePaths(state.never, state.touch, parseList(line.slice("never ".length)), filePath, lineNo);
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

  const askApproval = line.match(/^ask\s+approval\s+for\s+(.+)$/);
  if (askApproval) {
    for (const approval of parseApprovalList(askApproval[1], filePath, lineNo)) {
      ensureApproval(state, approval);
    }
    return;
  }

  const genericPolicy = line.match(/^(must|must_not|should|may)\s+"([^"]+)"$/);
  if (genericPolicy) {
    const [, level, statement] = genericPolicy;
    appendPolicy(state, level as Agentfile["policies"][number]["level"], statement);
    return;
  }

  const mustPreserve = line.match(/^must\s+preserve\s+"([^"]+)"$/);
  if (mustPreserve) {
    appendPolicy(state, "must", `${mustPreserve[1]} must be preserved.`, "preserve");
    return;
  }

  const mustNotLeak = line.match(/^must_not\s+leak\s+"([^"]+)"$/);
  if (mustNotLeak) {
    appendPolicy(state, "must_not", `${mustNotLeak[1]} must not be leaked.`, "no");
    return;
  }

  if (line === "prove {") {
    ensureSectionLine(state.proveLine, "prove", filePath, lineNo);
    state.proveLine = lineNo;
    sections.push("prove");
    return;
  }

  if (line === "plan {") {
    ensureSectionLine(state.planLine, "plan", filePath, lineNo);
    state.planLine = lineNo;
    sections.push("plan");
    return;
  }

  if (line === "handoff {") {
    ensureSectionLine(state.handoffLine, "handoff", filePath, lineNo);
    state.handoffLine = lineNo;
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
    if (state.checks.some((check) => check.command === command)) {
      throw syntaxError(`duplicate proof command: ${command}`, filePath, lineNo);
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
    state.review.push(reviewSentence("Explain", explain));
    return;
  }

  const list = line.match(/^list\s+([a-z0-9][a-z0-9._-]*)$/);
  if (list) {
    if (list[1] === "changed_files") {
      state.review.push("List changed files.");
      return;
    }

    throw syntaxError(`unsupported handoff list target: ${list[1]}`, filePath, lineNo);
  }

  const note = trailingArg(line, "note");
  if (note) {
    state.review.push(reviewSentence("Note", note));
    return;
  }

  throw syntaxError(`unexpected handoff line: ${line}`, filePath, lineNo);
}

function emptyState(): PactState {
  return {
    id: "untitled",
    goal: "",
    missionStarted: false,
    missionClosed: false,
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
  missionStarted: boolean;
  missionClosed: boolean;
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
  planLine?: number;
  proveLine?: number;
  handoffLine?: number;
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

function parseApprovalList(source: string, filePath: string | undefined, lineNo: number): string[] {
  const approvals = parseList(source);

  for (const approval of approvals) {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(approval)) {
      throw syntaxError(`invalid approval identifier: ${approval}`, filePath, lineNo);
    }
  }

  return approvals;
}

function addScopePaths(
  target: string[],
  opposite: string[],
  values: string[],
  filePath: string | undefined,
  lineNo: number
): void {
  for (const value of values) {
    if (opposite.includes(value)) {
      throw syntaxError(`scope path cannot appear in both touch and never: ${value}`, filePath, lineNo);
    }
    pushUnique(target, value);
  }
}

function quotedArg(line: string, keyword: string): string | undefined {
  const match = line.match(new RegExp(`^${keyword}\\s+"([^"]+)"$`));
  return match?.[1];
}

function trailingArg(line: string, keyword: string): string | undefined {
  const match = line.match(new RegExp(`^${keyword}\\s+(.+)$`));
  if (!match) {
    return undefined;
  }

  const value = match[1].trim();
  const quoted = value.match(/^"([^"]+)"$/);
  return quoted?.[1] ?? value;
}

function ensureApproval(state: PactState, approval: string): void {
  if (!state.approvals.includes(approval)) {
    state.approvals.push(approval);
  }
}

function ensureSectionLine(
  existingLine: number | undefined,
  section: Section,
  filePath: string | undefined,
  lineNo: number
): void {
  if (existingLine) {
    throw syntaxError(`duplicate ${section} block`, filePath, lineNo);
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

function appendPolicy(
  state: PactState,
  level: Agentfile["policies"][number]["level"],
  statement: string,
  prefix?: string
): void {
  state.policies.push({
    id: nextGeneratedId(state.policies, `${prefix ? `${prefix}-` : ""}${statement}`, "policy"),
    level,
    appliesTo: [],
    statement
  });
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

function nextGeneratedId(
  values: Array<{ id: string }>,
  seed: string,
  fallback: string
): string {
  const base = slug(seed) || fallback;
  const matching = values.filter((value) => value.id === base || value.id.startsWith(`${base}-`)).length;
  return matching === 0 ? base : `${base}-${matching + 1}`;
}

function reviewSentence(verb: string, detail: string): string {
  return `${verb} ${detail.replace(/[.!?]+$/u, "")}.`;
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
