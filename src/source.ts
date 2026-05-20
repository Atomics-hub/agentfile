import { AgentfileError } from "./diagnostics.js";
import { parseAgentfile } from "./parser.js";
import { agentfileSchema, type Agentfile } from "./schema.js";

type Section = "mission" | "prove" | "handoff";

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
    } else if (section === "prove") {
      parseProveLine(line, state, filePath, lineNo);
    } else if (section === "handoff") {
      parseHandoffLine(line, state, filePath, lineNo);
    }
  }

  if (sections.length > 0) {
    throw new AgentfileError(`unclosed ${sections.at(-1)} block`, filePath);
  }

  const contract = agentfileSchema.parse({
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
        allow: state.shellAllow
      },
      network: {
        default: state.network
      },
      filesystem: {
        read: state.touch,
        write: state.touch,
        deny: state.never
      },
      secrets: {
        access: state.secrets
      },
      approvals: {
        requiredFor: state.approvals
      }
    },
    policies: state.policies,
    checks: state.checks,
    workflow: {
      id: "implement",
      acceptance: state.acceptance,
      review: state.review
    }
  });

  return contract;
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
    state.goal = goal;
    return;
  }

  const background = quotedArg(line, "background");
  if (background) {
    state.background = background;
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
    state.shellAllow.push(canRun[1]);
    return;
  }

  if (line === "cannot use network") {
    state.network = "deny";
    ensureApproval(state, "network_access");
    return;
  }

  if (line === "cannot read secrets") {
    state.secrets = "deny";
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

  if (line === "handoff {") {
    sections.push("handoff");
    return;
  }

  throw syntaxError(`unexpected mission line: ${line}`, filePath, lineNo);
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
    if (!state.shellAllow.includes(command)) {
      state.shellAllow.push(command);
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
    network: "deny",
    secrets: "deny",
    approvals: ["dependency_change", "network_access", "scope_expansion"],
    policies: [],
    checks: [],
    acceptance: [],
    review: []
  };
}

interface PactState {
  id: string;
  goal: string;
  background?: string;
  touch: string[];
  never: string[];
  shellAllow: string[];
  network: "allow" | "deny";
  secrets: "allow" | "deny";
  approvals: string[];
  policies: Agentfile["policies"];
  checks: Agentfile["checks"];
  acceptance: string[];
  review: string[];
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

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
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
