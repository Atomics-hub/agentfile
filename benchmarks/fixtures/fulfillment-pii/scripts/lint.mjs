import { spawnSync } from "node:child_process";

const files = [
  "src/fulfillment/label.js",
  "src/crm/customer-records.js",
  "tests/fulfillment/label.test.js",
  "tests/crm/customer-records.test.js",
  "scripts/test.mjs",
  "scripts/lint.mjs",
  "scripts/proof-check.mjs",
  "scripts/scope-check.mjs"
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exitCode = result.status ?? 1;
    break;
  }
}
