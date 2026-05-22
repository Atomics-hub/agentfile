import { spawnSync } from "node:child_process";

const files = [
  "src/auth/logging.js",
  "tests/auth/logging.test.js",
  "scripts/test.mjs",
  "scripts/lint.mjs",
  "scripts/proof-check.mjs"
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

