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
