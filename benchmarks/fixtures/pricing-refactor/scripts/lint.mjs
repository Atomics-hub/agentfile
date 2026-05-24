import { spawnSync } from "node:child_process";

const files = [
  "src/invoices/summary.js",
  "src/orders/quote.js",
  "src/pricing/discounts.js",
  "src/tax/rounding.js",
  "tests/pricing/discounts.test.js",
  "scripts/test.mjs",
  "scripts/lint.mjs",
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
