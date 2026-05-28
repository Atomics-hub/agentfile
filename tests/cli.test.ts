import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const examplePath = fileURLToPath(new URL("../examples/fix-login-race.agent", import.meta.url));
const exampleContractPath = fileURLToPath(new URL("../examples/fix-login-race.agentfile", import.meta.url));
const passingReceiptPath = fileURLToPath(new URL("../examples/receipts/fix-login-passing.receipt.json", import.meta.url));
const pendingReceiptPath = fileURLToPath(new URL("../examples/receipts/fix-login-pending.receipt.json", import.meta.url));

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

  it("uses agentfile.agent as the default path for Pact source init", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-agent-default-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["init", "--format", "agent"], cwd);

    expect(stdout).toContain("Created agentfile.agent");
    const content = await readFile(join(cwd, "agentfile.agent"), "utf8");
    expect(content).toContain("mission my-agent-task {");
    await expect(readFile(join(cwd, "agentfile.yaml"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  }, 10000);

  it("creates the reviewable starter kit", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-kit-reviewable-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["init", "--kit", "reviewable"], cwd);

    expect(stdout).toContain("Created agentfile.agent");
    expect(stdout).toContain("Created .vscode/agentfile.schema.json");
    expect(stdout).toContain("Created .vscode/settings.json");
    expect(stdout).toContain("Created .github/workflows/agentfile.yml");

    await runCli(["check", "agentfile.agent"], cwd);
    await runCli(["schema", "--output", ".vscode/agentfile.schema.json", "--check"], cwd);
    await runCli(["editor", "vscode", "--output", ".vscode/settings.json", "--check"], cwd);
    await runCli([
      "github-actions",
      "agentfile.agent",
      "--surfaces",
      "none",
      "--receipt",
      "receipts/latest.receipt.json",
      "--output",
      ".github/workflows/agentfile.yml",
      "--check"
    ], cwd);

    await expect(readFile(join(cwd, "agentfile.yaml"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  }, 15000);

  it("allows generated surface gates with the reviewable starter kit", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-kit-surfaces-"));
    tempDirs.push(cwd);

    await runCli(["init", "--kit", "reviewable", "--github-actions-surfaces", "agents-md"], cwd);

    const generated = await readFile(join(cwd, "AGENTS.md"), "utf8");
    expect(generated).toContain("# my-agent-task");

    const workflow = await readFile(join(cwd, ".github", "workflows", "agentfile.yml"), "utf8");
    expect(workflow).toContain("sync 'agentfile.agent' --target agents-md --output 'AGENTS.md' --check");
    expect(workflow).toContain("if: hashFiles('receipts/latest.receipt.json') != ''");
    await runCli(["sync", "agentfile.agent", "--target", "agents-md", "--output", "AGENTS.md", "--check"], cwd);
  }, 15000);

  it("respects explicit YAML format with the reviewable starter kit", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-kit-yaml-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["init", "--kit", "reviewable", "--format", "yaml"], cwd);

    expect(stdout).toContain("Created agentfile.yaml");
    const contract = await readFile(join(cwd, "agentfile.yaml"), "utf8");
    expect(contract).toContain('agentfile: "0.1.0"');

    const workflow = await readFile(join(cwd, ".github", "workflows", "agentfile.yml"), "utf8");
    expect(workflow).toContain("inspect 'agentfile.yaml' --fail-on stale-surfaces,lint --format json");
    await runCli([
      "github-actions",
      "agentfile.yaml",
      "--surfaces",
      "none",
      "--receipt",
      "receipts/latest.receipt.json",
      "--output",
      ".github/workflows/agentfile.yml",
      "--check"
    ], cwd);
  }, 15000);

  it("rejects unknown init kits", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-kit-unknown-"));
    tempDirs.push(cwd);

    await expect(
      runCli(["init", "--kit", "everything"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('unknown init kit "everything". Expected "reviewable".')
    });
  });

  it("creates a Pact starter with VS Code schema files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-vscode-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["init", "agentfile.agent", "--editor", "vscode"], cwd);

    expect(stdout).toContain("Created agentfile.agent");
    expect(stdout).toContain("Created .vscode/agentfile.schema.json");
    expect(stdout).toContain("Created .vscode/settings.json");

    const contract = await readFile(join(cwd, "agentfile.agent"), "utf8");
    expect(contract).toContain("mission my-agent-task {");

    const schema = JSON.parse(await readFile(join(cwd, ".vscode", "agentfile.schema.json"), "utf8"));
    expect(schema.title).toBe("Agentfile TaskContract");

    const settings = JSON.parse(await readFile(join(cwd, ".vscode", "settings.json"), "utf8"));
    expect(settings["yaml.schemas"][".vscode/agentfile.schema.json"]).toContain("agentfile.yaml");

    await runCli(["check", "agentfile.agent"], cwd);
    await runCli(["schema", "--output", ".vscode/agentfile.schema.json", "--check"], cwd);
    await runCli(["editor", "vscode", "--output", ".vscode/settings.json", "--check"], cwd);
  }, 15000);

  it("supports a custom schema path for init editor setup", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-vscode-schema-"));
    tempDirs.push(cwd);

    await runCli(["init", "agentfile.agent", "--editor", "vscode", "--schema", "schemas/agentfile.schema.json"], cwd);

    const schema = JSON.parse(await readFile(join(cwd, "schemas", "agentfile.schema.json"), "utf8"));
    expect(schema.title).toBe("Agentfile TaskContract");

    const settings = JSON.parse(await readFile(join(cwd, ".vscode", "settings.json"), "utf8"));
    expect(settings["yaml.schemas"]["schemas/agentfile.schema.json"]).toContain("agentfile.yml");
    expect(settings["json.schemas"][0].url).toBe("schemas/agentfile.schema.json");
  });

  it("preflights init editor setup without partially writing files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-vscode-conflict-"));
    tempDirs.push(cwd);

    await mkdir(join(cwd, ".vscode"), { recursive: true });
    await writeFile(join(cwd, ".vscode", "agentfile.schema.json"), "{}\n", "utf8");

    await expect(
      runCli(["init", "agentfile.agent", "--editor", "vscode"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("refusing to overwrite existing init files:")
    });

    await expect(readFile(join(cwd, "agentfile.agent"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(readFile(join(cwd, ".vscode", "settings.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("rejects overlapping init output paths", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-vscode-overlap-"));
    tempDirs.push(cwd);

    await expect(
      runCli(["init", "agentfile.agent", "--editor", "vscode", "--schema", ".vscode/settings.json"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("init output paths must be unique: .vscode/settings.json")
    });

    await expect(readFile(join(cwd, "agentfile.agent"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("creates a Pact starter with a GitHub Actions validation workflow", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-actions-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["init", "agentfile.agent", "--github-actions"], cwd);

    expect(stdout).toContain("Created agentfile.agent");
    expect(stdout).toContain("Created .github/workflows/agentfile.yml");

    const workflow = await readFile(join(cwd, ".github", "workflows", "agentfile.yml"), "utf8");
    expect(workflow).toContain("Inspect contract readiness");
    expect(workflow).toContain("inspect 'agentfile.agent' --fail-on stale-surfaces,lint --format json");
    expect(workflow).not.toContain("--target agents-md");
    expect(workflow).not.toContain("--target claude-md");

    await runCli(["check", "agentfile.agent"], cwd);
    await runCli([
      "github-actions",
      "agentfile.agent",
      "--surfaces",
      "none",
      "--output",
      ".github/workflows/agentfile.yml",
      "--check"
    ], cwd);
  }, 15000);

  it("creates a GitHub Actions receipt gate when requested during init", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-actions-receipt-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli([
      "init",
      "agentfile.agent",
      "--github-actions",
      "--github-actions-receipt",
      "receipts/latest.receipt.json"
    ], cwd);

    expect(stdout).toContain("Created .github/workflows/agentfile.yml");

    const workflow = await readFile(join(cwd, ".github", "workflows", "agentfile.yml"), "utf8");
    expect(workflow).toContain("if: hashFiles('receipts/latest.receipt.json') != ''");
    expect(workflow).toContain("receipt verify 'agentfile.agent' 'receipts/latest.receipt.json'");

    await runCli([
      "github-actions",
      "agentfile.agent",
      "--surfaces",
      "none",
      "--receipt",
      "receipts/latest.receipt.json",
      "--output",
      ".github/workflows/agentfile.yml",
      "--check"
    ], cwd);
  }, 15000);

  it("creates selected generated surfaces for init GitHub Actions gates", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-actions-surfaces-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli([
      "init",
      "agentfile.agent",
      "--github-actions",
      "--github-actions-surfaces",
      "agents-md,claude-md"
    ], cwd);

    expect(stdout).toContain("Created AGENTS.md");
    expect(stdout).toContain("Created CLAUDE.md");
    expect(stdout).toContain("Created .github/workflows/agentfile.yml");

    const workflow = await readFile(join(cwd, ".github", "workflows", "agentfile.yml"), "utf8");
    expect(workflow).toContain("sync 'agentfile.agent' --target agents-md --output 'AGENTS.md' --check");
    expect(workflow).toContain("sync 'agentfile.agent' --target claude-md --output 'CLAUDE.md' --check");

    await runCli(["sync", "agentfile.agent", "--target", "agents-md", "--output", "AGENTS.md", "--check"], cwd);
    await runCli(["sync", "agentfile.agent", "--target", "claude-md", "--output", "CLAUDE.md", "--check"], cwd);
    await runCli([
      "github-actions",
      "agentfile.agent",
      "--surfaces",
      "agents-md,claude-md",
      "--output",
      ".github/workflows/agentfile.yml",
      "--check"
    ], cwd);
  }, 15000);

  it("preflights init GitHub Actions setup without partially writing files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-actions-conflict-"));
    tempDirs.push(cwd);

    await mkdir(join(cwd, ".github", "workflows"), { recursive: true });
    await writeFile(join(cwd, ".github", "workflows", "agentfile.yml"), "existing workflow\n", "utf8");

    await expect(
      runCli(["init", "agentfile.agent", "--github-actions"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("refusing to overwrite existing init files:")
    });

    await expect(readFile(join(cwd, "agentfile.agent"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("requires --github-actions before init GitHub Actions surface gates", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-actions-requires-"));
    tempDirs.push(cwd);

    await expect(
      runCli(["init", "agentfile.agent", "--github-actions-surfaces", "agents-md"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("init --github-actions-surfaces requires --github-actions")
    });

    await expect(readFile(join(cwd, "agentfile.agent"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("requires --github-actions before init GitHub Actions receipt gates", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-actions-receipt-requires-"));
    tempDirs.push(cwd);

    await expect(
      runCli(["init", "agentfile.agent", "--github-actions-receipt", "receipts/latest.receipt.json"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("init --github-actions-receipt requires --github-actions")
    });

    await expect(readFile(join(cwd, "agentfile.agent"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("requires --github-actions before init GitHub Actions check runs", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-init-actions-checks-requires-"));
    tempDirs.push(cwd);

    await expect(
      runCli(["init", "agentfile.agent", "--github-actions-run-checks"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("init --github-actions-run-checks requires --github-actions")
    });

    await expect(readFile(join(cwd, "agentfile.agent"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});

describe("agentfile adopt", () => {
  it("creates a complete existing-repo adoption kit", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-adopt-"));
    tempDirs.push(cwd);
    await writeFile(join(cwd, "package.json"), "{\"private\": true}\n", "utf8");

    const { stdout } = await runCli(["adopt"], cwd);

    expect(stdout).toContain("Created agentfile.agent");
    expect(stdout).toContain("Created .vscode/agentfile.schema.json");
    expect(stdout).toContain("Created .vscode/settings.json");
    expect(stdout).toContain("Created AGENTS.md");
    expect(stdout).toContain("Created CLAUDE.md");
    expect(stdout).toContain("Created .cursor/rules/agentfile.mdc");
    expect(stdout).toContain("Created .github/copilot-instructions.md");
    expect(stdout).toContain("Created .github/workflows/agentfile.yml");

    expect(await readFile(join(cwd, "AGENTS.md"), "utf8")).toContain("# my-agent-task");
    expect(await readFile(join(cwd, "CLAUDE.md"), "utf8")).toContain("# my-agent-task");
    expect(await readFile(join(cwd, ".cursor", "rules", "agentfile.mdc"), "utf8")).toContain("# my-agent-task");
    expect(await readFile(join(cwd, ".github", "copilot-instructions.md"), "utf8")).toContain("# my-agent-task");

    const workflow = await readFile(join(cwd, ".github", "workflows", "agentfile.yml"), "utf8");
    expect(workflow).toContain("sync 'agentfile.agent' --target agents-md --output 'AGENTS.md' --check");
    expect(workflow).toContain("sync 'agentfile.agent' --target claude-md --output 'CLAUDE.md' --check");
    expect(workflow).toContain("sync 'agentfile.agent' --target cursor-mdc --output '.cursor/rules/agentfile.mdc' --check");
    expect(workflow).toContain("sync 'agentfile.agent' --target copilot-md --output '.github/copilot-instructions.md' --check");
    expect(workflow).toContain("receipt verify 'agentfile.agent' 'receipts/latest.receipt.json'");

    await runCli(["check", "agentfile.agent"], cwd);
    await runCli(["sync", "agentfile.agent", "--all", "--check"], cwd);
    await runCli(["schema", "--output", ".vscode/agentfile.schema.json", "--check"], cwd);
    await runCli(["editor", "vscode", "--output", ".vscode/settings.json", "--check"], cwd);
    await runCli([
      "github-actions",
      "agentfile.agent",
      "--surfaces",
      "agents-md,claude-md,cursor-mdc,copilot-md",
      "--receipt",
      "receipts/latest.receipt.json",
      "--output",
      ".github/workflows/agentfile.yml",
      "--check"
    ], cwd);
  }, 20000);

  it("can generate an adoption workflow with command-backed check runs", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-adopt-run-checks-"));
    tempDirs.push(cwd);
    await writeFile(join(cwd, "package.json"), "{\"private\": true}\n", "utf8");

    await runCli(["adopt", "--run-checks"], cwd);

    const workflow = await readFile(join(cwd, ".github", "workflows", "agentfile.yml"), "utf8");
    expect(workflow).toContain("checks run 'agentfile.agent' --log 'logs/checks.txt' --results 'logs/check-results.json'");
    expect(workflow).toContain("receipt fill 'agentfile.agent' 'receipts/latest.receipt.json' --check-results 'logs/check-results.json' --write");

    await runCli([
      "github-actions",
      "agentfile.agent",
      "--surfaces",
      "agents-md,claude-md,cursor-mdc,copilot-md",
      "--receipt",
      "receipts/latest.receipt.json",
      "--run-checks",
      "--output",
      ".github/workflows/agentfile.yml",
      "--check"
    ], cwd);
  }, 20000);

  it("preflights adoption without partially writing files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-adopt-conflict-"));
    tempDirs.push(cwd);
    await writeFile(join(cwd, "AGENTS.md"), "existing agent instructions\n", "utf8");

    await expect(
      runCli(["adopt"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("refusing to overwrite existing init files:")
    });

    await expect(readFile(join(cwd, "agentfile.agent"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(readFile(join(cwd, ".github", "workflows", "agentfile.yml"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
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

  it("checks whether generated instruction files are up to date", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-sync-check-"));
    tempDirs.push(cwd);

    const outputPath = join(cwd, "AGENTS.md");
    await runCli(["sync", examplePath, "--target", "agents-md", "--output", outputPath], cwd);

    const { stdout } = await runCli(["sync", examplePath, "--target", "agents-md", "--output", outputPath, "--check"], cwd);
    expect(stdout).toContain(`OK ${outputPath} is up to date`);

    await writeFile(outputPath, "stale generated instructions\n", "utf8");
    await expect(
      runCli(["sync", examplePath, "--target", "agents-md", "--output", outputPath, "--check"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(`generated output is stale: ${outputPath}`)
    });
  });

  it("reports missing generated output in sync check mode", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-sync-check-missing-"));
    tempDirs.push(cwd);

    const outputPath = join(cwd, "AGENTS.md");

    await expect(
      runCli(["sync", examplePath, "--target", "agents-md", "--output", outputPath, "--check"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(`generated output is missing: ${outputPath}`)
    });
  });

  it("creates all default generated instruction surfaces", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-sync-all-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["sync", examplePath, "--all"], cwd);

    expect(stdout).toContain("Wrote AGENTS.md [agents-md]");
    expect(stdout).toContain("Wrote CLAUDE.md [claude-md]");
    expect(stdout).toContain("Wrote .cursor/rules/agentfile.mdc [cursor-mdc]");
    expect(stdout).toContain("Wrote .github/copilot-instructions.md [copilot-md]");

    expect(await readFile(join(cwd, "AGENTS.md"), "utf8")).toContain("# fix-login-refresh-race");
    expect(await readFile(join(cwd, "CLAUDE.md"), "utf8")).toContain("# fix-login-refresh-race");
    expect(await readFile(join(cwd, ".cursor/rules/agentfile.mdc"), "utf8")).toContain("alwaysApply: true");
    expect(await readFile(join(cwd, ".github/copilot-instructions.md"), "utf8")).toContain("# fix-login-refresh-race");
  });

  it("checks all default generated instruction surfaces", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-sync-all-check-"));
    tempDirs.push(cwd);

    await runCli(["sync", examplePath, "--all"], cwd);

    const { stdout } = await runCli(["sync", examplePath, "--all", "--check"], cwd);

    expect(stdout).toContain("OK AGENTS.md [agents-md] is up to date");
    expect(stdout).toContain("OK CLAUDE.md [claude-md] is up to date");
    expect(stdout).toContain("OK .cursor/rules/agentfile.mdc [cursor-mdc] is up to date");
    expect(stdout).toContain("OK .github/copilot-instructions.md [copilot-md] is up to date");
  });

  it("reports missing and stale surfaces in all-target check mode", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-sync-all-check-fail-"));
    tempDirs.push(cwd);

    await writeFile(join(cwd, "AGENTS.md"), "stale generated instructions\n", "utf8");

    await expect(
      runCli(["sync", examplePath, "--all", "--check"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("generated outputs are not up to date")
    });

    await expect(
      runCli(["sync", examplePath, "--all", "--check"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("- stale AGENTS.md [agents-md]")
    });

    await expect(
      runCli(["sync", examplePath, "--all", "--check"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("- missing CLAUDE.md [claude-md]")
    });
  });

  it("preflights all-target overwrite conflicts before writing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-sync-all-conflict-"));
    tempDirs.push(cwd);

    await writeFile(join(cwd, "AGENTS.md"), "hand-written instructions\n", "utf8");

    await expect(
      runCli(["sync", examplePath, "--all"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("refusing to overwrite generated outputs:")
    });

    await expect(readFile(join(cwd, "CLAUDE.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});

describe("agentfile doctor", () => {
  it("checks the discovered contract without requiring generated surfaces", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-doctor-"));
    tempDirs.push(cwd);

    const source = await readFile(examplePath, "utf8");
    await writeFile(join(cwd, "agentfile.agent"), source, "utf8");

    const { stdout } = await runCli(["doctor"], cwd);

    expect(stdout).toContain("Agentfile Doctor");
    expect(stdout).toContain("Contract: OK agentfile.agent");
    expect(stdout).toContain("Lint warnings: 0");
    expect(stdout).toContain("AGENTS.md [agents-md]: not found");
    expect(stdout).toContain("CLAUDE.md [claude-md]: not found");
    expect(stdout).toContain(".cursor/rules/agentfile.mdc [cursor-mdc]: not found");
    expect(stdout).toContain(".github/copilot-instructions.md [copilot-md]: not found");
    expect(stdout).toContain("Status: pass");
  });

  it("passes when an adopted generated surface is up to date", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-doctor-up-to-date-"));
    tempDirs.push(cwd);

    await runCli(["sync", examplePath, "--target", "agents-md", "--output", "AGENTS.md"], cwd);

    const { stdout } = await runCli(["doctor", examplePath], cwd);

    expect(stdout).toContain("AGENTS.md [agents-md]: up to date");
    expect(stdout).toContain("CLAUDE.md [claude-md]: not found");
    expect(stdout).toContain("Status: pass");
  });

  it("prints a machine-readable health report", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-doctor-json-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["doctor", examplePath, "--format", "json"], cwd);
    const result = JSON.parse(stdout);

    expect(result.contractPath).toBe(examplePath);
    expect(result.status).toBe("pass");
    expect(result.lintDiagnostics).toEqual([]);
    expect(result.nextSteps).toEqual([]);
    expect(result.surfaces).toHaveLength(4);
    expect(result.surfaces).toContainEqual(expect.objectContaining({
      target: "agents-md",
      outputPath: "AGENTS.md",
      status: "missing",
      lineCount: expect.any(Number),
      byteCount: expect.any(Number)
    }));
  });

  it("fails when an adopted generated surface is stale", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-doctor-stale-"));
    tempDirs.push(cwd);

    await writeFile(join(cwd, "AGENTS.md"), "stale generated instructions\n", "utf8");

    await expect(
      runCli(["doctor", examplePath], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining("AGENTS.md [agents-md]: stale")
    });

    await expect(
      runCli(["doctor", examplePath], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining(
        `Run agentfile sync ${examplePath} --target agents-md --output AGENTS.md --force`
      )
    });
  });

  it("prints a machine-readable stale health report before failing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-doctor-json-stale-"));
    tempDirs.push(cwd);

    await writeFile(join(cwd, "AGENTS.md"), "stale generated instructions\n", "utf8");

    await expect(
      runCli(["doctor", examplePath, "--format", "json"], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining('"status": "fail"')
    });

    await expect(
      runCli(["doctor", examplePath, "--format", "json"], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining(`Run agentfile sync ${examplePath} --target agents-md --output AGENTS.md --force`)
    });
  });
});

describe("agentfile surfaces", () => {
  it("prints generated surface freshness and size without writing files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-surfaces-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["surfaces", examplePath], cwd);

    expect(stdout).toContain("# Agentfile Generated Surfaces");
    expect(stdout).toContain(`Contract: ${examplePath}`);
    expect(stdout).toContain("| Target | Output | Status | Lines | Bytes |");
    expect(stdout).toContain("| agents-md | AGENTS.md | not found |");
    expect(stdout).toContain("| claude-md | CLAUDE.md | not found |");
    expect(stdout).toContain("| cursor-mdc | .cursor/rules/agentfile.mdc | not found |");
    expect(stdout).toContain("| copilot-md | .github/copilot-instructions.md | not found |");
  });

  it("prints machine-readable generated surface inspection", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-surfaces-json-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["surfaces", examplePath, "--format", "json"], cwd);
    const result = JSON.parse(stdout);

    expect(result.contractPath).toBe(examplePath);
    expect(result.surfaces).toHaveLength(4);
    expect(result.surfaces).toContainEqual(expect.objectContaining({
      target: "agents-md",
      description: "generated AGENTS.md instructions",
      outputPath: "AGENTS.md",
      status: "missing",
      lineCount: expect.any(Number),
      byteCount: expect.any(Number)
    }));
    expect(result.surfaces[0].lineCount).toBeGreaterThan(0);
    expect(result.surfaces[0].byteCount).toBeGreaterThan(0);
  });

  it("reports an adopted generated surface as up to date", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-surfaces-up-to-date-"));
    tempDirs.push(cwd);

    await runCli(["sync", examplePath, "--target", "agents-md", "--output", "AGENTS.md"], cwd);

    const { stdout } = await runCli(["surfaces", examplePath], cwd);

    expect(stdout).toContain("| agents-md | AGENTS.md | up to date |");
    expect(stdout).toContain("| claude-md | CLAUDE.md | not found |");
  });
});

describe("agentfile inspect", () => {
  it("prints a project readiness summary", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-inspect-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["inspect", examplePath], cwd);

    expect(stdout).toContain("# Agentfile Inspect");
    expect(stdout).toContain(`Contract: ${examplePath}`);
    expect(stdout).toContain("Status: pass");
    expect(stdout).toContain("Task: fix-login-refresh-race");
    expect(stdout).toContain("Scope: 2 include, 2 exclude");
    expect(stdout).toContain("Checks: 2 total, 2 required, 2 command-backed");
    expect(stdout).toContain("Handoff evidence: 8");
    expect(stdout).toContain("AGENTS.md [agents-md]: not found");
    expect(stdout).toContain("Lint warnings: 0");
  });

  it("prints a machine-readable project readiness summary", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-inspect-json-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["inspect", examplePath, "--format", "json"], cwd);
    const result = JSON.parse(stdout);

    expect(result.contractPath).toBe(examplePath);
    expect(result.status).toBe("pass");
    expect(result.task).toMatchObject({
      id: "fix-login-refresh-race",
      labels: ["auth", "concurrency"],
      owners: ["auth-team"]
    });
    expect(result.scope).toMatchObject({
      includeCount: 2,
      excludeCount: 2,
      filesystemReadCount: 2,
      filesystemWriteCount: 2
    });
    expect(result.workflow).toMatchObject({
      checkCount: 2,
      requiredCheckCount: 2,
      commandCheckCount: 2,
      acceptanceCount: 2,
      handoffEvidenceCount: 8
    });
    expect(result.doctor.surfaces).toHaveLength(4);
  });

  it("supports strict readiness gates for CI", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-inspect-strict-"));
    tempDirs.push(cwd);

    try {
      await runCli(["inspect", examplePath, "--strict", "--format", "json"], cwd);
      throw new Error("expected strict inspection to fail");
    } catch (error) {
      const stdout = (error as { stdout?: string }).stdout ?? "";
      const result = JSON.parse(stdout);

      expect(result.status).toBe("fail");
      expect(result.readiness.failOn).toEqual(["stale-surfaces", "missing-surfaces", "lint"]);
      expect(result.readiness.failures).toEqual([
        {
          check: "missing-surfaces",
          count: 4,
          message: "4 missing generated surfaces"
        }
      ]);
    }
  });

  it("supports targeted readiness gates", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-inspect-fail-on-"));
    tempDirs.push(cwd);

    const contractPath = join(cwd, "risky.agentfile");
    await writeFile(contractPath, `agentfile: "0.1.0"
kind: TaskContract
info:
  title: risky-authority
task:
  id: risky-authority
  goal: Exercise inspect failure gates.
scope:
  include:
    - src/**
permissions:
  network:
    default: allow
  approvals:
    requiredFor:
      - dependency_change
      - network_access
      - scope_expansion
workflow:
  id: implement
  acceptance:
    - Done.
`, "utf8");

    try {
      await runCli(["inspect", contractPath, "--fail-on", "lint", "--format", "json"], cwd);
      throw new Error("expected lint-gated inspection to fail");
    } catch (error) {
      const stdout = (error as { stdout?: string }).stdout ?? "";
      const result = JSON.parse(stdout);

      expect(result.status).toBe("fail");
      expect(result.readiness.failOn).toEqual(["lint"]);
      expect(result.readiness.failures).toEqual([
        {
          check: "lint",
          count: 2,
          message: "2 lint warnings"
        }
      ]);
      expect(result.doctor.surfaces.every((surface: { status: string }) => surface.status === "missing")).toBe(true);
    }
  });

  it("fails when project inspection finds stale adopted surfaces", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-inspect-stale-"));
    tempDirs.push(cwd);

    await writeFile(join(cwd, "AGENTS.md"), "stale generated instructions\n", "utf8");

    await expect(
      runCli(["inspect", examplePath, "--format", "json"], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining('"status": "fail"')
    });

    await expect(
      runCli(["inspect", examplePath], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining("AGENTS.md [agents-md]: stale")
    });
  });
});

describe("agentfile github-actions", () => {
  it("prints a source-checkout workflow with readiness and generated-surface gates", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-actions-"));
    tempDirs.push(cwd);
    await writeFile(join(cwd, "agentfile.agent"), await readFile(examplePath, "utf8"), "utf8");

    const { stdout } = await runCli(["github-actions", "agentfile.agent"], cwd);

    expect(stdout).toContain("name: Agentfile");
    expect(stdout).toContain("repository: Atomics-hub/agentfile");
    expect(stdout).toContain('ref: "main"');
    expect(stdout).toContain("run: node .agentfile/tool/dist/cli.js inspect 'agentfile.agent' --fail-on stale-surfaces,lint --format json");
    expect(stdout).toContain("run: node .agentfile/tool/dist/cli.js sync 'agentfile.agent' --target agents-md --output 'AGENTS.md' --check");
    expect(stdout).toContain("run: node .agentfile/tool/dist/cli.js sync 'agentfile.agent' --target claude-md --output 'CLAUDE.md' --check");
  });

  it("supports custom tool refs, generated surfaces, and receipt verification", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-actions-custom-"));
    tempDirs.push(cwd);
    await writeFile(join(cwd, "agentfile.agent"), await readFile(examplePath, "utf8"), "utf8");

    const { stdout } = await runCli([
      "github-actions",
      "agentfile.agent",
      "--tool-ref",
      "v0.1.0",
      "--surfaces",
      "cursor-mdc,copilot-md,cursor-mdc",
      "--receipt",
      "receipts/latest.receipt.json"
    ], cwd);

    expect(stdout).toContain('ref: "v0.1.0"');
    expect(stdout).toContain("run: node .agentfile/tool/dist/cli.js sync 'agentfile.agent' --target cursor-mdc --output '.cursor/rules/agentfile.mdc' --check");
    expect(stdout).toContain("run: node .agentfile/tool/dist/cli.js sync 'agentfile.agent' --target copilot-md --output '.github/copilot-instructions.md' --check");
    expect(stdout.match(/--target cursor-mdc/g)).toHaveLength(1);
    expect(stdout).toContain("if: hashFiles('receipts/latest.receipt.json') != ''");
    expect(stdout).toContain("run: node .agentfile/tool/dist/cli.js receipt verify 'agentfile.agent' 'receipts/latest.receipt.json'");
  });

  it("can generate receipt-ready check runs in GitHub Actions", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-actions-run-checks-"));
    tempDirs.push(cwd);
    await writeFile(join(cwd, "agentfile.agent"), await readFile(examplePath, "utf8"), "utf8");

    const { stdout } = await runCli([
      "github-actions",
      "agentfile.agent",
      "--surfaces",
      "none",
      "--run-checks",
      "--checks-log",
      "artifacts/checks.txt",
      "--checks-results",
      "artifacts/check-results.json",
      "--receipt",
      "receipts/latest.receipt.json"
    ], cwd);

    expect(stdout).toContain("Run contract checks");
    expect(stdout).toContain("run: node .agentfile/tool/dist/cli.js checks run 'agentfile.agent' --log 'artifacts/checks.txt' --results 'artifacts/check-results.json'");
    expect(stdout).toContain("Fill receipt proof");
    expect(stdout).toContain("run: node .agentfile/tool/dist/cli.js receipt fill 'agentfile.agent' 'receipts/latest.receipt.json' --check-results 'artifacts/check-results.json' --write");
    expect(stdout).toContain("run: node .agentfile/tool/dist/cli.js receipt verify 'agentfile.agent' 'receipts/latest.receipt.json'");
  });

  it("writes and checks generated workflow files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-actions-output-"));
    tempDirs.push(cwd);
    await writeFile(join(cwd, "agentfile.agent"), await readFile(examplePath, "utf8"), "utf8");
    const outputPath = join(cwd, ".github", "workflows", "agentfile.yml");

    const writeResult = await runCli(["github-actions", "agentfile.agent", "--output", outputPath], cwd);
    expect(writeResult.stdout).toContain(`Wrote ${outputPath}`);

    const content = await readFile(outputPath, "utf8");
    expect(content).toContain("Inspect contract readiness");
    expect(content).toContain("sync 'agentfile.agent' --target agents-md --output 'AGENTS.md' --check");

    const checkResult = await runCli(["github-actions", "agentfile.agent", "--output", outputPath, "--check"], cwd);
    expect(checkResult.stdout).toContain(`OK ${outputPath} is up to date`);
  });

  it("protects generated workflow files from accidental overwrite and stale checks", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-actions-stale-"));
    tempDirs.push(cwd);
    await writeFile(join(cwd, "agentfile.agent"), await readFile(examplePath, "utf8"), "utf8");
    const outputPath = join(cwd, "agentfile.yml");
    await writeFile(outputPath, "stale workflow\n", "utf8");

    await expect(
      runCli(["github-actions", "agentfile.agent", "--output", outputPath], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(`refusing to overwrite ${outputPath}`)
    });

    await expect(
      runCli(["github-actions", "agentfile.agent", "--output", outputPath, "--check"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(`generated workflow is stale: ${outputPath}`)
    });

    const forceResult = await runCli(["github-actions", "agentfile.agent", "--output", outputPath, "--force"], cwd);
    expect(forceResult.stdout).toContain(`Wrote ${outputPath}`);
  });

  it("can generate a validation-only workflow without generated surface checks", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-actions-none-"));
    tempDirs.push(cwd);
    await writeFile(join(cwd, "agentfile.agent"), await readFile(examplePath, "utf8"), "utf8");

    const { stdout } = await runCli(["github-actions", "agentfile.agent", "--surfaces", "none"], cwd);

    expect(stdout).toContain("Inspect contract readiness");
    expect(stdout).not.toContain("--target agents-md");
    expect(stdout).not.toContain("--target claude-md");
  });

  it("rejects non-file-backed generated surface targets", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-actions-invalid-"));
    tempDirs.push(cwd);
    await writeFile(join(cwd, "agentfile.agent"), await readFile(examplePath, "utf8"), "utf8");

    await expect(
      runCli(["github-actions", "agentfile.agent", "--surfaces", "json"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('github-actions surface "json" is not file-backed')
    });
  });
});

describe("agentfile format", () => {
  it("prints canonical Pact source without writing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-format-print-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["format", examplePath], cwd);

    expect(stdout).toContain("mission fix-login-refresh-race {");
    expect(stdout).toContain('  label "auth"');
    expect(stdout).toContain("  touch src/auth/**, tests/auth/**");
    expect(stdout).toContain('    note "risks"');
  });

  it("checks canonical Pact source formatting", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-format-check-"));
    tempDirs.push(cwd);

    const { stdout: canonical } = await runCli(["format", examplePath], cwd);
    const contractPath = join(cwd, "agentfile.agent");
    await writeFile(contractPath, canonical, "utf8");

    const { stdout } = await runCli(["format", contractPath, "--check"], cwd);

    expect(stdout).toContain(`OK ${contractPath} is formatted`);
  });

  it("fails check mode when Pact source is not canonical", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-format-check-fail-"));
    tempDirs.push(cwd);

    const contractPath = join(cwd, "agentfile.agent");
    const source = (await readFile(examplePath, "utf8")).replace('  label "auth"', "  label auth");
    await writeFile(contractPath, source, "utf8");

    await expect(
      runCli(["format", contractPath, "--check"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(`format check failed: ${contractPath}`)
    });
  });

  it("writes canonical Pact source back to .agent files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-format-write-"));
    tempDirs.push(cwd);

    const contractPath = join(cwd, "agentfile.agent");
    const source = (await readFile(examplePath, "utf8")).replace('    note "risks"', "    note risks");
    await writeFile(contractPath, source, "utf8");

    const { stdout } = await runCli(["format", contractPath, "--write"], cwd);
    const formatted = await readFile(contractPath, "utf8");

    expect(stdout).toContain(`Wrote ${contractPath}`);
    expect(formatted).toContain('  label "auth"');
    expect(formatted).toContain("  touch src/auth/**, tests/auth/**");
    expect(formatted).toContain('    note "risks"');
  });

  it("does not write Pact source over YAML contract files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-format-yaml-write-"));
    tempDirs.push(cwd);

    await expect(
      runCli(["format", exampleContractPath, "--write"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("format --write only applies to Pact .agent source")
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

describe("agentfile schema", () => {
  it("prints the strict contract IR JSON Schema", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-schema-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["schema"], cwd);
    const schema = JSON.parse(stdout);

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.title).toBe("Agentfile TaskContract");
    expect(schema.required).toContain("agentfile");
    expect(schema.properties.agentfile.const).toBe("0.1.0");
    expect(schema.properties.kind.const).toBe("TaskContract");
    expect(schema.properties.checks.items.oneOf).toHaveLength(2);
    expect(schema.description).toContain("Use agentfile check for semantic invariants");
  });

  it("writes and checks generated schema files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-schema-output-"));
    tempDirs.push(cwd);
    const outputPath = join(cwd, ".vscode", "agentfile.schema.json");

    const writeResult = await runCli(["schema", "--output", outputPath], cwd);
    expect(writeResult.stdout).toContain(`Wrote ${outputPath}`);

    const schema = JSON.parse(await readFile(outputPath, "utf8"));
    expect(schema.title).toBe("Agentfile TaskContract");

    const checkResult = await runCli(["schema", "--output", outputPath, "--check"], cwd);
    expect(checkResult.stdout).toContain(`OK ${outputPath} is up to date`);
  });

  it("protects generated schema files from accidental overwrite and stale checks", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-schema-stale-"));
    tempDirs.push(cwd);
    const outputPath = join(cwd, "agentfile.schema.json");
    await writeFile(outputPath, "{}\n", "utf8");

    await expect(
      runCli(["schema", "--output", outputPath], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(`refusing to overwrite ${outputPath}`)
    });

    await expect(
      runCli(["schema", "--output", outputPath, "--check"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(`generated schema is stale: ${outputPath}`)
    });

    const forceResult = await runCli(["schema", "--output", outputPath, "--force"], cwd);
    expect(forceResult.stdout).toContain(`Wrote ${outputPath}`);
  });
});

describe("agentfile editor vscode", () => {
  it("prints VS Code schema settings for YAML and JSON contract IR", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-editor-vscode-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["editor", "vscode"], cwd);
    const settings = JSON.parse(stdout);

    expect(settings["yaml.schemas"][".vscode/agentfile.schema.json"]).toContain("agentfile.yaml");
    expect(settings["yaml.schemas"][".vscode/agentfile.schema.json"]).toContain(".agent/agentfile.yml");
    expect(settings["json.schemas"]).toContainEqual({
      fileMatch: ["agentfile.json", ".agent/agentfile.json"],
      url: ".vscode/agentfile.schema.json"
    });
  });

  it("supports a custom VS Code schema path", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-editor-vscode-custom-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["editor", "vscode", "--schema", "schemas/agentfile.schema.json"], cwd);
    const settings = JSON.parse(stdout);

    expect(settings["yaml.schemas"]["schemas/agentfile.schema.json"]).toContain("agentfile.yaml");
    expect(settings["json.schemas"][0].url).toBe("schemas/agentfile.schema.json");
  });

  it("writes and checks generated VS Code settings files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-editor-vscode-output-"));
    tempDirs.push(cwd);
    const outputPath = join(cwd, ".vscode", "settings.json");

    const writeResult = await runCli(["editor", "vscode", "--output", outputPath], cwd);
    expect(writeResult.stdout).toContain(`Wrote ${outputPath}`);

    const settings = JSON.parse(await readFile(outputPath, "utf8"));
    expect(settings["yaml.schemas"][".vscode/agentfile.schema.json"]).toContain("agentfile.yml");

    const checkResult = await runCli(["editor", "vscode", "--output", outputPath, "--check"], cwd);
    expect(checkResult.stdout).toContain(`OK ${outputPath} is up to date`);
  });

  it("protects generated VS Code settings from accidental overwrite and stale checks", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-editor-vscode-stale-"));
    tempDirs.push(cwd);
    const outputPath = join(cwd, "settings.json");
    await writeFile(outputPath, "{}\n", "utf8");

    await expect(
      runCli(["editor", "vscode", "--output", outputPath], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(`refusing to overwrite ${outputPath}`)
    });

    await expect(
      runCli(["editor", "vscode", "--output", outputPath, "--check"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(`generated VS Code settings are stale: ${outputPath}`)
    });

    const forceResult = await runCli(["editor", "vscode", "--output", outputPath, "--force"], cwd);
    expect(forceResult.stdout).toContain(`Wrote ${outputPath}`);
  });
});

describe("agentfile diff", () => {
  it("prints normalized contract differences", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-diff-"));
    tempDirs.push(cwd);

    const changedPath = join(cwd, "changed.agent");
    const source = await readFile(examplePath, "utf8");
    await writeFile(
      changedPath,
      source.replace(
        'goal "Share one in-flight refresh across concurrent auth calls"',
        'goal "Share one safe in-flight refresh across concurrent auth calls"'
      ),
      "utf8"
    );

    const { stdout } = await runCli(["diff", examplePath, changedPath], cwd);

    expect(stdout).toContain("# Agentfile Contract Diff");
    expect(stdout).toContain("- changed task.goal");
    expect(stdout).toContain('from: "Share one in-flight refresh across concurrent auth calls"');
    expect(stdout).toContain('to: "Share one safe in-flight refresh across concurrent auth calls"');
  });

  it("prints machine-readable contract differences", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-diff-json-"));
    tempDirs.push(cwd);

    const changedPath = join(cwd, "changed.agent");
    const source = await readFile(examplePath, "utf8");
    await writeFile(
      changedPath,
      source.replace(
        'summary "Prevent duplicate token refresh requests during concurrent auth calls"',
        'summary "Prevent duplicate refresh requests and keep review scope explicit"'
      ),
      "utf8"
    );

    const { stdout } = await runCli(["diff", examplePath, changedPath, "--format", "json"], cwd);
    const result = JSON.parse(stdout);

    expect(result.status).toBe("different");
    expect(result.differences).toContainEqual({
      kind: "changed",
      path: "info.summary",
      before: "Prevent duplicate token refresh requests during concurrent auth calls",
      after: "Prevent duplicate refresh requests and keep review scope explicit"
    });
  });

  it("reports when two contracts normalize to the same content", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-diff-same-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["diff", examplePath, examplePath], cwd);

    expect(stdout).toContain("No contract differences.");
  });
});

describe("agentfile checks", () => {
  it("runs command-backed checks and writes receipt-ready results", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-checks-run-"));
    tempDirs.push(cwd);
    const contractPath = join(cwd, "agentfile.agentfile");

    await writeFile(contractPath, checkRunContract([
      {
        id: "node-pass",
        command: 'node -e "console.log(42)"',
        required: true
      },
      {
        id: "node-second-pass",
        command: 'node -e "console.log(43)"',
        required: true
      }
    ]), "utf8");

    const { stdout } = await runCli([
      "checks",
      "run",
      contractPath,
      "--log",
      "artifacts/checks.txt",
      "--results",
      "artifacts/check-results.json"
    ], cwd);
    const log = await readFile(join(cwd, "artifacts", "checks.txt"), "utf8");
    const results = JSON.parse(await readFile(join(cwd, "artifacts", "check-results.json"), "utf8"));

    expect(stdout).toContain(`Ran 2 command-backed checks for ${contractPath}.`);
    expect(stdout).toContain("Wrote artifacts/checks.txt");
    expect(log).toContain('$ node -e "console.log(42)"');
    expect(log).toContain("42");
    expect(log).toContain("[exit 0]");
    expect(results.checks).toEqual([
      {
        id: "node-pass",
        command: 'node -e "console.log(42)"',
        status: "passed",
        evidence: "artifacts/checks.txt"
      },
      {
        id: "node-second-pass",
        command: 'node -e "console.log(43)"',
        status: "passed",
        evidence: "artifacts/checks.txt"
      }
    ]);
  }, 15000);

  it("records failed checks and exits nonzero when required proof fails", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-checks-run-fail-"));
    tempDirs.push(cwd);
    const contractPath = join(cwd, "agentfile.agentfile");

    await writeFile(contractPath, checkRunContract([
      {
        id: "node-pass",
        command: 'node -e "console.log(42)"',
        required: true
      },
      {
        id: "node-fail",
        command: 'node -e "process.exit(2)"',
        required: true
      }
    ]), "utf8");

    await expect(
      runCli([
        "checks",
        "run",
        contractPath,
        "--log",
        "logs/checks.txt",
        "--results",
        "logs/check-results.json"
      ], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining("Required checks failed: node-fail")
    });

    const log = await readFile(join(cwd, "logs", "checks.txt"), "utf8");
    const results = JSON.parse(await readFile(join(cwd, "logs", "check-results.json"), "utf8"));

    expect(log).toContain('$ node -e "process.exit(2)"');
    expect(log).toContain("[exit 2]");
    expect(results.checks).toEqual([
      expect.objectContaining({
        id: "node-pass",
        status: "passed"
      }),
      expect.objectContaining({
        id: "node-fail",
        status: "failed",
        evidence: "logs/checks.txt"
      })
    ]);
  }, 15000);
});

describe("agentfile receipt", () => {
  it("prints an audit checklist for a completed harness run", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["receipt", examplePath], cwd);

    expect(stdout).toContain("# Agentfile Receipt Checklist");
    expect(stdout).toContain("Task: `fix-login-refresh-race`");
    expect(stdout).toContain("Use this after a harness run to tie the agent's work back to the contract.");
    expect(stdout).toContain("- Included paths: src/auth/**, tests/auth/**");
    expect(stdout).toContain("- Excluded paths: src/billing/**, infra/**");
    expect(stdout).toContain("- Allowed shell commands: `npm test -- auth`, `npm run lint`");
    expect(stdout).toContain("- Network: deny");
    expect(stdout).toContain("- Secrets: deny");
    expect(stdout).toContain("- [ ] Run `npm test -- auth` (required).");
    expect(stdout).toContain("- [ ] Run `npm run lint` (required).");
    expect(stdout).toContain("## Acceptance Evidence");
    expect(stdout).toContain("- [ ] Concurrent refresh calls result in exactly one upstream token request");
    expect(stdout).toContain("## Handoff Evidence");
    expect(stdout).toContain("- [ ] Attach or link the transcript/tool log.");
    expect(stdout).toContain("- [ ] List changed files.");
    expect(stdout).toContain("## Receipt Fields");
    expect(stdout).toContain("- Agent, model, and harness");
  });

  it("prints a machine-readable receipt template", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-json-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["receipt", examplePath, "--format", "json"], cwd);
    const receipt = JSON.parse(stdout);

    expect(receipt.kind).toBe("AgentfileReceiptTemplate");
    expect(receipt.contract.taskId).toBe("fix-login-refresh-race");
    expect(receipt.scope.include).toEqual(["src/auth/**", "tests/auth/**"]);
    expect(receipt.authority.network.default).toBe("deny");
    expect(receipt.requiredProof[0]).toMatchObject({
      id: "npm-test-auth",
      command: "npm test -- auth",
      required: true,
      status: "pending",
      evidence: null
    });
    expect(receipt.handoffEvidence).toContainEqual(expect.objectContaining({
      item: "Attach or link the transcript/tool log.",
      status: "pending"
    }));
  });

  it("initializes the default CI receipt template path", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-init-"));
    tempDirs.push(cwd);

    await writeFile(join(cwd, "agentfile.agent"), await readFile(examplePath, "utf8"), "utf8");

    const { stdout } = await runCli(["receipt", "init"], cwd);
    const receiptPath = join(cwd, "receipts", "latest.receipt.json");
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));

    expect(stdout).toContain("Wrote receipts/latest.receipt.json");
    expect(receipt.kind).toBe("AgentfileReceiptTemplate");
    expect(receipt.contract.path).toBe("agentfile.agent");
    expect(receipt.requiredProof[0]).toMatchObject({
      status: "pending",
      evidence: null
    });

    await expect(
      runCli(["receipt", "init"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("refusing to overwrite receipts/latest.receipt.json; pass --force to replace it")
    });

    const forceResult = await runCli(["receipt", "init", "--force"], cwd);
    expect(forceResult.stdout).toContain("Wrote receipts/latest.receipt.json");

    const customResult = await runCli(["receipt", "init", "--output", "artifacts/run.receipt.json"], cwd);
    const customReceipt = JSON.parse(await readFile(join(cwd, "artifacts", "run.receipt.json"), "utf8"));

    expect(customResult.stdout).toContain("Wrote artifacts/run.receipt.json");
    expect(customReceipt.contract.path).toBe("agentfile.agent");
  }, 15000);

  it("writes receipt artifacts and protects existing files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-output-"));
    tempDirs.push(cwd);

    const outputPath = join(cwd, "receipts", "fix-login.md");

    const { stdout } = await runCli(["receipt", examplePath, "--output", outputPath], cwd);
    const content = await readFile(outputPath, "utf8");

    expect(stdout).toContain(`Wrote ${outputPath}`);
    expect(content).toContain("# Agentfile Receipt Checklist");
    await expect(
      runCli(["receipt", examplePath, "--output", outputPath], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(`refusing to overwrite ${outputPath}; pass --force to replace it`)
    });

    await runCli(["receipt", examplePath, "--format", "json", "--output", outputPath, "--force"], cwd);
    const jsonReceipt = JSON.parse(await readFile(outputPath, "utf8"));

    expect(jsonReceipt.kind).toBe("AgentfileReceiptTemplate");
  });

  it("fills command-backed proof from a check log without writing the receipt", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-fill-"));
    tempDirs.push(cwd);

    const { stdout: templateJson } = await runCli(["receipt", examplePath, "--format", "json"], cwd);
    const receiptPath = join(cwd, "receipt.json");
    const checkLogPath = join(cwd, "checks.log");
    await writeFile(receiptPath, templateJson, "utf8");
    await writeFile(checkLogPath, [
      "$ npm test -- auth",
      "PASS tests/auth/session.test.ts",
      "$ npm run lint",
      "Lint clean"
    ].join("\n"), "utf8");

    const { stdout } = await runCli(["receipt", "fill", examplePath, receiptPath, "--check-log", "checks.log"], cwd);
    const filled = JSON.parse(stdout);
    const persisted = JSON.parse(await readFile(receiptPath, "utf8"));

    expect(filled.requiredProof).toEqual([
      expect.objectContaining({
        id: "npm-test-auth",
        status: "passed",
        evidence: "checks.log"
      }),
      expect.objectContaining({
        id: "npm-run-lint",
        status: "passed",
        evidence: "checks.log"
      })
    ]);
    expect(filled.acceptanceEvidence[0]).toMatchObject({
      status: "pending",
      evidence: null
    });
    expect(persisted.requiredProof[0]).toMatchObject({
      status: "pending",
      evidence: null
    });
  });

  it("fills command-backed proof from structured check results", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-fill-results-"));
    tempDirs.push(cwd);

    const { stdout: templateJson } = await runCli(["receipt", examplePath, "--format", "json"], cwd);
    const receiptPath = join(cwd, "receipt.json");
    const resultsPath = join(cwd, "check-results.json");
    await writeFile(receiptPath, templateJson, "utf8");
    await writeFile(resultsPath, `${JSON.stringify({
      checks: [
        {
          id: "npm-test-auth",
          status: "passed",
          evidence: "logs/npm-test-auth.txt"
        },
        {
          command: "npm run lint",
          status: "passed"
        }
      ]
    }, null, 2)}\n`, "utf8");

    const { stdout } = await runCli(["receipt", "fill", examplePath, receiptPath, "--check-results", "check-results.json"], cwd);
    const filled = JSON.parse(stdout);

    expect(filled.requiredProof).toEqual([
      expect.objectContaining({
        id: "npm-test-auth",
        status: "passed",
        evidence: "logs/npm-test-auth.txt"
      }),
      expect.objectContaining({
        id: "npm-run-lint",
        status: "passed",
        evidence: "check-results.json"
      })
    ]);
    expect(filled.acceptanceEvidence[0]).toMatchObject({
      status: "pending",
      evidence: null
    });
  });

  it("records failed structured check results without passing receipt verification", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-fill-failed-results-"));
    tempDirs.push(cwd);

    const { stdout: templateJson } = await runCli(["receipt", examplePath, "--format", "json"], cwd);
    const receiptPath = join(cwd, "receipt.json");
    await writeFile(receiptPath, templateJson, "utf8");
    await writeFile(join(cwd, "check-results.json"), `${JSON.stringify({
      checks: [
        {
          id: "npm-test-auth",
          status: "failed",
          evidence: "logs/npm-test-auth.txt"
        },
        {
          id: "npm-run-lint",
          status: "passed",
          evidence: "logs/npm-run-lint.txt"
        }
      ]
    }, null, 2)}\n`, "utf8");

    const { stdout } = await runCli([
      "receipt",
      "fill",
      examplePath,
      receiptPath,
      "--check-results",
      "check-results.json",
      "--write"
    ], cwd);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));

    expect(stdout).toContain("Filled proof: npm-run-lint");
    expect(receipt.requiredProof[0]).toMatchObject({
      id: "npm-test-auth",
      status: "failed",
      evidence: "logs/npm-test-auth.txt"
    });

    await expect(
      runCli(["receipt", "review", examplePath, receiptPath], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining('requiredProof[npm-test-auth].status: expected "passed", got "failed"')
    });
  });

  it("requires exactly one receipt fill input source", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-fill-source-"));
    tempDirs.push(cwd);

    const { stdout: templateJson } = await runCli(["receipt", examplePath, "--format", "json"], cwd);
    const receiptPath = join(cwd, "receipt.json");
    await writeFile(receiptPath, templateJson, "utf8");
    await writeFile(join(cwd, "checks.log"), "npm test -- auth\n", "utf8");
    await writeFile(join(cwd, "check-results.json"), "{\"checks\": []}\n", "utf8");

    await expect(
      runCli(["receipt", "fill", examplePath, receiptPath], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("receipt fill requires --check-log or --check-results")
    });

    await expect(
      runCli([
        "receipt",
        "fill",
        examplePath,
        receiptPath,
        "--check-log",
        "checks.log",
        "--check-results",
        "check-results.json"
      ], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("receipt fill accepts only one input")
    });
  });

  it("rejects malformed structured check results", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-fill-results-invalid-"));
    tempDirs.push(cwd);

    const { stdout: templateJson } = await runCli(["receipt", examplePath, "--format", "json"], cwd);
    const receiptPath = join(cwd, "receipt.json");
    await writeFile(receiptPath, templateJson, "utf8");
    await writeFile(join(cwd, "check-results.json"), `${JSON.stringify({
      checks: [
        {
          id: "npm-test-auth",
          status: "ok"
        }
      ]
    }, null, 2)}\n`, "utf8");

    await expect(
      runCli(["receipt", "fill", examplePath, receiptPath, "--check-results", "check-results.json"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('checkResults.checks[0].status: expected "passed", "failed", or "skipped"')
    });
  });

  it("prints, writes, and checks the structured check-results schema", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-results-schema-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["receipt", "check-results-schema"], cwd);
    const schema = JSON.parse(stdout);

    expect(schema.title).toBe("Agentfile Receipt Check Results");
    expect(schema.properties.checks.items.properties.status.enum).toEqual(["passed", "failed", "skipped"]);
    expect(schema.properties.checks.items.anyOf).toEqual([
      {
        required: ["id"]
      },
      {
        required: ["command"]
      }
    ]);

    const output = join(cwd, "schemas", "receipt-check-results.schema.json");
    const writeResult = await runCli(["receipt", "check-results-schema", "--output", output], cwd);
    expect(writeResult.stdout).toContain(`Wrote ${output}`);

    const checkResult = await runCli(["receipt", "check-results-schema", "--output", output, "--check"], cwd);
    expect(checkResult.stdout).toContain(`OK ${output} is up to date`);

    await writeFile(output, "{}\n", "utf8");
    await expect(
      runCli(["receipt", "check-results-schema", "--output", output, "--check"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(`generated schema is stale: ${output}`)
    });
  }, 15000);

  it("writes filled proof while leaving acceptance and handoff evidence for review", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-fill-write-"));
    tempDirs.push(cwd);

    const { stdout: templateJson } = await runCli(["receipt", examplePath, "--format", "json"], cwd);
    const receiptPath = join(cwd, "receipt.json");
    await writeFile(receiptPath, templateJson, "utf8");
    await writeFile(join(cwd, "checks.log"), "npm test -- auth\nnpm run lint\n", "utf8");

    const { stdout } = await runCli([
      "receipt",
      "fill",
      examplePath,
      receiptPath,
      "--check-log",
      "checks.log",
      "--write"
    ], cwd);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));

    expect(stdout).toContain(`Updated ${receiptPath}`);
    expect(stdout).toContain("Filled proof: npm-test-auth, npm-run-lint");
    expect(receipt.requiredProof.every((proof: { status: string }) => proof.status === "passed")).toBe(true);
    expect(receipt.acceptanceEvidence.every((entry: { status: string }) => entry.status === "pending")).toBe(true);

    await expect(
      runCli(["receipt", "review", examplePath, receiptPath], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining("- Required proof: 2/2 passed")
    });
    await expect(
      runCli(["receipt", "review", examplePath, receiptPath], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining("- Acceptance evidence: 0/2 satisfied")
    });
  });

  it("verifies a filled JSON receipt against its contract", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-verify-"));
    tempDirs.push(cwd);

    const { stdout: templateJson } = await runCli(["receipt", examplePath, "--format", "json"], cwd);
    const receipt = JSON.parse(templateJson);

    for (const proof of receipt.requiredProof) {
      proof.status = "passed";
      proof.evidence = `logs/${proof.id}.txt`;
    }

    for (const acceptance of receipt.acceptanceEvidence) {
      acceptance.status = "satisfied";
      acceptance.evidence = `verified: ${acceptance.item}`;
    }

    for (const handoff of receipt.handoffEvidence) {
      handoff.status = "satisfied";
      handoff.evidence = `attached: ${handoff.item}`;
    }

    const receiptPath = join(cwd, "receipt.json");
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");

    const { stdout } = await runCli(["receipt", "verify", examplePath, receiptPath], cwd);

    expect(stdout).toContain(`OK ${receiptPath} satisfies ${examplePath}`);
  });

  it("rejects pending JSON receipts", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-pending-"));
    tempDirs.push(cwd);

    const { stdout: templateJson } = await runCli(["receipt", examplePath, "--format", "json"], cwd);
    const receiptPath = join(cwd, "pending-receipt.json");
    await writeFile(receiptPath, templateJson, "utf8");

    await expect(
      runCli(["receipt", "verify", examplePath, receiptPath], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('requiredProof[npm-test-auth].status: expected "passed", got "pending"')
    });
  });

  it("verifies checked-in lifecycle receipt examples", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-examples-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["receipt", "verify", examplePath, passingReceiptPath], cwd);

    expect(stdout).toContain(`OK ${passingReceiptPath} satisfies ${examplePath}`);
    await expect(
      runCli(["receipt", "verify", examplePath, pendingReceiptPath], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('requiredProof[npm-test-auth].status: expected "passed", got "pending"')
    });
  });

  it("reviews checked-in lifecycle receipt evidence", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-review-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["receipt", "review", examplePath, passingReceiptPath], cwd);

    expect(stdout).toContain("# Agentfile Receipt Review");
    expect(stdout).toContain(`Receipt: \`${passingReceiptPath}\``);
    expect(stdout).toContain("Task: `fix-login-refresh-race`");
    expect(stdout).toContain("Status: pass");
    expect(stdout).toContain("Generated surface: AGENTS.md");
    expect(stdout).toContain("- Required proof: 2/2 passed");
    expect(stdout).toContain("- Acceptance evidence: 2/2 satisfied");
    expect(stdout).toContain("- Handoff evidence: 8/8 satisfied");
    expect(stdout).not.toContain("## Issues");
  });

  it("reviews checked-in lifecycle receipt evidence as JSON", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-review-json-"));
    tempDirs.push(cwd);

    const { stdout } = await runCli(["receipt", "review", examplePath, passingReceiptPath, "--format", "json"], cwd);
    const review = JSON.parse(stdout);

    expect(review).toMatchObject({
      receiptPath: passingReceiptPath,
      status: "pass",
      taskId: "fix-login-refresh-race",
      generatedInstructionSurfaceUsed: "AGENTS.md"
    });
    expect(review.requiredProof).toEqual({
      passed: 2,
      total: 2,
      expectedStatus: "passed"
    });
    expect(review.issues).toEqual([]);
  });

  it("reviews pending receipt evidence before failing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-review-pending-"));
    tempDirs.push(cwd);

    await expect(
      runCli(["receipt", "review", examplePath, pendingReceiptPath], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining("Status: fail")
    });

    await expect(
      runCli(["receipt", "review", examplePath, pendingReceiptPath], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining("- Required proof: 0/2 passed")
    });

    await expect(
      runCli(["receipt", "review", examplePath, pendingReceiptPath], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining('requiredProof[npm-test-auth].status: expected "passed", got "pending"')
    });
  });

  it("prints pending receipt review JSON before failing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-review-json-pending-"));
    tempDirs.push(cwd);

    await expect(
      runCli(["receipt", "review", examplePath, pendingReceiptPath, "--format", "json"], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining('"status": "fail"')
    });

    await expect(
      runCli(["receipt", "review", examplePath, pendingReceiptPath, "--format", "json"], cwd)
    ).rejects.toMatchObject({
      stdout: expect.stringContaining('"requiredProof"')
    });
  });

  it("rejects unknown receipt review formats", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentfile-receipt-review-format-"));
    tempDirs.push(cwd);

    await expect(
      runCli(["receipt", "review", examplePath, passingReceiptPath, "--format", "yaml"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('unknown receipt review format "yaml". Expected "text" or "json".')
    });
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

function checkRunContract(checks: { id: string; command: string; required: boolean }[]): string {
  return `agentfile: "0.1.0"
kind: TaskContract
info:
  title: check-runner
task:
  id: check-runner
  goal: Exercise command-backed check execution.
scope:
  include:
    - src/**
permissions:
  shell:
    allow:
${checks.map((check) => `      - ${JSON.stringify(check.command)}`).join("\n")}
checks:
${checks.map((check) => [
  `  - id: ${check.id}`,
  `    command: ${JSON.stringify(check.command)}`,
  `    required: ${check.required ? "true" : "false"}`
].join("\n")).join("\n")}
workflow:
  id: implement
`;
}
