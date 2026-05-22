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

describe("demo golden outputs", () => {
  it.each(demoTargets)("keeps %s output stable", async (target, fixturePath) => {
    const source = await readFile("examples/fix-login-race.agent", "utf8");
    const agentfile = parseSource(source, "examples/fix-login-race.agent");
    const expected = await readFile(fixturePath, "utf8");

    expect(compileAgentfile(agentfile, target)).toBe(expected);
  });
});

