import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const examplePath = fileURLToPath(new URL("../examples/fix-login-race.agent", import.meta.url));
const exampleContractPath = fileURLToPath(new URL("../examples/fix-login-race.agentfile", import.meta.url));

const tempDirs: string[] = [];

const runCli = (args: string[], cwd: string) => execFileAsync("node", [cliPath, ...args], { cwd });

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("agentfile init", () => {
  it("creates a Pact source starter when requested explicitly", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-agent-"));
    tempDirs.push(cwd);

    const outputPath = join(cwd, "starter.agent");
    await runCli(["init", outputPath, "--format", "agent"], cwd);

    const content = await readFile(outputPath, "utf8");
    expect(content).toContain("mission my-agent-task {");
    expect(content).toContain('goal "State the concrete outcome the agent should produce"');

    const { stdout } = await runCli(["compile", outputPath, "--target", "json"], cwd);
    const contract = JSON.parse(stdout);

    expect(contract.task.id).toBe("my-agent-task");
    expect(contract.permissions.network.default).toBe("deny");
    expect(contract.checks).toEqual([
      {
        id: "npm-test",
        command: "npm test",
        required: true
      }
    ]);
  }, 15000);

  it("infers a Pact source starter from the .agent extension", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-agent-ext-"));
    tempDirs.push(cwd);

    const outputPath = join(cwd, "agentfile.agent");
    await runCli(["init", outputPath], cwd);

    const content = await readFile(outputPath, "utf8");
    expect(content).toContain("mission my-agent-task {");
    expect(content).not.toContain('agentfile: "0.1.0"');
  }, 10000);
});

describe("agentfile sync", () => {
  it("creates the default Cursor rule path", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-sync-"));
    tempDirs.push(cwd);

    await runCli(["sync", examplePath, "--target", "cursor-mdc"], cwd);

    const outputPath = join(cwd, ".cursor/rules/agentfile.mdc");
    const content = await readFile(outputPath, "utf8");

    expect(content).toContain("alwaysApply: true");
    expect(content).toContain("# fix-login-refresh-race");
  });

  it("rejects non file-backed compile targets", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-sync-invalid-"));
    tempDirs.push(cwd);

    await expect(
      runCli(["sync", examplePath, "--target", "yaml"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        'sync target "yaml" is not file-backed. Expected "agents-md", "claude-md", "cursor-mdc", "copilot-md".'
      )
    });
  });
});

describe("agentfile targets", () => {
  it("lists compile targets and file-backed output paths", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-targets-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["targets"], cwd);

    expect(stdout).toContain("json");
    expect(stdout).toContain("strict JSON contract IR");
    expect(stdout).toContain("agents-md -> AGENTS.md");
    expect(stdout).toContain("cursor-mdc -> .cursor/rules/agentfile.mdc");
  });
});

describe("agentfile file discovery", () => {
  it("resolves agentfile.agent when no file path is provided", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-discovery-"));
    tempDirs.push(cwd);

    const source = await readFile(examplePath, "utf8");
    await writeFile(join(cwd, "agentfile.agent"), source, "utf8");

    const { stdout } = await runCli(["compile", "--target", "json"], cwd);
    const contract = JSON.parse(stdout);

    expect(contract.task.id).toBe("fix-login-refresh-race");
    expect(contract.info.summary).toContain("duplicate token refresh requests");
    expect(contract.permissions.network.default).toBe("deny");
  });

  it("compiles normalized policy JSON through the CLI", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-policy-json-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["compile", examplePath, "--target", "policy-json"], cwd);
    const policy = JSON.parse(stdout);

    expect(policy.agentfile).toBe("0.1.0");
    expect(policy.task).toBe("fix-login-refresh-race");
    expect(policy.permissions.network.default).toBe("deny");
    expect(policy.workflow.id).toBe("implement");
  });

  it("compiles YAML IR back into Pact source through the CLI", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-agent-target-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["compile", exampleContractPath, "--target", "agent"], cwd);

    expect(stdout).toContain("mission fix-login-refresh-race {");
    expect(stdout).toContain('version "0.1.0"');
    expect(stdout).toContain('license "MIT"');
    expect(stdout).toContain('summary "Prevent duplicate token refresh requests during concurrent auth calls."');
    expect(stdout).toContain("touch src/auth/**, tests/auth/**");
    expect(stdout).toContain("exclude src/billing/**, infra/**");
    expect(stdout).toContain("deny .env, .env.*");
    expect(stdout).toContain("cannot use network");
    expect(stdout).toContain("cannot read secrets");
    expect(stdout).toContain('must "Public auth APIs must not change."');
    expect(stdout).toContain('must_not "Refresh tokens must never be logged."');
  });

  it("rejects agent target compilation when IR scope cannot be represented as Pact source", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-agent-invalid-scope-"));
    tempDirs.push(cwd);

    const contractPath = join(cwd, "scope-only.agentfile");
    await writeFile(contractPath, `agentfile: "0.1.0"
kind: TaskContract
info:
  title: scope-only
task:
  id: scope-only
  goal: Exercise agent-target representability diagnostics.
scope:
  include:
    - src/**
workflow:
  id: implement
  acceptance:
    - Done.
`, "utf8");

    await expect(
      runCli(["compile", contractPath, "--target", "agent"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        'cannot compile target "agent": scope.include path must appear in permissions.filesystem.read to render Pact source: src/**'
      )
    });
  });
});

describe("agentfile lint", () => {
  it("reports risky authority warnings without failing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-lint-"));
    tempDirs.push(cwd);

    const contractPath = join(cwd, "risky.agentfile");
    await writeFile(contractPath, `agentfile: "0.1.0"
kind: TaskContract
info:
  title: risky-authority
task:
  id: risky-authority
  goal: Exercise lint output.
scope:
  include:
    - src/**
    - "**"
permissions:
  network:
    default: allow
  filesystem:
    read:
      - src/**
      - "**"
    write:
      - "**"
  secrets:
    access: allow
  approvals:
    requiredFor:
      - dependency_change
      - network_access
      - scope_expansion
      - secret_access
workflow:
  id: implement
  acceptance:
    - Done.
`, "utf8");

    const { stdout } = await runCli(["lint", contractPath], cwd);

    expect(stdout).toContain(`WARN ${contractPath}`);
    expect(stdout).toContain("scope.include: mission scope includes the entire repository");
    expect(stdout).toContain("permissions.network.default: broad network access is enabled");
    expect(stdout).toContain("permissions.secrets.access: secret access allows every secret");
    expect(stdout).toContain("permissions.filesystem.read: filesystem read scope is repository-wide");
    expect(stdout).toContain("permissions.filesystem.write: filesystem write scope is repository-wide");
  });

  it("reports missing approval gates for risky authority", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-lint-approvals-"));
    tempDirs.push(cwd);

    const contractPath = join(cwd, "approval-gates.agentfile");
    await writeFile(contractPath, `agentfile: "0.1.0"
kind: TaskContract
info:
  title: approval-gates
task:
  id: approval-gates
  goal: Exercise approval-gate lint output.
scope:
  include:
    - src/**
permissions:
  shell:
    allow:
      - npm publish
      - pnpm add zod
      - rm -rf dist
  network:
    default: deny
    allow:
      - api.github.com
  secrets:
    access: allow
    allow:
      - OPENAI_API_KEY
  approvals:
    requiredFor:
      - scope_expansion
workflow:
  id: implement
  acceptance:
    - Done.
`, "utf8");

    const { stdout } = await runCli(["lint", contractPath], cwd);

    expect(stdout).toContain(`WARN ${contractPath}`);
    expect(stdout).toContain("permissions.approvals.requiredFor: publish command is allowed without release_publish approval gating: npm publish");
    expect(stdout).toContain("permissions.approvals.requiredFor: dependency-changing command is allowed without dependency_change approval gating: pnpm add zod");
    expect(stdout).toContain("permissions.approvals.requiredFor: destructive command is allowed without destructive_write approval gating: rm -rf dist");
    expect(stdout).toContain("permissions.approvals.requiredFor: network access is allowed without network_access approval gating");
    expect(stdout).toContain("permissions.approvals.requiredFor: secret access is allowed without secret_access approval gating");
  });

  it("reports missing proof obligations and executable checks", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-lint-proof-"));
    tempDirs.push(cwd);

    const noProofPath = join(cwd, "missing-proof.agentfile");
    await writeFile(noProofPath, `agentfile: "0.1.0"
kind: TaskContract
info:
  title: missing-proof
task:
  id: missing-proof
  goal: Exercise proof lint output.
scope:
  include:
    - src/**
workflow:
  id: implement
`, "utf8");

    const manualOnlyPath = join(cwd, "manual-proof.agentfile");
    await writeFile(manualOnlyPath, `agentfile: "0.1.0"
kind: TaskContract
info:
  title: manual-proof
task:
  id: manual-proof
  goal: Exercise executable proof lint output.
scope:
  include:
    - src/**
checks:
  - id: review-logs
    description: Review the auth logs
workflow:
  id: implement
  acceptance:
    - Auth logs look correct.
`, "utf8");

    const missingProof = await runCli(["lint", noProofPath], cwd);
    expect(missingProof.stdout).toContain(`WARN ${noProofPath}`);
    expect(missingProof.stdout).toContain(
      "checks: contract defines no proof requirements; add a check or workflow.acceptance expectation"
    );

    const manualOnly = await runCli(["lint", manualOnlyPath], cwd);
    expect(manualOnly.stdout).toContain(`WARN ${manualOnlyPath}`);
    expect(manualOnly.stdout).toContain(
      "checks: contract has no executable verification command; prefer at least one command-backed check"
    );
  });
});
