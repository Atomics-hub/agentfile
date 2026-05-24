import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const baseline = JSON.parse(await readFile(".benchmark/scope-baseline.json", "utf8"));
let failed = false;

for (const [file, expectedHash] of Object.entries(baseline)) {
  const content = await readFile(file);
  const actualHash = createHash("sha256").update(content).digest("hex");

  if (actualHash !== expectedHash) {
    console.error(`${file} changed but is outside the benchmark task scope`);
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
}
