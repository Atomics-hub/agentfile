import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const examplePath = fileURLToPath(new URL("../examples/fix-login-race.agent", import.meta.url));
const tsxPath = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("agentfile sync", () => {
  it("creates the default Cursor rule path", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-sync-"));
    tempDirs.push(cwd);

    await execFileAsync("node", [tsxPath, cliPath, "sync", examplePath, "--target", "cursor-mdc"], { cwd });

    const outputPath = join(cwd, ".cursor/rules/agentfile.mdc");
    const content = await readFile(outputPath, "utf8");

    expect(content).toContain("alwaysApply: true");
    expect(content).toContain("# fix-login-refresh-race");
  });

  it("rejects non file-backed compile targets", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-sync-invalid-"));
    tempDirs.push(cwd);

    await expect(
      execFileAsync("node", [tsxPath, cliPath, "sync", examplePath, "--target", "yaml"], { cwd })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        'sync target "yaml" is not file-backed. Expected "agents-md", "claude-md", "cursor-mdc", or "copilot-md".'
      )
    });
  });
});

describe("agentfile file discovery", () => {
  it("resolves agentfile.agent when no file path is provided", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-discovery-"));
    tempDirs.push(cwd);

    const source = await readFile(examplePath, "utf8");
    await writeFile(join(cwd, "agentfile.agent"), source, "utf8");

    const { stdout } = await execFileAsync("node", [tsxPath, cliPath, "compile", "--target", "json"], { cwd });
    const contract = JSON.parse(stdout);

    expect(contract.task.id).toBe("fix-login-refresh-race");
    expect(contract.info.summary).toContain("duplicate token refresh requests");
    expect(contract.permissions.network.default).toBe("deny");
  });

  it("compiles normalized policy JSON through the CLI", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-policy-json-"));
    tempDirs.push(cwd);

    const { stdout } = await execFileAsync("node", [tsxPath, cliPath, "compile", examplePath, "--target", "policy-json"], {
      cwd
    });
    const policy = JSON.parse(stdout);

    expect(policy.agentfile).toBe("0.1.0");
    expect(policy.task).toBe("fix-login-refresh-race");
    expect(policy.permissions.network.default).toBe("deny");
    expect(policy.workflow.id).toBe("implement");
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
workflow:
  id: implement
  acceptance:
    - Done.
`, "utf8");

    const { stdout } = await execFileAsync("node", [tsxPath, cliPath, "lint", contractPath], { cwd });

    expect(stdout).toContain(`WARN ${contractPath}`);
    expect(stdout).toContain("permissions.network.default: broad network access is enabled");
    expect(stdout).toContain("permissions.secrets.access: secret access allows every secret");
    expect(stdout).toContain("permissions.filesystem.write: filesystem write scope is repository-wide");
  });
});
