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
for (const receiptPath of receiptPaths) {
  try {
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    receiptErrors.push(...validateReceipt(receipt, receiptPath));
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
  }

  return errors;
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
