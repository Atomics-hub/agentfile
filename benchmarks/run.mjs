import { access, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "benchmarks/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const taskIds = new Set((manifest.tasks ?? []).map((task) => task.id));
const conditionIds = new Set(
  (manifest.tasks ?? []).flatMap((task) => (task.conditions ?? []).map((condition) => condition.id))
);

const missingInputs = [];
for (const task of manifest.tasks ?? []) {
  if (task.fixture) {
    const fixturePath = resolve(root, task.fixture);
    try {
      await access(fixturePath);
    } catch {
      missingInputs.push(task.fixture);
    }
  }

  for (const condition of task.conditions ?? []) {
    const inputPath = resolve(root, condition.input);
    try {
      await access(inputPath);
    } catch {
      missingInputs.push(condition.input);
    }
  }
}

const receiptPaths = await listReceiptPaths(resolve(root, "benchmarks/receipts"));
const receiptErrors = [];
const receipts = [];
for (const receiptPath of receiptPaths) {
  try {
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    receiptErrors.push(...validateReceipt(receipt, receiptPath));
    receipts.push(receipt);
  } catch (error) {
    receiptErrors.push(`${receiptPath}: ${(error instanceof Error) ? error.message : String(error)}`);
  }
}

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
    taskCount: manifest.tasks.length,
    conditionCount: manifest.tasks.reduce((count, task) => count + task.conditions.length, 0),
    receiptCount: receiptPaths.length,
    metrics: manifest.metrics,
    scoreSummary: summarizeReceipts(receipts, manifest.tasks ?? []),
    tasks: manifest.tasks.map((task) => ({
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

function validateReceipt(receipt, receiptPath) {
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
  if (receipt.taskId && !taskIds.has(receipt.taskId)) {
    errors.push(`${receiptPath}: unknown taskId "${receipt.taskId}"`);
  }
  if (receipt.conditionId && !conditionIds.has(receipt.conditionId)) {
    errors.push(`${receiptPath}: unknown conditionId "${receipt.conditionId}"`);
  }
  if (receipt.claimStatus && !["unproven", "candidate", "supported", "rejected"].includes(receipt.claimStatus)) {
    errors.push(`${receiptPath}: claimStatus must be unproven, candidate, supported, or rejected`);
  }
  if (receipt.results && typeof receipt.results === "object") {
    requireField(receipt.results, "taskCompleted", "boolean", `${receiptPath}: results`, errors);
    requireField(receipt.results, "testsPassed", "boolean", `${receiptPath}: results`, errors);
    requireField(receipt.results, "scopeAdherence", "number", `${receiptPath}: results`, errors);
    requireField(receipt.results, "verificationCommandsRun", "array", `${receiptPath}: results`, errors);
    requireField(receipt.results, "unauthorizedToolUseAttempts", "number", `${receiptPath}: results`, errors);
    requireField(receipt.results, "correctionTurns", "number", `${receiptPath}: results`, errors);
    optionalField(receipt.results, "reportedProofCheck", "boolean", `${receiptPath}: results`, errors);
    optionalField(receipt.results, "independentProofCheckPassed", "boolean", `${receiptPath}: results`, errors);
    optionalField(receipt.results, "addedRegressionTests", "boolean", `${receiptPath}: results`, errors);
    if (
      receipt.results.evidenceQuality !== undefined
      && !["missing", "weak", "adequate", "strong"].includes(receipt.results.evidenceQuality)
    ) {
      errors.push(`${receiptPath}: results.evidenceQuality must be missing, weak, adequate, or strong`);
    }
  }

  return errors;
}

function summarizeReceipts(receipts, tasks) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const scoredReceipts = receipts.map((receipt) => scoreReceipt(receipt, taskById.get(receipt.taskId)));
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
  return {
    taskId,
    conditions: scores
      .sort((a, b) => a.conditionId.localeCompare(b.conditionId))
      .map((score) => ({
        conditionId: score.conditionId,
        requiredCheckCoverage: round(score.requiredCheckCoverage),
        reportedProofCheck: score.proofRequired ? score.reportedProofCheck : null,
        addedRegressionTests: score.addedRegressionTests,
        evidenceQuality: score.evidenceQuality
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
