import { AgentfileError, formatZodError } from "./diagnostics.js";
import { parseAgentfile } from "./parser.js";
import {
  isWildcardSecret,
  looksLikeBroadNetworkHost,
  looksLikeDependencyChangeCommand,
  looksLikeDestructiveShellCommand,
  looksLikePublishCommand,
  normalizeShellCommand
} from "./risk.js";
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
      summary: state.summary ?? state.goal,
      owners: state.owners,
      labels: state.labels
    },
    task: {
      id: state.id,
      goal: state.goal,
      background: state.background
    },
    scope: {
      include: state.read,
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
        read: state.read,
        write: state.write,
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
  const goal = quotedArg(line, "goal", filePath, lineNo);
  if (goal !== undefined) {
    if (state.goalLine) {
      throw syntaxError("duplicate goal declaration", filePath, lineNo);
    }
    state.goal = requireNonEmptyText(goal, "goal", filePath, lineNo);
    state.goalLine = lineNo;
    return;
  }

  const summary = quotedArg(line, "summary", filePath, lineNo);
  if (summary !== undefined) {
    if (state.summaryLine) {
      throw syntaxError("duplicate summary declaration", filePath, lineNo);
    }
    state.summary = requireNonEmptyText(summary, "summary", filePath, lineNo);
    state.summaryLine = lineNo;
    return;
  }

  const background = quotedArg(line, "background", filePath, lineNo);
  if (background !== undefined) {
    if (state.backgroundLine) {
      throw syntaxError("duplicate background declaration", filePath, lineNo);
    }
    state.background = requireNonEmptyText(background, "background", filePath, lineNo);
    state.backgroundLine = lineNo;
    return;
  }

  const owner = trailingArg(line, "owner", filePath, lineNo);
  if (owner !== undefined) {
    pushUnique(state.owners, requireNonEmptyText(owner, "owner", filePath, lineNo));
    return;
  }

  const label = trailingArg(line, "label", filePath, lineNo);
  if (label !== undefined) {
    pushUnique(state.labels, requireNonEmptyText(label, "label", filePath, lineNo));
    return;
  }

  const touchPaths = listDirective(line, "touch", "path", filePath, lineNo);
  if (touchPaths !== undefined) {
    addTouchPaths(
      state,
      touchPaths,
      filePath,
      lineNo
    );
    return;
  }

  const readPaths = listDirective(line, "read", "path", filePath, lineNo);
  if (readPaths !== undefined) {
    addScopedPaths(
      state.read,
      state.never,
      readPaths,
      filePath,
      lineNo
    );
    return;
  }

  const writePaths = listDirective(line, "write", "path", filePath, lineNo);
  if (writePaths !== undefined) {
    addWritePaths(
      state,
      writePaths,
      filePath,
      lineNo
    );
    return;
  }

  const neverPaths = listDirective(line, "never", "path", filePath, lineNo);
  if (neverPaths !== undefined) {
    addNeverPaths(
      state,
      neverPaths,
      filePath,
      lineNo
    );
    return;
  }

  const canRun = quotedArg(line, "can run", filePath, lineNo);
  if (canRun !== undefined) {
    const command = requireNonEmptyText(canRun, "can run", filePath, lineNo);
    if (state.shellDeny.includes(command)) {
      throw syntaxError(`conflicting shell policy for command: ${command}`, filePath, lineNo);
    }
    pushUnique(state.shellAllow, command);
    ensureCommandApprovals(state, command);
    return;
  }

  const cannotRun = quotedArg(line, "cannot run", filePath, lineNo);
  if (cannotRun !== undefined) {
    const command = requireNonEmptyText(cannotRun, "cannot run", filePath, lineNo);
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

  const canUseNetworkHost = quotedArg(line, "can use network host", filePath, lineNo);
  if (canUseNetworkHost !== undefined) {
    if (state.networkSpecified) {
      throw syntaxError(`conflicting network policy: already ${state.network}`, filePath, lineNo);
    }
    const host = requireNonEmptyText(canUseNetworkHost, "can use network host", filePath, lineNo);
    if (looksLikeBroadNetworkHost(host)) {
      throw syntaxError(
        `network host must be a bare host without wildcard, scheme, or path: ${host}`,
        filePath,
        lineNo
      );
    }
    pushUnique(
      state.networkAllow,
      host
    );
    return;
  }

  if (line === "can read secrets") {
    if (state.secretAllow.length > 0) {
      throw syntaxError(
        "conflicting secrets policy: already restricted to named secrets",
        filePath,
        lineNo
      );
    }
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
    state.secretsAllAllowed = true;
    ensureApproval(state, "secret_access");
    return;
  }

  const canReadSecret = quotedArg(line, "can read secret", filePath, lineNo);
  if (canReadSecret !== undefined) {
    if (state.secretsAllAllowed) {
      throw syntaxError(
        "conflicting secrets policy: already allows every secret",
        filePath,
        lineNo
      );
    }
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
    const secret = requireNonEmptyText(canReadSecret, "can read secret", filePath, lineNo);
    if (isWildcardSecret(secret)) {
      throw syntaxError(
        `secret name must be concrete and may not include wildcard: ${secret}`,
        filePath,
        lineNo
      );
    }
    pushUnique(state.secretAllow, secret);
    ensureApproval(state, "secret_access");
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

  const approvals = approvalDirective(line, filePath, lineNo);
  if (approvals !== undefined) {
    for (const approval of approvals) {
      ensureApproval(state, approval);
    }
    return;
  }

  const mustPreserve = policyDirective(line, "must preserve", filePath, lineNo);
  if (mustPreserve !== undefined) {
    const statement = requireNonEmptyText(mustPreserve.value, "must preserve", filePath, lineNo);
    appendPolicy(
      state,
      "must",
      `${statement} must be preserved.`,
      "preserve",
      mustPreserve.appliesTo
    );
    return;
  }

  const mustNotLeak = policyDirective(line, "must_not leak", filePath, lineNo);
  if (mustNotLeak !== undefined) {
    const statement = requireNonEmptyText(mustNotLeak.value, "must_not leak", filePath, lineNo);
    appendPolicy(
      state,
      "must_not",
      `${statement} must not be leaked.`,
      "no",
      mustNotLeak.appliesTo
    );
    return;
  }

  const genericPolicy = policyKeywordDirective(
    line,
    ["must", "must_not", "should", "may"],
    filePath,
    lineNo
  );
  if (genericPolicy) {
    const { keyword: level, value } = genericPolicy;
    const statement = requireNonEmptyText(value, level, filePath, lineNo);
    appendPolicy(
      state,
      level as Agentfile["policies"][number]["level"],
      statement,
      undefined,
      genericPolicy.appliesTo
    );
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
  const step = quotedArg(line, "step", filePath, lineNo);
  if (step !== undefined) {
    const description = requireNonEmptyText(step, "step", filePath, lineNo);
    state.steps.push({
      id: nextStepId(state.steps, description),
      do: description
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
  const runOptional = quotedArg(line, "run optional", filePath, lineNo);
  if (runOptional !== undefined) {
    const command = requireNonEmptyText(runOptional, "run optional", filePath, lineNo);
    if (state.shellDeny.includes(command)) {
      throw syntaxError(`proof command is denied by shell policy: ${command}`, filePath, lineNo);
    }
    if (state.checks.some((check) => check.command === command)) {
      throw syntaxError(`duplicate proof command: ${command}`, filePath, lineNo);
    }
    if (!state.shellAllow.includes(command)) {
      pushUnique(state.shellAllow, command);
    }
    ensureCommandApprovals(state, command);
    state.checks.push({
      id: slug(command),
      command,
      required: false
    });
    return;
  }

  const runRequired = quotedArg(line, "run", filePath, lineNo);
  if (runRequired !== undefined) {
    const command = requireNonEmptyText(runRequired, "run", filePath, lineNo);
    if (state.shellDeny.includes(command)) {
      throw syntaxError(`proof command is denied by shell policy: ${command}`, filePath, lineNo);
    }
    if (state.checks.some((check) => check.command === command)) {
      throw syntaxError(`duplicate proof command: ${command}`, filePath, lineNo);
    }
    if (!state.shellAllow.includes(command)) {
      pushUnique(state.shellAllow, command);
    }
    ensureCommandApprovals(state, command);
    state.checks.push({
      id: slug(command),
      command,
      required: true
    });
    return;
  }

  const checkOptional = quotedArg(line, "check optional", filePath, lineNo);
  if (checkOptional !== undefined) {
    const description = requireNonEmptyText(checkOptional, "check optional", filePath, lineNo);
    if (state.checks.some((proofCheck) => proofCheck.description === description)) {
      throw syntaxError(`duplicate proof check: ${description}`, filePath, lineNo);
    }
    state.checks.push({
      id: nextGeneratedId(state.checks, description, "check"),
      description,
      required: false
    });
    return;
  }

  const checkRequired = quotedArg(line, "check", filePath, lineNo);
  if (checkRequired !== undefined) {
    const description = requireNonEmptyText(checkRequired, "check", filePath, lineNo);
    if (state.checks.some((proofCheck) => proofCheck.description === description)) {
      throw syntaxError(`duplicate proof check: ${description}`, filePath, lineNo);
    }
    state.checks.push({
      id: nextGeneratedId(state.checks, description, "check"),
      description,
      required: true
    });
    return;
  }

  const expect = quotedArg(line, "expect", filePath, lineNo);
  if (expect !== undefined) {
    state.acceptance.push(requireNonEmptyText(expect, "expect", filePath, lineNo));
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
  const explain = quotedArg(line, "explain", filePath, lineNo);
  if (explain !== undefined) {
    state.review.push(reviewSentence("Explain", requireNonEmptyText(explain, "explain", filePath, lineNo)));
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

  const note = trailingArg(line, "note", filePath, lineNo);
  if (note !== undefined) {
    state.review.push(reviewSentence("Note", requireNonEmptyText(note, "note", filePath, lineNo)));
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
    owners: [],
    labels: [],
    read: [],
    write: [],
    never: [],
    shellAllow: [],
    shellDeny: [],
    network: "deny",
    networkSpecified: false,
    networkAllow: [],
    secrets: "deny",
    secretsSpecified: false,
    secretsAllAllowed: false,
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
  summary?: string;
  summaryLine?: number;
  background?: string;
  backgroundLine?: number;
  owners: string[];
  labels: string[];
  read: string[];
  write: string[];
  never: string[];
  shellAllow: string[];
  shellDeny: string[];
  network: "allow" | "deny";
  networkSpecified: boolean;
  networkAllow: string[];
  secrets: "allow" | "deny";
  secretsSpecified: boolean;
  secretsAllAllowed: boolean;
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

  if (state.read.length === 0) {
    throw new AgentfileError("mission must declare at least one read, write, or touch path", filePath);
  }
}

function parseApprovalList(source: string, filePath: string | undefined, lineNo: number): string[] {
  const approvals = parseDelimitedList(
    source,
    "ask approval for",
    "approval identifier",
    filePath,
    lineNo
  );

  for (const approval of approvals) {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(approval)) {
      throw syntaxError(`invalid approval identifier: ${approval}`, filePath, lineNo);
    }
  }

  return approvals;
}

function listDirective(
  line: string,
  keyword: string,
  itemLabel: string,
  filePath: string | undefined,
  lineNo: number
): string[] | undefined {
  if (line === keyword) {
    return parseDelimitedList("", keyword, itemLabel, filePath, lineNo);
  }

  const prefix = `${keyword} `;
  if (!line.startsWith(prefix)) {
    return undefined;
  }

  return parseDelimitedList(line.slice(prefix.length), keyword, itemLabel, filePath, lineNo);
}

function approvalDirective(
  line: string,
  filePath: string | undefined,
  lineNo: number
): string[] | undefined {
  const keyword = "ask approval for";
  if (line === keyword) {
    return parseApprovalList("", filePath, lineNo);
  }

  const prefix = `${keyword} `;
  if (!line.startsWith(prefix)) {
    return undefined;
  }

  return parseApprovalList(line.slice(prefix.length), filePath, lineNo);
}

function parseDelimitedList(
  source: string,
  keyword: string,
  itemLabel: string,
  filePath: string | undefined,
  lineNo: number
): string[] {
  const items = source.split(",");
  const values: string[] = [];

  for (const item of items) {
    const value = item.trim();
    if (value.length === 0) {
      if (values.length === 0 && items.every((candidate) => candidate.trim().length === 0)) {
        throw syntaxError(`${keyword} requires at least one ${itemLabel}`, filePath, lineNo);
      }

      throw syntaxError(`${keyword} contains an empty ${itemLabel}`, filePath, lineNo);
    }

    values.push(value);
  }

  return values;
}

function addScopedPaths(
  target: string[],
  denied: string[],
  values: string[],
  filePath: string | undefined,
  lineNo: number
): void {
  for (const value of values) {
    if (denied.includes(value)) {
      throw syntaxError(
        `scope path cannot appear in both read/write/touch and never: ${value}`,
        filePath,
        lineNo
      );
    }
    pushUnique(target, value);
  }
}

function addTouchPaths(
  state: PactState,
  values: string[],
  filePath: string | undefined,
  lineNo: number
): void {
  addScopedPaths(state.read, state.never, values, filePath, lineNo);
  addScopedPaths(state.write, state.never, values, filePath, lineNo);
}

function addWritePaths(
  state: PactState,
  values: string[],
  filePath: string | undefined,
  lineNo: number
): void {
  addScopedPaths(state.read, state.never, values, filePath, lineNo);
  addScopedPaths(state.write, state.never, values, filePath, lineNo);
}

function addNeverPaths(
  state: PactState,
  values: string[],
  filePath: string | undefined,
  lineNo: number
): void {
  for (const value of values) {
    if (state.read.includes(value) || state.write.includes(value)) {
      throw syntaxError(
        `scope path cannot appear in both read/write/touch and never: ${value}`,
        filePath,
        lineNo
      );
    }
    pushUnique(state.never, value);
  }
}

function quotedArg(
  line: string,
  keyword: string,
  filePath: string | undefined,
  lineNo: number
): string | undefined {
  const prefix = `${keyword} `;
  if (!line.startsWith(prefix)) {
    return undefined;
  }

  return parseLiteralArg(line.slice(prefix.length), keyword, filePath, lineNo, true);
}

function quotedKeywordArg<T extends string>(
  line: string,
  keywords: readonly T[],
  filePath: string | undefined,
  lineNo: number
): { keyword: T; value: string } | undefined {
  for (const keyword of keywords) {
    const value = quotedArg(line, keyword, filePath, lineNo);
    if (value !== undefined) {
      return { keyword, value };
    }
  }

  return undefined;
}

function policyDirective(
  line: string,
  keyword: string,
  filePath: string | undefined,
  lineNo: number
): { value: string; appliesTo: string[] } | undefined {
  const prefix = `${keyword} `;
  if (!line.startsWith(prefix)) {
    return undefined;
  }

  return parsePolicyLiteralArg(line.slice(prefix.length), keyword, filePath, lineNo);
}

function policyKeywordDirective<T extends string>(
  line: string,
  keywords: readonly T[],
  filePath: string | undefined,
  lineNo: number
): { keyword: T; value: string; appliesTo: string[] } | undefined {
  for (const keyword of keywords) {
    const parsed = policyDirective(line, keyword, filePath, lineNo);
    if (parsed !== undefined) {
      return {
        keyword,
        value: parsed.value,
        appliesTo: parsed.appliesTo
      };
    }
  }

  return undefined;
}

function trailingArg(
  line: string,
  keyword: string,
  filePath: string | undefined,
  lineNo: number
): string | undefined {
  const match = line.match(new RegExp(`^${keyword}\\s+(.+)$`));
  if (!match) {
    return undefined;
  }

  return parseLiteralArg(match[1], keyword, filePath, lineNo, false);
}

function ensureApproval(state: PactState, approval: string): void {
  if (!state.approvals.includes(approval)) {
    state.approvals.push(approval);
  }
}

function ensureCommandApprovals(state: PactState, command: string): void {
  const normalized = normalizeShellCommand(command);

  if (looksLikePublishCommand(normalized)) {
    ensureApproval(state, "release_publish");
  }

  if (looksLikeDependencyChangeCommand(normalized)) {
    ensureApproval(state, "dependency_change");
  }

  if (looksLikeDestructiveShellCommand(normalized)) {
    ensureApproval(state, "destructive_write");
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

function parseLiteralArg(
  source: string,
  keyword: string,
  filePath: string | undefined,
  lineNo: number,
  quotedOnly: boolean
): string {
  const value = source.trim();
  const parsedQuoted = parseQuotedLiteral(value);

  if (parsedQuoted !== undefined) {
    return parsedQuoted;
  }

  if (value.startsWith("\"")) {
    throw syntaxError(`malformed quoted string for ${keyword}`, filePath, lineNo);
  }

  if (quotedOnly) {
    throw syntaxError(`${keyword} requires a quoted string`, filePath, lineNo);
  }

  return value;
}

function parsePolicyLiteralArg(
  source: string,
  keyword: string,
  filePath: string | undefined,
  lineNo: number
): { value: string; appliesTo: string[] } {
  const value = source.trim();
  const parsedQuoted = parseQuotedLiteralPrefix(value);

  if (!parsedQuoted) {
    if (value.startsWith("\"")) {
      throw syntaxError(`malformed quoted string for ${keyword}`, filePath, lineNo);
    }

    throw syntaxError(`${keyword} requires a quoted string`, filePath, lineNo);
  }

  const rest = parsedQuoted.rest.trim();
  if (rest.length === 0) {
    return {
      value: parsedQuoted.value,
      appliesTo: []
    };
  }

  if (rest === "for") {
    return {
      value: parsedQuoted.value,
      appliesTo: parseDelimitedList("", `${keyword} for`, "policy target", filePath, lineNo)
    };
  }

  if (!rest.startsWith("for ")) {
    throw syntaxError(`unexpected content after ${keyword} string: ${rest}`, filePath, lineNo);
  }

  return {
    value: parsedQuoted.value,
    appliesTo: uniqueValues(
      parseDelimitedList(rest.slice(4), `${keyword} for`, "policy target", filePath, lineNo)
    )
  };
}

function requireNonEmptyText(
  value: string,
  keyword: string,
  filePath: string | undefined,
  lineNo: number
): string {
  if (value.trim().length === 0) {
    throw syntaxError(`${keyword} requires a non-empty value`, filePath, lineNo);
  }

  return value;
}

function appendPolicy(
  state: PactState,
  level: Agentfile["policies"][number]["level"],
  statement: string,
  prefix?: string,
  appliesTo: string[] = []
): void {
  state.policies.push({
    id: nextGeneratedId(state.policies, `${prefix ? `${prefix}-` : ""}${statement}`, "policy"),
    level,
    appliesTo,
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

function parseQuotedLiteral(source: string): string | undefined {
  const value = source.trim();
  const parsed = parseQuotedLiteralPrefix(value);

  if (!parsed || parsed.rest.trim().length > 0) {
    return undefined;
  }

  return parsed.value;
}

function parseQuotedLiteralPrefix(source: string): { value: string; rest: string } | undefined {
  const value = source.trim();
  if (!value.startsWith("\"")) {
    return undefined;
  }

  let result = "";
  let escaped = false;

  for (let index = 1; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      result += decodeEscape(char);
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      return {
        value: result,
        rest: value.slice(index + 1)
      };
    }

    result += char;
  }

  return undefined;
}

function stripComment(line: string): string {
  let inString = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (char === "#" && !inString) {
      return line.slice(0, index);
    }
  }
  return line;
}

function decodeEscape(char: string): string {
  if (char === "\"") {
    return "\"";
  }

  if (char === "\\") {
    return "\\";
  }

  if (char === "n") {
    return "\n";
  }

  if (char === "r") {
    return "\r";
  }

  if (char === "t") {
    return "\t";
  }

  return `\\${char}`;
}

function uniqueValues(values: string[]): string[] {
  const unique: string[] = [];

  for (const value of values) {
    pushUnique(unique, value);
  }

  return unique;
}

function looksLikePact(source: string): boolean {
  for (const rawLine of source.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (line.length === 0) {
      continue;
    }

    return /^mission\s+[a-z0-9][a-z0-9._-]*\s*\{$/.test(line);
  }

  return false;
}

function syntaxError(message: string, filePath: string | undefined, lineNo: number): AgentfileError {
  return new AgentfileError(`${lineNo}: ${message}`, filePath);
}
