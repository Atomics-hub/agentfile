import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "benchmarks/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const missingInputs = [];
for (const task of manifest.tasks ?? []) {
  for (const condition of task.conditions ?? []) {
    const inputPath = resolve(root, condition.input);
    try {
      await access(inputPath);
    } catch {
      missingInputs.push(condition.input);
    }
  }
}

if (missingInputs.length > 0) {
  console.error(`Missing benchmark inputs:\n${missingInputs.map((input) => `- ${input}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: manifest.status,
    claimStatus: manifest.claimStatus,
    claimToTest: manifest.claimToTest,
    taskCount: manifest.tasks.length,
    conditionCount: manifest.tasks.reduce((count, task) => count + task.conditions.length, 0),
    metrics: manifest.metrics,
    tasks: manifest.tasks.map((task) => ({
      id: task.id,
      family: task.family,
      checks: task.checks,
      conditions: task.conditions.map((condition) => ({
        id: condition.id,
        input: condition.input
      }))
    }))
  }, null, 2));
}

