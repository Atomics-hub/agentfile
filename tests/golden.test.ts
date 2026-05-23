import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { compileAgentfile, parseSource, type CompileTarget } from "../src/index.js";

const demoTargets = [
  ["yaml", "tests/fixtures/demo/fix-login-race.yaml"],
  ["policy-json", "tests/fixtures/demo/fix-login-race.policy.json"],
  ["agents-md", "tests/fixtures/demo/AGENTS.md"],
  ["claude-md", "tests/fixtures/demo/CLAUDE.md"],
  ["cursor-mdc", "tests/fixtures/demo/agentfile.mdc"],
  ["copilot-md", "tests/fixtures/demo/copilot-instructions.md"]
] as const satisfies ReadonlyArray<readonly [CompileTarget, string]>;

const benchmarkCompiledAgentsFixtures = [
  [
    "benchmarks/tasks/redact-logs/redact-logs.agent",
    "benchmarks/tasks/redact-logs/compiled-agentfile.AGENTS.md"
  ],
  [
    "benchmarks/tasks/webhook-signature/webhook-signature.agent",
    "benchmarks/tasks/webhook-signature/compiled-agentfile.AGENTS.md"
  ]
] as const;

describe("demo golden outputs", () => {
  it.each(demoTargets)("keeps %s output stable", async (target, fixturePath) => {
    const source = await readFile("examples/fix-login-race.agent", "utf8");
    const agentfile = parseSource(source, "examples/fix-login-race.agent");
    const expected = await readFile(fixturePath, "utf8");

    expect(compileAgentfile(agentfile, target)).toBe(expected);
  });
});

describe("benchmark compiled AGENTS.md fixtures", () => {
  it.each(benchmarkCompiledAgentsFixtures)(
    "keeps %s synced with generated AGENTS.md output",
    async (sourcePath, fixturePath) => {
      const source = await readFile(sourcePath, "utf8");
      const agentfile = parseSource(source, sourcePath);
      const expected = await readFile(fixturePath, "utf8");

      expect(compileAgentfile(agentfile, "agents-md")).toBe(expected);
    }
  );
});
