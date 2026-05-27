import { AgentfileError } from "./diagnostics.js";
import type { Agentfile } from "./schema.js";

export type ReceiptFormat = "markdown" | "json";

export interface ReceiptReview {
  receiptPath: string;
  status: "pass" | "fail";
  taskId: string;
  generatedInstructionSurfaceUsed: string;
  requiredProof: ReceiptReviewCount;
  optionalProof: ReceiptReviewCount;
  acceptanceEvidence: ReceiptReviewCount;
  handoffEvidence: ReceiptReviewCount;
  issues: string[];
}

export interface ReceiptFillResult {
  receipt: unknown;
  filledProofIds: string[];
  unchangedProofIds: string[];
}

interface ReceiptReviewCount {
  passed: number;
  total: number;
  expectedStatus: string;
}

export function parseReceiptFormat(value: string): ReceiptFormat {
  if (value === "markdown" || value === "json") {
    return value;
  }

  throw new AgentfileError(`unknown receipt format "${value}". Expected "markdown" or "json".`);
}

export function renderReceipt(agentfile: Agentfile, contractPath: string, format: ReceiptFormat): string {
  if (format === "json") {
    return `${JSON.stringify(buildReceiptTemplate(agentfile, contractPath), null, 2)}\n`;
  }

  return renderReceiptChecklist(agentfile, contractPath);
}

export function fillReceiptProofFromCheckLog(
  agentfile: Agentfile,
  receipt: unknown,
  checkLogPath: string,
  checkLog: string
): ReceiptFillResult {
  const receiptObject = asRecord(receipt);
  if (!receiptObject) {
    throw new AgentfileError("<root>: receipt must be a JSON object");
  }

  const proofEntries = recordArray(receiptObject.requiredProof);
  const filledProofIds: string[] = [];
  const unchangedProofIds: string[] = [];

  for (const check of agentfile.checks) {
    if (!check.command) {
      unchangedProofIds.push(check.id);
      continue;
    }

    const proof = proofEntries.find((entry) => entry.id === check.id);
    if (!proof || !checkLog.includes(check.command)) {
      unchangedProofIds.push(check.id);
      continue;
    }

    proof.status = "passed";
    proof.evidence = checkLogPath;
    filledProofIds.push(check.id);
  }

  return {
    receipt: receiptObject,
    filledProofIds,
    unchangedProofIds
  };
}

export function verifyReceipt(agentfile: Agentfile, receipt: unknown): string[] {
  const issues: string[] = [];
  const receiptObject = asRecord(receipt);

  if (!receiptObject) {
    return ["<root>: receipt must be a JSON object"];
  }

  const contract = asRecord(receiptObject.contract);
  const scope = asRecord(receiptObject.scope);
  const authority = asRecord(receiptObject.authority);

  expectEqual(receiptObject.kind, "AgentfileReceiptTemplate", "kind", issues);

  if (!contract) {
    issues.push("contract: must be an object");
  } else {
    expectEqual(contract.taskId, agentfile.task.id, "contract.taskId", issues);
    expectEqual(contract.goal, agentfile.task.goal, "contract.goal", issues);
  }

  if (!scope) {
    issues.push("scope: must be an object");
  } else {
    expectDeepEqual(scope.include, agentfile.scope.include, "scope.include", issues);
    expectDeepEqual(scope.exclude, agentfile.scope.exclude, "scope.exclude", issues);
    expectDeepEqual(scope.filesystem, agentfile.permissions.filesystem, "scope.filesystem", issues);
  }

  if (!authority) {
    issues.push("authority: must be an object");
  } else {
    expectDeepEqual(authority.shell, agentfile.permissions.shell, "authority.shell", issues);
    expectDeepEqual(authority.network, agentfile.permissions.network, "authority.network", issues);
    expectDeepEqual(authority.secrets, agentfile.permissions.secrets, "authority.secrets", issues);
    expectDeepEqual(authority.approvals, agentfile.permissions.approvals, "authority.approvals", issues);
  }

  const proofEntries = expectRecordArray(receiptObject.requiredProof, "requiredProof", issues);
  for (const check of agentfile.checks) {
    const entry = proofEntries.find((proof) => proof.id === check.id);

    if (!entry) {
      issues.push(`requiredProof[${check.id}]: missing`);
      continue;
    }

    expectEqual(entry.command ?? null, check.command ?? null, `requiredProof[${check.id}].command`, issues);
    expectEqual(entry.description ?? null, check.description ?? null, `requiredProof[${check.id}].description`, issues);
    expectEqual(entry.required, check.required, `requiredProof[${check.id}].required`, issues);

    if (check.required) {
      expectEqual(entry.status, "passed", `requiredProof[${check.id}].status`, issues);
      expectEvidence(entry.evidence, `requiredProof[${check.id}].evidence`, issues);
    }
  }

  const acceptanceEntries = expectRecordArray(receiptObject.acceptanceEvidence, "acceptanceEvidence", issues);
  for (const item of agentfile.workflow.acceptance) {
    const entry = acceptanceEntries.find((candidate) => candidate.item === item);

    if (!entry) {
      issues.push(`acceptanceEvidence[${item}]: missing`);
      continue;
    }

    expectEqual(entry.status, "satisfied", `acceptanceEvidence[${item}].status`, issues);
    expectEvidence(entry.evidence, `acceptanceEvidence[${item}].evidence`, issues);
  }

  const handoffEntries = expectRecordArray(receiptObject.handoffEvidence, "handoffEvidence", issues);
  for (const item of receiptHandoffEvidence(agentfile)) {
    const entry = handoffEntries.find((candidate) => candidate.item === item);

    if (!entry) {
      issues.push(`handoffEvidence[${item}]: missing`);
      continue;
    }

    expectEqual(entry.status, "satisfied", `handoffEvidence[${item}].status`, issues);
    expectEvidence(entry.evidence, `handoffEvidence[${item}].evidence`, issues);
  }

  return issues;
}

export function reviewReceipt(agentfile: Agentfile, receipt: unknown, receiptPath: string): ReceiptReview {
  const receiptObject = asRecord(receipt);
  const source = asRecord(receiptObject?.source);
  const requiredProofEntries = recordArray(receiptObject?.requiredProof);
  const requiredProof = requiredProofEntries.filter((entry) => entry.required !== false);
  const optionalProof = requiredProofEntries.filter((entry) => entry.required === false);
  const acceptanceEvidence = recordArray(receiptObject?.acceptanceEvidence);
  const handoffEvidence = recordArray(receiptObject?.handoffEvidence);
  const issues = verifyReceipt(agentfile, receipt);

  return {
    receiptPath,
    status: issues.length === 0 ? "pass" : "fail",
    taskId: agentfile.task.id,
    generatedInstructionSurfaceUsed: stringOrNone(source?.generatedInstructionSurfaceUsed),
    requiredProof: countStatus(requiredProof, "passed"),
    optionalProof: countStatus(optionalProof, "passed"),
    acceptanceEvidence: countStatus(acceptanceEvidence, "satisfied"),
    handoffEvidence: countStatus(handoffEvidence, "satisfied"),
    issues
  };
}

export function renderReceiptReview(review: ReceiptReview): string {
  const lines = [
    "# Agentfile Receipt Review",
    "",
    `Receipt: \`${review.receiptPath}\``,
    `Task: \`${review.taskId}\``,
    `Status: ${review.status}`,
    `Generated surface: ${review.generatedInstructionSurfaceUsed}`,
    "",
    "## Evidence",
    "",
    `- Required proof: ${formatCount(review.requiredProof)}`,
    `- Acceptance evidence: ${formatCount(review.acceptanceEvidence)}`,
    `- Handoff evidence: ${formatCount(review.handoffEvidence)}`
  ];

  if (review.optionalProof.total > 0) {
    lines.push(`- Optional proof: ${formatCount(review.optionalProof)}`);
  }

  if (review.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of review.issues) {
      lines.push(`- ${issue}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderReceiptChecklist(agentfile: Agentfile, contractPath: string): string {
  const handoffEvidence = receiptHandoffEvidence(agentfile);
  const lines = [
    "# Agentfile Receipt Checklist",
    "",
    `Contract: \`${contractPath}\``,
    `Task: \`${agentfile.task.id}\``,
    `Goal: ${agentfile.task.goal}`,
    "",
    "Use this after a harness run to tie the agent's work back to the contract.",
    "",
    "## Scope",
    "",
    `- Included paths: ${listOrNone(agentfile.scope.include)}`,
    `- Excluded paths: ${listOrNone(agentfile.scope.exclude)}`,
    `- Filesystem read: ${listOrNone(agentfile.permissions.filesystem.read)}`,
    `- Filesystem write: ${listOrNone(agentfile.permissions.filesystem.write)}`,
    `- Filesystem denied: ${listOrNone(agentfile.permissions.filesystem.deny)}`,
    "",
    "## Authority",
    "",
    `- Allowed shell commands: ${listCommandsOrNone(agentfile.permissions.shell.allow)}`,
    `- Denied shell commands: ${listCommandsOrNone(agentfile.permissions.shell.deny)}`,
    `- Network: ${agentfile.permissions.network.default}${agentfile.permissions.network.allow.length > 0 ? `; allow ${agentfile.permissions.network.allow.join(", ")}` : ""}`,
    `- Secrets: ${agentfile.permissions.secrets.access}${agentfile.permissions.secrets.allow.length > 0 ? `; allow ${agentfile.permissions.secrets.allow.join(", ")}` : ""}`,
    `- Approvals required: ${listOrNone(agentfile.permissions.approvals.requiredFor)}`,
    "",
    "## Required Proof",
    ""
  ];

  if (agentfile.checks.length === 0) {
    lines.push("- [ ] Record the proof performed for this run.");
  } else {
    for (const check of agentfile.checks) {
      const requirement = check.required ? "required" : "optional";
      if (check.command) {
        lines.push(`- [ ] Run \`${check.command}\` (${requirement}).`);
      } else if (check.description) {
        lines.push(`- [ ] Confirm ${check.description} (${requirement}).`);
      }
    }
  }

  if (agentfile.workflow.acceptance.length > 0) {
    lines.push("", "## Acceptance Evidence", "");
    for (const item of agentfile.workflow.acceptance) {
      lines.push(`- [ ] ${item}`);
    }
  }

  lines.push("", "## Handoff Evidence", "");

  for (const item of handoffEvidence) {
    lines.push(`- [ ] ${item}`);
  }

  lines.push(
    "",
    "## Receipt Fields",
    "",
    "- Contract source used",
    "- Generated instruction surface used, if any",
    "- Agent, model, and harness",
    "- Started and ended timestamps",
    "- Verification commands run",
    "- Scope adherence notes",
    "- Final handoff summary",
    ""
  );

  return lines.join("\n");
}

function buildReceiptTemplate(agentfile: Agentfile, contractPath: string) {
  return {
    agentfile: "0.1.0",
    kind: "AgentfileReceiptTemplate",
    contract: {
      path: contractPath,
      taskId: agentfile.task.id,
      goal: agentfile.task.goal
    },
    source: {
      contractSourceUsed: contractPath,
      generatedInstructionSurfaceUsed: null
    },
    scope: {
      include: agentfile.scope.include,
      exclude: agentfile.scope.exclude,
      filesystem: agentfile.permissions.filesystem
    },
    authority: {
      shell: agentfile.permissions.shell,
      network: agentfile.permissions.network,
      secrets: agentfile.permissions.secrets,
      approvals: agentfile.permissions.approvals
    },
    requiredProof: agentfile.checks.map((check) => ({
      id: check.id,
      command: check.command ?? null,
      description: check.description ?? null,
      required: check.required,
      status: "pending",
      evidence: null
    })),
    acceptanceEvidence: agentfile.workflow.acceptance.map((item) => ({
      item,
      status: "pending",
      evidence: null
    })),
    handoffEvidence: receiptHandoffEvidence(agentfile).map((item) => ({
      item,
      status: "pending",
      evidence: null
    })),
    receiptFields: [
      "contract source used",
      "generated instruction surface used, if any",
      "agent, model, and harness",
      "started and ended timestamps",
      "verification commands run",
      "scope adherence notes",
      "final handoff summary"
    ]
  };
}

export function receiptHandoffEvidence(agentfile: Agentfile): string[] {
  const reviewText = agentfile.workflow.review.join("\n").toLowerCase();
  const reviewListsChangedFiles = reviewText.includes("changed file");
  const reviewNotesRisks = reviewText.includes("risk");
  const handoffEvidence = [
    "Attach or link the transcript/tool log.",
    "Attach or link the patch diff.",
    "Attach or link the check log."
  ];

  if (!reviewListsChangedFiles) {
    handoffEvidence.push("List changed files.");
  }

  handoffEvidence.push(reviewNotesRisks
    ? "Note skipped checks, approvals, and policy limits."
    : "Note risks, skipped checks, approvals, and policy limits."
  );

  return [
    ...handoffEvidence,
    ...agentfile.workflow.review
  ];
}

function listOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function listCommandsOrNone(values: string[]): string {
  return values.length > 0 ? values.map((value) => `\`${value}\``).join(", ") : "none";
}

function expectEqual(actual: unknown, expected: unknown, path: string, issues: string[]): void {
  if (actual !== expected) {
    issues.push(`${path}: expected ${formatValue(expected)}, got ${formatValue(actual)}`);
  }
}

function expectDeepEqual(actual: unknown, expected: unknown, path: string, issues: string[]): void {
  if (!deepEqual(actual, expected)) {
    issues.push(`${path}: expected ${formatValue(expected)}, got ${formatValue(actual)}`);
  }
}

function expectEvidence(value: unknown, path: string, issues: string[]): void {
  if (!hasEvidence(value)) {
    issues.push(`${path}: evidence is required`);
  }
}

function expectRecordArray(value: unknown, path: string, issues: string[]): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    issues.push(`${path}: must be an array`);
    return [];
  }

  const records: Record<string, unknown>[] = [];
  value.forEach((item, index) => {
    const record = asRecord(item);
    if (!record) {
      issues.push(`${path}[${index}]: must be an object`);
      return;
    }

    records.push(record);
  });

  return records;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    return record ? [record] : [];
  });
}

function countStatus(records: Record<string, unknown>[], expectedStatus: string): ReceiptReviewCount {
  return {
    passed: records.filter((record) => record.status === expectedStatus).length,
    total: records.length,
    expectedStatus
  };
}

function formatCount(count: ReceiptReviewCount): string {
  return `${count.passed}/${count.total} ${count.expectedStatus}`;
}

function stringOrNone(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value : "none";
}

function hasEvidence(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  return true;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => deepEqual(item, right[index]));
  }

  const leftRecord = asRecord(left);
  const rightRecord = asRecord(right);

  if (leftRecord || rightRecord) {
    if (!leftRecord || !rightRecord) {
      return false;
    }

    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();

    if (!deepEqual(leftKeys, rightKeys)) {
      return false;
    }

    return leftKeys.every((key) => deepEqual(leftRecord[key], rightRecord[key]));
  }

  return false;
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  return typeof value === "string" ? `"${value}"` : JSON.stringify(value);
}
