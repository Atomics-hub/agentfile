import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const patterns = args.includes("webhooks")
  ? ["tests/webhooks/*.test.js"]
  : ["tests/**/*.test.js"];

const child = spawn(process.execPath, ["--test", ...patterns], {
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
