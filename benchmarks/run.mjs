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

const manifestErrors = validateManifest(tasks);
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

if (manifestErrors.length > 0 || missingInputs.length > 0 || receiptErrors.length > 0) {
  if (manifestErrors.length > 0) {
    console.error(`Invalid benchmark manifest:\n${manifestErrors.map((error) => `- ${error}`).join("\n")}`);
  }
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
      runSlug: task.runSlug,
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
  const artifactContents = {};
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
  validateRunId(receipt, task, receiptPath, errors);

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
    if (hasDuplicates(verificationCommands)) {
      errors.push(`${receiptPath}: results.verificationCommandsRun must not contain duplicate commands`);
    }
    if (task && verificationCommands.some((command) => !task.checks?.includes(command))) {
      const unsupportedCommand = verificationCommands.find((command) => !task.checks?.includes(command));
      errors.push(
        `${receiptPath}: results.verificationCommandsRun lists unsupported command "${unsupportedCommand}"; `
        + `allowed commands come from task checks`
      );
    }
    if (receipt.results.reportedProofCheck === true && !verificationCommands.includes("npm run proof:check")) {
      errors.push(`${receiptPath}: results.reportedProofCheck requires verificationCommandsRun to include npm run proof:check`);
    }
    if (receipt.results.reportedProofCheck === true && !task?.checks?.includes("npm run proof:check")) {
      errors.push(`${receiptPath}: results.reportedProofCheck requires task check "npm run proof:check"`);
    }
    if (task?.checks?.includes("npm run proof:check") && receipt.results.independentProofCheckPassed === true && !receipt.results.testsPassed) {
      errors.push(`${receiptPath}: independent proof check cannot pass when testsPassed is false`);
    }
    if (receipt.results.independentProofCheckPassed === true && !task?.checks?.includes("npm run proof:check")) {
      errors.push(`${receiptPath}: results.independentProofCheckPassed requires task check "npm run proof:check"`);
    }
  }

  if (receipt.receipts && typeof receipt.receipts === "object") {
    requireField(receipt.receipts, "transcript", "string", `${receiptPath}: receipts`, errors);
    requireField(receipt.receipts, "diff", "string", `${receiptPath}: receipts`, errors);
    requireField(receipt.receipts, "checkLog", "string", `${receiptPath}: receipts`, errors);
    requireField(receipt.receipts, "notes", "string", `${receiptPath}: receipts`, errors);
    optionalField(receipt.receipts, "baselineTestLog", "string", `${receiptPath}: receipts`, errors);
    optionalField(receipt.receipts, "baselineLintLog", "string", `${receiptPath}: receipts`, errors);
    optionalField(receipt.receipts, "baselineProofLog", "string", `${receiptPath}: receipts`, errors);
    optionalField(receipt.receipts, "baselineScopeLog", "string", `${receiptPath}: receipts`, errors);
    validateRequiredBaselineArtifacts(task, receipt.receipts, receiptPath, errors);

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
        continue;
      }
      artifactContents[artifactName] = await readFile(resolvedArtifactPath, "utf8");
    }
  }

  validateReceiptArtifacts(task, receipt, receiptPath, artifactContents, errors);

  return errors;
}

function validateReceiptArtifacts(task, receipt, receiptPath, artifactContents, errors) {
  if (!task) {
    return;
  }

  const checkLog = artifactContents.checkLog;
  const diffText = artifactContents.diff;
  const supportedVerificationCommands = typeof checkLog === "string"
    ? supportedCommandsForLog(task.checks ?? [], checkLog)
    : [];
  receipt.__supportedVerificationCommands = supportedVerificationCommands;
  if (typeof checkLog === "string") {
    validateVerificationCommands(task, receipt, receiptPath, checkLog, errors);
  }
  if (typeof diffText === "string") {
    const diffStats = parseDiffStats(diffText);
    receipt.__diffChangedFiles = diffStats.files;
    receipt.__diffLineStats = diffStats;
    validateDiffClaims(receipt, receiptPath, diffStats.files, errors);
  }

  for (const check of task.checks ?? []) {
    const artifactName = baselineArtifactForCheck(check);
    const artifactLog = artifactName ? artifactContents[artifactName] : undefined;

    if (artifactName && typeof artifactLog === "string" && !logIncludesCommand(artifactLog, check)) {
      errors.push(`${receiptPath}: receipts.${artifactName} must show command "${check}"`);
    }
  }

  if (
    receipt.results?.independentProofCheckPassed === true
    && typeof checkLog === "string"
    && !logIncludesCommand(checkLog, "npm run proof:check")
  ) {
    errors.push(`${receiptPath}: results.independentProofCheckPassed requires receipts.checkLog to include npm run proof:check`);
  }

  validateEvidenceQualityClaim(task, receipt, receiptPath, supportedVerificationCommands, errors);
}

function validateVerificationCommands(task, receipt, receiptPath, checkLog, errors) {
  const verificationCommands = Array.isArray(receipt.results?.verificationCommandsRun)
    ? receipt.results.verificationCommandsRun.filter((command) => typeof command === "string")
    : [];
  const testCommands = (task.checks ?? []).filter((command) => command.startsWith("npm test -- "));

  for (const command of verificationCommands) {
    if (!logIncludesCommand(checkLog, command)) {
      errors.push(`${receiptPath}: results.verificationCommandsRun lists "${command}" but receipts.checkLog does not show it`);
    }
  }

  if (receipt.results?.testsPassed === true) {
    for (const command of testCommands) {
      if (!logIncludesCommand(checkLog, command)) {
        errors.push(`${receiptPath}: results.testsPassed requires receipts.checkLog to include "${command}"`);
      }
    }
  }
}

function validateDiffClaims(receipt, receiptPath, diffChangedFiles, errors) {
  const patchFilesChanged = receipt.results?.patchFilesChanged;
  if (typeof patchFilesChanged === "number" && patchFilesChanged !== diffChangedFiles.length) {
    errors.push(
      `${receiptPath}: results.patchFilesChanged is ${patchFilesChanged}, but receipts.diff shows ${diffChangedFiles.length} changed file(s)`
    );
  }

  if (receipt.results?.addedRegressionTests === true && !didChangeTestFiles(diffChangedFiles)) {
    errors.push(
      `${receiptPath}: results.addedRegressionTests requires receipts.diff to change at least one test file`
    );
  }
}

function validateEvidenceQualityClaim(task, receipt, receiptPath, supportedVerificationCommands, errors) {
  const claimedEvidenceQuality = receipt.results?.evidenceQuality;
  if (typeof claimedEvidenceQuality !== "string") {
    return;
  }

  const supportedEvidenceQuality = inferEvidenceQuality({
    taskCompleted: receipt.results?.taskCompleted === true,
    testsPassed: receipt.results?.testsPassed === true,
    requiredCheckCoverage: computeRequiredCheckCoverage(task?.checks ?? [], supportedVerificationCommands),
    proofRequired: (task?.checks ?? []).includes("npm run proof:check"),
    reportedProofCheck: supportedVerificationCommands.includes("npm run proof:check"),
    addedRegressionTests: receipt.results?.addedRegressionTests === true,
    finalHandoffQuality: receipt.results?.finalHandoffQuality
  });

  if (qualityScore(claimedEvidenceQuality) > qualityScore(supportedEvidenceQuality)) {
    errors.push(
      `${receiptPath}: results.evidenceQuality "${claimedEvidenceQuality}" exceeds supported evidence quality "${supportedEvidenceQuality}"`
    );
  }
}

function validateRequiredBaselineArtifacts(task, receipts, receiptPath, errors) {
  if (!task) {
    return;
  }

  for (const check of task.checks ?? []) {
    const artifactName = baselineArtifactForCheck(check);
    if (!artifactName) {
      continue;
    }
    if (typeof receipts?.[artifactName] !== "string") {
      errors.push(`${receiptPath}: receipts.${artifactName} is required for task check "${check}"`);
    }
  }
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

function validateManifest(tasks) {
  const errors = [];
  const seenRunSlugs = new Set();

  for (const [index, task] of tasks.entries()) {
    if (task.runSlug === undefined) {
      continue;
    }
    if (typeof task.runSlug !== "string" || !isKebabCase(task.runSlug)) {
      errors.push(`tasks[${index}] (${task.id ?? "<unknown>"}): runSlug must be a lowercase kebab-case string`);
      continue;
    }
    if (seenRunSlugs.has(task.runSlug)) {
      errors.push(`duplicate task runSlug "${task.runSlug}"`);
      continue;
    }
    seenRunSlugs.add(task.runSlug);
  }

  return errors;
}

function validateRunId(receipt, task, receiptPath, errors) {
  if (typeof receipt.runId !== "string") {
    return;
  }

  if (!/^\d{8}-/u.test(receipt.runId)) {
    errors.push(`${receiptPath}: runId must start with YYYYMMDD-`);
    return;
  }

  if (!task?.runSlug || typeof receipt.conditionId !== "string") {
    return;
  }

  const runIdPattern = new RegExp(
    `^\\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*-${escapeRegex(task.runSlug)}-${escapeRegex(receipt.conditionId)}-\\d{3}$`,
    "u"
  );
  if (!runIdPattern.test(receipt.runId)) {
    errors.push(
      `${receiptPath}: runId must match YYYYMMDD-<agent>-${task.runSlug}-${receipt.conditionId}-NNN`
    );
  }
}

function summarizeReceipts(receipts, tasks) {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const scoredReceipts = receipts.map((receipt) => scoreReceipt(receipt, taskMap.get(receipt.taskId)));
  const byConditionScores = groupBy(scoredReceipts, (score) => score.conditionId);
  const byTaskScores = groupBy(scoredReceipts, (score) => score.taskId);
  const allConditionIds = [...new Set(tasks.flatMap((task) => task.conditions.map((condition) => condition.id)))].sort();
  const byCondition = allConditionIds.map((conditionId) => summarizeScoreGroup(conditionId, byConditionScores.get(conditionId) ?? []));
  const byTask = tasks.map((task) => summarizeTask(task, byTaskScores.get(task.id) ?? []));
  const allComparisons = byTask.flatMap((task) => task.comparisons);

  return {
    receiptsScored: scoredReceipts.length,
    comparableConditionPairs: allComparisons.length,
    repeatedConditionPairs: allComparisons.filter((comparison) => comparison.isRepeated).length,
    byCondition,
    byTask
  };
}

function scoreReceipt(receipt, task) {
  const results = receipt.results ?? {};
  const requiredChecks = task?.checks ?? [];
  const verificationCommands = Array.isArray(results.verificationCommandsRun) ? results.verificationCommandsRun : [];
  const supportedVerificationCommands = Array.isArray(receipt.__supportedVerificationCommands)
    ? receipt.__supportedVerificationCommands.filter((command) => typeof command === "string")
    : [];
  const diffChangedFiles = Array.isArray(receipt.__diffChangedFiles)
    ? receipt.__diffChangedFiles.filter((file) => typeof file === "string")
    : [];
  const diffLineStats = receipt.__diffLineStats ?? {};
  const requiredCheckCoverage = computeRequiredCheckCoverage(requiredChecks, supportedVerificationCommands);
  const proofRequired = requiredChecks.includes("npm run proof:check");
  const reportedProofCheck = typeof results.reportedProofCheck === "boolean"
    ? results.reportedProofCheck
    : verificationCommands.includes("npm run proof:check");
  const addedRegressionTests = typeof results.addedRegressionTests === "boolean"
    ? results.addedRegressionTests
    : null;
  const independentProofCheckPassed = typeof results.independentProofCheckPassed === "boolean"
    ? results.independentProofCheckPassed
    : null;
  const inferredEvidenceQuality = inferEvidenceQuality({
    taskCompleted: results.taskCompleted,
    testsPassed: results.testsPassed,
    requiredCheckCoverage,
    proofRequired,
    reportedProofCheck: supportedVerificationCommands.includes("npm run proof:check"),
    addedRegressionTests,
    finalHandoffQuality: results.finalHandoffQuality
  });
  const evidenceQuality = boundedEvidenceQuality(results.evidenceQuality, inferredEvidenceQuality);
  const proofCompletionScore = proofRequired ? (supportedVerificationCommands.includes("npm run proof:check") ? 1 : 0) : null;
  const regressionEvidenceScore = addedRegressionTests === null ? null : (addedRegressionTests ? 1 : 0);
  const patchLinesChanged = typeof diffLineStats.linesChanged === "number" ? diffLineStats.linesChanged : null;
  const normalizedQualityScore = average([
    results.taskCompleted === true ? 1 : 0,
    results.testsPassed === true ? 1 : 0,
    typeof results.scopeAdherence === "number" ? results.scopeAdherence : 0,
    requiredCheckCoverage,
    proofCompletionScore,
    regressionEvidenceScore,
    qualityScore(evidenceQuality),
    patchFocusScore(patchLinesChanged)
  ].filter((value) => value !== null));

  return {
    taskId: receipt.taskId,
    conditionId: receipt.conditionId,
    taskCompleted: results.taskCompleted === true,
    testsPassed: results.testsPassed === true,
    scopeAdherence: typeof results.scopeAdherence === "number" ? results.scopeAdherence : 0,
    patchFilesChanged: typeof results.patchFilesChanged === "number"
      ? results.patchFilesChanged
      : (diffChangedFiles.length > 0 ? diffChangedFiles.length : null),
    patchInsertions: typeof diffLineStats.insertions === "number" ? diffLineStats.insertions : null,
    patchDeletions: typeof diffLineStats.deletions === "number" ? diffLineStats.deletions : null,
    patchLinesChanged,
    requiredCheckCoverage,
    proofRequired,
    reportedProofCheck,
    independentProofCheckPassed,
    addedRegressionTests,
    finalHandoffQuality: results.finalHandoffQuality ?? "missing",
    evidenceQuality,
    evidenceQualityScore: qualityScore(evidenceQuality),
    normalizedQualityScore
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

function boundedEvidenceQuality(claimedQuality, inferredQuality) {
  if (!isKnownQuality(claimedQuality)) {
    return inferredQuality;
  }

  return qualityScore(claimedQuality) <= qualityScore(inferredQuality)
    ? claimedQuality
    : inferredQuality;
}

function summarizeTask(task, scores) {
  const byCondition = [...groupBy(scores, (score) => score.conditionId).entries()];
  const conditions = task.conditions
    .map((condition) => [condition.id, byCondition.find(([conditionId]) => conditionId === condition.id)?.[1] ?? []])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([conditionId, conditionScores]) => ({
      conditionId,
      receiptCount: conditionScores.length,
      requiredCheckCoverage: average(conditionScores.map((score) => score.requiredCheckCoverage)),
      proofCommandReportRate: summarizeOptionalBoolean(
        conditionScores.filter((score) => score.proofRequired).map((score) => score.reportedProofCheck)
      ),
      independentProofCheckPassRate: summarizeOptionalBoolean(
        conditionScores.filter((score) => score.proofRequired).map((score) => score.independentProofCheckPassed)
      ),
      regressionTestRate: summarizeOptionalBoolean(
        conditionScores.map((score) => score.addedRegressionTests)
      ),
      averagePatchFilesChanged: summarizeOptionalNumber(
        conditionScores.map((score) => score.patchFilesChanged)
      ),
      averagePatchLinesChanged: summarizeOptionalNumber(
        conditionScores.map((score) => score.patchLinesChanged)
      ),
      averageNormalizedQualityScore: average(
        conditionScores.map((score) => score.normalizedQualityScore)
      ),
      averageEvidenceQuality: average(conditionScores.map((score) => score.evidenceQualityScore)),
      evidenceQuality: bestQuality(conditionScores.map((score) => score.evidenceQuality))
    }));
  const comparisons = summarizeTaskComparisons(conditions);

  return {
    taskId: task.id,
    conditions,
    comparisons
  };
}

function summarizeTaskComparisons(conditions) {
  const comparisons = [];

  for (let index = 0; index < conditions.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < conditions.length; otherIndex += 1) {
      const left = conditions[index];
      const right = conditions[otherIndex];
      const comparableReceiptCount = Math.min(left.receiptCount, right.receiptCount);

      if (comparableReceiptCount === 0) {
        continue;
      }

      comparisons.push({
        leftConditionId: left.conditionId,
        rightConditionId: right.conditionId,
        comparableReceiptCount,
        isRepeated: comparableReceiptCount >= 2,
        normalizedQualityDelta: subtractNullable(
          left.averageNormalizedQualityScore,
          right.averageNormalizedQualityScore
        ),
        evidenceQualityDelta: subtractNullable(
          left.averageEvidenceQuality,
          right.averageEvidenceQuality
        ),
        independentProofCheckPassDelta: subtractNullable(
          left.independentProofCheckPassRate,
          right.independentProofCheckPassRate
        ),
        proofCommandReportDelta: subtractNullable(
          left.proofCommandReportRate,
          right.proofCommandReportRate
        ),
        regressionTestDelta: subtractNullable(
          left.regressionTestRate,
          right.regressionTestRate
        )
      });
    }
  }

  return comparisons;
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
    averagePatchFilesChanged: summarizeOptionalNumber(scores.map((score) => score.patchFilesChanged)),
    averagePatchLinesChanged: summarizeOptionalNumber(scores.map((score) => score.patchLinesChanged)),
    averageNormalizedQualityScore: average(scores.map((score) => score.normalizedQualityScore)),
    proofCommandReportRate: proofScores.length === 0
      ? null
      : average(proofScores.map((score) => score.reportedProofCheck ? 1 : 0)),
    independentProofCheckPassRate: proofScores.length === 0
      ? null
      : average(proofScores.map((score) => score.independentProofCheckPassed ? 1 : 0)),
    regressionTestRate: regressionScores.length === 0
      ? null
      : average(regressionScores.map((score) => score.addedRegressionTests ? 1 : 0)),
    strongHandoffRate: average(scores.map((score) => score.finalHandoffQuality === "strong" ? 1 : 0)),
    averageEvidenceQuality: average(scores.map((score) => score.evidenceQualityScore))
  };
}

function baselineArtifactForCheck(check) {
  if (check.startsWith("npm test")) {
    return "baselineTestLog";
  }
  if (check === "npm run lint") {
    return "baselineLintLog";
  }
  if (check === "npm run proof:check") {
    return "baselineProofLog";
  }
  if (check === "npm run scope:check") {
    return "baselineScopeLog";
  }
  return null;
}

function supportedCommandsForLog(checks, checkLog) {
  return checks.filter((check) => logIncludesCommand(checkLog, check));
}

function parseDiffChangedFiles(diffText) {
  return parseDiffStats(diffText).files;
}

function parseDiffStats(diffText) {
  const files = [];
  let insertions = 0;
  let deletions = 0;

  for (const line of diffText.split(/\r?\n/u)) {
    if (line.startsWith("diff --git ")) {
      const match = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
      if (match) {
        files.push(match[2]);
      }
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      insertions += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions += 1;
    }
  }

  return {
    files: [...new Set(files)],
    insertions,
    deletions,
    linesChanged: insertions + deletions
  };
}

function didChangeTestFiles(diffChangedFiles) {
  return diffChangedFiles.some((file) => /(^|\/)tests\//u.test(file));
}

function logIncludesCommand(logText, command) {
  return commandMarkers(command).some((marker) => logText.includes(marker));
}

function commandMarkers(command) {
  if (command.startsWith("npm test -- ")) {
    return [`node scripts/test.mjs ${command.slice("npm test -- ".length)}`];
  }
  if (command === "npm run lint") {
    return ["node scripts/lint.mjs"];
  }
  if (command === "npm run proof:check") {
    return ["node scripts/proof-check.mjs"];
  }
  if (command === "npm run scope:check") {
    return ["node scripts/scope-check.mjs"];
  }
  return [command];
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

function patchFocusScore(patchLinesChanged) {
  if (typeof patchLinesChanged !== "number" || patchLinesChanged <= 0) {
    return null;
  }

  return round(Math.min(1, 40 / patchLinesChanged));
}

function isKnownQuality(quality) {
  return ["missing", "weak", "adequate", "strong"].includes(quality);
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

function summarizeOptionalNumber(values) {
  const concreteValues = values.filter((value) => typeof value === "number");

  if (concreteValues.length === 0) {
    return null;
  }

  return average(concreteValues);
}

function average(values) {
  if (values.length === 0) {
    return null;
  }
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function subtractNullable(left, right) {
  if (typeof left !== "number" || typeof right !== "number") {
    return null;
  }

  return round(left - right);
}

function computeRequiredCheckCoverage(requiredChecks, verificationCommands) {
  if (requiredChecks.length === 0) {
    return 1;
  }

  return requiredChecks.filter((check) => verificationCommands.includes(check)).length / requiredChecks.length;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function hasDuplicates(values) {
  return new Set(values).size !== values.length;
}

function isKebabCase(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

function escapeRegex(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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
