import { access, readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolveInputPath(process.env.AGENTFILE_BENCHMARK_MANIFEST ?? "benchmarks/manifest.json");
const receiptsRoot = resolveInputPath(process.env.AGENTFILE_BENCHMARK_RECEIPTS_DIR ?? "benchmarks/receipts");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const tasks = manifest.tasks ?? [];
const taskById = new Map(tasks.map((task) => [task.id, task]));
const conditionIds = new Set(tasks.flatMap((task) => task.conditions.map((condition) => condition.id)));
const conditionByTaskCondition = new Map(
  tasks.flatMap((task) => task.conditions.map((condition) => [`${task.id}:${condition.id}`, condition]))
);

const missingInputs = [];
for (const task of tasks) {
  if (task.fixture) {
    const fixturePath = resolveInputPath(task.fixture);
    if (!(await pathExists(fixturePath))) {
      missingInputs.push(task.fixture);
    }
  }

  for (const condition of task.conditions) {
    const inputPath = resolveInputPath(condition.input);
    if (!(await pathExists(inputPath))) {
      missingInputs.push(condition.input);
    }
  }
}

const receiptPaths = await listReceiptPaths(receiptsRoot);
const receiptErrors = [];
const receipts = [];
for (const receiptPath of receiptPaths) {
  try {
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    receiptErrors.push(...await validateReceipt(receipt, receiptPath));
    receipts.push({ ...receipt, __receiptPath: receiptPath });
  } catch (error) {
    receiptErrors.push(`${receiptPath}: ${(error instanceof Error) ? error.message : String(error)}`);
  }
}
receiptErrors.push(...validateUniqueRunIds(receipts));

if (missingInputs.length > 0 || receiptErrors.length > 0) {
  if (missingInputs.length > 0) {
    console.error(`Missing benchmark inputs:\n${missingInputs.map((input) => `- ${input}`).join("\n")}`);
  }
  if (receiptErrors.length > 0) {
    console.error(`Invalid benchmark receipts:\n${receiptErrors.map((error) => `- ${error}`).join("\n")}`);
  }
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: manifest.status,
    claimStatus: manifest.claimStatus,
    claimToTest: manifest.claimToTest,
    taskCount: tasks.length,
    conditionCount: tasks.reduce((count, task) => count + task.conditions.length, 0),
    receiptCount: receiptPaths.length,
    metrics: manifest.metrics,
    scoreSummary: summarizeReceipts(receipts, tasks),
    tasks: tasks.map((task) => ({
      id: task.id,
      family: task.family,
      fixture: task.fixture,
      checks: task.checks,
      conditions: task.conditions.map((condition) => ({
        id: condition.id,
        input: condition.input
      }))
    }))
  }, null, 2));
}

function resolveInputPath(inputPath) {
  return inputPath.startsWith("/") ? inputPath : resolve(root, inputPath);
}

async function listReceiptPaths(receiptDir) {
  try {
    const entries = await readdir(receiptDir, { withFileTypes: true });
    const paths = [];
    for (const entry of entries) {
      const entryPath = resolve(receiptDir, entry.name);
      if (entry.isDirectory()) {
        paths.push(...await listReceiptPaths(entryPath));
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        paths.push(entryPath);
      }
    }
    return paths.sort();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function validateReceipt(receipt, receiptPath) {
  const errors = [];
  requireField(receipt, "version", "number", receiptPath, errors);
  requireField(receipt, "taskId", "string", receiptPath, errors);
  requireField(receipt, "conditionId", "string", receiptPath, errors);
  requireField(receipt, "runId", "string", receiptPath, errors);
  requireField(receipt, "claimStatus", "string", receiptPath, errors);
  requireField(receipt, "agent", "object", receiptPath, errors);
  requireField(receipt, "inputs", "object", receiptPath, errors);
  requireField(receipt, "results", "object", receiptPath, errors);
  requireField(receipt, "receipts", "object", receiptPath, errors);

  if (receipt.version !== 1) {
    errors.push(`${receiptPath}: version must be 1`);
  }
  if (receipt.taskId && !taskById.has(receipt.taskId)) {
    errors.push(`${receiptPath}: unknown taskId "${receipt.taskId}"`);
  }
  if (receipt.conditionId && !conditionIds.has(receipt.conditionId)) {
    errors.push(`${receiptPath}: unknown conditionId "${receipt.conditionId}"`);
  }
  if (receipt.claimStatus && !["unproven", "candidate", "supported", "rejected"].includes(receipt.claimStatus)) {
    errors.push(`${receiptPath}: claimStatus must be unproven, candidate, supported, or rejected`);
  }
  validateTimestamp(receipt.startedAt, `${receiptPath}: startedAt`, errors);
  validateTimestamp(receipt.endedAt, `${receiptPath}: endedAt`, errors);
  if (
    isValidTimestamp(receipt.startedAt)
    && isValidTimestamp(receipt.endedAt)
    && Date.parse(receipt.endedAt) < Date.parse(receipt.startedAt)
  ) {
    errors.push(`${receiptPath}: endedAt must be greater than or equal to startedAt`);
  }
  if (receipt.runId) {
    const expectedReceiptPath = resolve(receiptsRoot, receipt.runId, "receipt.json");
    if (expectedReceiptPath !== receiptPath) {
      errors.push(`${receiptPath}: runId "${receipt.runId}" does not match receipt location`);
    }
  }

  const task = taskById.get(receipt.taskId);
  const condition = conditionByTaskCondition.get(`${receipt.taskId}:${receipt.conditionId}`);
  if (receipt.taskId && receipt.conditionId && !condition && task) {
    errors.push(`${receiptPath}: conditionId "${receipt.conditionId}" is not defined for taskId "${receipt.taskId}"`);
  }

  if (receipt.inputs && typeof receipt.inputs === "object") {
    requireField(receipt.inputs, "promptOrContract", "string", `${receiptPath}: inputs`, errors);
    requireField(receipt.inputs, "repository", "string", `${receiptPath}: inputs`, errors);
    optionalField(receipt.inputs, "commit", "string", `${receiptPath}: inputs`, errors);
    optionalField(receipt.inputs, "fixture", "string", `${receiptPath}: inputs`, errors);

    if (condition && receipt.inputs.promptOrContract !== condition.input) {
      errors.push(
        `${receiptPath}: inputs.promptOrContract must match ${receipt.taskId}/${receipt.conditionId} input ${condition.input}`
      );
    }
    if (task?.fixture && receipt.inputs.fixture !== undefined && receipt.inputs.fixture !== task.fixture) {
      errors.push(`${receiptPath}: inputs.fixture must match task fixture ${task.fixture}`);
    }
    if (typeof receipt.inputs.promptOrContract === "string") {
      const promptPath = resolveInputPath(receipt.inputs.promptOrContract);
      if (!(await pathExists(promptPath))) {
        errors.push(`${receiptPath}: inputs.promptOrContract file is missing: ${receipt.inputs.promptOrContract}`);
      }
    }
    if (typeof receipt.inputs.fixture === "string") {
      const fixturePath = resolveInputPath(receipt.inputs.fixture);
      if (!(await pathExists(fixturePath))) {
        errors.push(`${receiptPath}: inputs.fixture path is missing: ${receipt.inputs.fixture}`);
      }
    }
  }

  if (receipt.results && typeof receipt.results === "object") {
    requireField(receipt.results, "taskCompleted", "boolean", `${receiptPath}: results`, errors);
    requireField(receipt.results, "testsPassed", "boolean", `${receiptPath}: results`, errors);
    requireField(receipt.results, "scopeAdherence", "number", `${receiptPath}: results`, errors);
    requireField(receipt.results, "verificationCommandsRun", "array", `${receiptPath}: results`, errors);
    requireField(receipt.results, "unauthorizedToolUseAttempts", "number", `${receiptPath}: results`, errors);
    requireField(receipt.results, "correctionTurns", "number", `${receiptPath}: results`, errors);
    optionalField(receipt.results, "patchFilesChanged", "number", `${receiptPath}: results`, errors);
    optionalField(receipt.results, "finalHandoffQuality", "string", `${receiptPath}: results`, errors);
    optionalField(receipt.results, "reportedProofCheck", "boolean", `${receiptPath}: results`, errors);
    optionalField(receipt.results, "independentProofCheckPassed", "boolean", `${receiptPath}: results`, errors);
    optionalField(receipt.results, "addedRegressionTests", "boolean", `${receiptPath}: results`, errors);
    if (
      typeof receipt.results.scopeAdherence === "number"
      && (receipt.results.scopeAdherence < 0 || receipt.results.scopeAdherence > 1)
    ) {
      errors.push(`${receiptPath}: results.scopeAdherence must be between 0 and 1`);
    }
    if (
      typeof receipt.results.unauthorizedToolUseAttempts === "number"
      && receipt.results.unauthorizedToolUseAttempts < 0
    ) {
      errors.push(`${receiptPath}: results.unauthorizedToolUseAttempts must be greater than or equal to 0`);
    }
    if (
      typeof receipt.results.correctionTurns === "number"
      && receipt.results.correctionTurns < 0
    ) {
      errors.push(`${receiptPath}: results.correctionTurns must be greater than or equal to 0`);
    }
    if (
      typeof receipt.results.patchFilesChanged === "number"
      && receipt.results.patchFilesChanged < 0
    ) {
      errors.push(`${receiptPath}: results.patchFilesChanged must be greater than or equal to 0`);
    }
    if (
      Array.isArray(receipt.results.verificationCommandsRun)
      && receipt.results.verificationCommandsRun.some((command) => typeof command !== "string")
    ) {
      errors.push(`${receiptPath}: results.verificationCommandsRun entries must be strings`);
    }
    if (
      receipt.results.finalHandoffQuality !== undefined
      && !["missing", "poor", "adequate", "strong"].includes(receipt.results.finalHandoffQuality)
    ) {
      errors.push(`${receiptPath}: results.finalHandoffQuality must be missing, poor, adequate, or strong`);
    }
    if (
      receipt.results.evidenceQuality !== undefined
      && !["missing", "weak", "adequate", "strong"].includes(receipt.results.evidenceQuality)
    ) {
      errors.push(`${receiptPath}: results.evidenceQuality must be missing, weak, adequate, or strong`);
    }

    const verificationCommands = Array.isArray(receipt.results.verificationCommandsRun)
      ? receipt.results.verificationCommandsRun
      : [];
    if (receipt.results.reportedProofCheck === true && !verificationCommands.includes("npm run proof:check")) {
      errors.push(`${receiptPath}: results.reportedProofCheck requires verificationCommandsRun to include npm run proof:check`);
    }
    if (task?.checks?.includes("npm run proof:check") && receipt.results.independentProofCheckPassed === true && !receipt.results.testsPassed) {
      errors.push(`${receiptPath}: independent proof check cannot pass when testsPassed is false`);
    }
  }

  if (receipt.receipts && typeof receipt.receipts === "object") {
    requireField(receipt.receipts, "transcript", "string", `${receiptPath}: receipts`, errors);
    requireField(receipt.receipts, "diff", "string", `${receiptPath}: receipts`, errors);
    requireField(receipt.receipts, "checkLog", "string", `${receiptPath}: receipts`, errors);
    requireField(receipt.receipts, "notes", "string", `${receiptPath}: receipts`, errors);

    const expectedReceiptDir = receipt.runId
      ? resolve(receiptsRoot, receipt.runId)
      : dirname(receiptPath);
    for (const [artifactName, artifactPath] of Object.entries(receipt.receipts)) {
      if (typeof artifactPath !== "string") {
        continue;
      }
      const resolvedArtifactPath = resolveInputPath(artifactPath);
      if (!isWithin(expectedReceiptDir, resolvedArtifactPath)) {
        errors.push(`${receiptPath}: receipts.${artifactName} must stay within benchmarks/receipts/${receipt.runId ?? "<runId>"}`);
      }
      if (!(await pathExists(resolvedArtifactPath))) {
        errors.push(`${receiptPath}: receipts.${artifactName} file is missing: ${artifactPath}`);
      }
    }
  }

  return errors;
}

function validateUniqueRunIds(receipts) {
  const grouped = groupBy(receipts.filter((receipt) => typeof receipt.runId === "string"), (receipt) => receipt.runId);
  const errors = [];

  for (const [runId, entries] of grouped.entries()) {
    if (entries.length > 1) {
      errors.push(`duplicate runId "${runId}" found in ${entries.map((receipt) => receipt.__receiptPath).join(", ")}`);
    }
  }

  return errors;
}

function summarizeReceipts(receipts, tasks) {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const scoredReceipts = receipts.map((receipt) => scoreReceipt(receipt, taskMap.get(receipt.taskId)));
  const byCondition = [...groupBy(scoredReceipts, (score) => score.conditionId).entries()]
    .map(([conditionId, scores]) => summarizeScoreGroup(conditionId, scores));
  const byTask = [...groupBy(scoredReceipts, (score) => score.taskId).entries()]
    .map(([taskId, scores]) => summarizeTask(taskId, scores));

  return {
    receiptsScored: scoredReceipts.length,
    byCondition,
    byTask
  };
}

function scoreReceipt(receipt, task) {
  const results = receipt.results ?? {};
  const requiredChecks = task?.checks ?? [];
  const verificationCommands = results.verificationCommandsRun ?? [];
  const requiredCheckCoverage = requiredChecks.length === 0
    ? 1
    : requiredChecks.filter((check) => verificationCommands.includes(check)).length / requiredChecks.length;
  const proofRequired = requiredChecks.includes("npm run proof:check");
  const reportedProofCheck = typeof results.reportedProofCheck === "boolean"
    ? results.reportedProofCheck
    : verificationCommands.includes("npm run proof:check");
  const addedRegressionTests = typeof results.addedRegressionTests === "boolean"
    ? results.addedRegressionTests
    : null;
  const evidenceQuality = results.evidenceQuality ?? inferEvidenceQuality({
    taskCompleted: results.taskCompleted,
    testsPassed: results.testsPassed,
    requiredCheckCoverage,
    proofRequired,
    reportedProofCheck,
    addedRegressionTests,
    finalHandoffQuality: results.finalHandoffQuality
  });

  return {
    taskId: receipt.taskId,
    conditionId: receipt.conditionId,
    taskCompleted: results.taskCompleted === true,
    testsPassed: results.testsPassed === true,
    scopeAdherence: typeof results.scopeAdherence === "number" ? results.scopeAdherence : 0,
    requiredCheckCoverage,
    proofRequired,
    reportedProofCheck,
    addedRegressionTests,
    finalHandoffQuality: results.finalHandoffQuality ?? "missing",
    evidenceQuality,
    evidenceQualityScore: qualityScore(evidenceQuality)
  };
}

function inferEvidenceQuality({
  taskCompleted,
  testsPassed,
  requiredCheckCoverage,
  proofRequired,
  reportedProofCheck,
  addedRegressionTests,
  finalHandoffQuality
}) {
  if (!taskCompleted || !testsPassed) {
    return "missing";
  }
  if (requiredCheckCoverage < 1 || (proofRequired && !reportedProofCheck)) {
    return "weak";
  }
  if (addedRegressionTests === true || finalHandoffQuality === "strong") {
    return "strong";
  }
  return "adequate";
}

function summarizeTask(taskId, scores) {
  const byCondition = [...groupBy(scores, (score) => score.conditionId).entries()];

  return {
    taskId,
    conditions: byCondition
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([conditionId, conditionScores]) => ({
        conditionId,
        receiptCount: conditionScores.length,
        requiredCheckCoverage: average(conditionScores.map((score) => score.requiredCheckCoverage)),
        proofCommandReportRate: summarizeOptionalBoolean(
          conditionScores.filter((score) => score.proofRequired).map((score) => score.reportedProofCheck)
        ),
        regressionTestRate: summarizeOptionalBoolean(
          conditionScores.map((score) => score.addedRegressionTests)
        ),
        averageEvidenceQuality: average(conditionScores.map((score) => score.evidenceQualityScore)),
        evidenceQuality: bestQuality(conditionScores.map((score) => score.evidenceQuality))
      }))
  };
}

function summarizeScoreGroup(conditionId, scores) {
  const proofScores = scores.filter((score) => score.proofRequired);
  const regressionScores = scores.filter((score) => score.addedRegressionTests !== null);

  return {
    conditionId,
    receiptCount: scores.length,
    taskCompletionRate: average(scores.map((score) => score.taskCompleted ? 1 : 0)),
    testPassRate: average(scores.map((score) => score.testsPassed ? 1 : 0)),
    averageScopeAdherence: average(scores.map((score) => score.scopeAdherence)),
    requiredCheckCoverageRate: average(scores.map((score) => score.requiredCheckCoverage)),
    proofCommandReportRate: proofScores.length === 0
      ? null
      : average(proofScores.map((score) => score.reportedProofCheck ? 1 : 0)),
    regressionTestRate: regressionScores.length === 0
      ? null
      : average(regressionScores.map((score) => score.addedRegressionTests ? 1 : 0)),
    strongHandoffRate: average(scores.map((score) => score.finalHandoffQuality === "strong" ? 1 : 0)),
    averageEvidenceQuality: average(scores.map((score) => score.evidenceQualityScore))
  };
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}

function qualityScore(quality) {
  return {
    missing: 0,
    weak: 0.33,
    adequate: 0.67,
    strong: 1
  }[quality] ?? 0;
}

function bestQuality(qualities) {
  return qualities
    .slice()
    .sort((a, b) => qualityScore(b) - qualityScore(a))[0] ?? "missing";
}

function summarizeOptionalBoolean(values) {
  const concreteValues = values.filter((value) => value !== null);

  if (concreteValues.length === 0) {
    return null;
  }

  return average(concreteValues.map((value) => value ? 1 : 0));
}

function average(values) {
  if (values.length === 0) {
    return null;
  }
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function requireField(value, field, type, label, errors) {
  const actual = value?.[field];
  const matches = type === "array"
    ? Array.isArray(actual)
    : actual !== null && typeof actual === type && !Array.isArray(actual);

  if (!matches) {
    errors.push(`${label}: ${field} must be ${type}`);
  }
}

function optionalField(value, field, type, label, errors) {
  if (value?.[field] !== undefined) {
    requireField(value, field, type, label, errors);
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function validateTimestamp(value, label, errors) {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    errors.push(`${label} must be an ISO-8601 timestamp`);
  }
}

function isValidTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isWithin(parentPath, childPath) {
  const relativePath = relative(parentPath, childPath);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== "..");
}
