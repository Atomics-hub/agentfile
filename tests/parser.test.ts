import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import {
  compileAgentfile,
  defaultOutputPathForTarget,
  lintAgentfile,
  parseAgentfile,
  parsePactSource,
  toNormalizedPolicy,
  toJsonContract
} from "../src/index.js";

describe("Agentfile parser", () => {
  it("parses the canonical example", async () => {
    const source = await readFile("examples/fix-login-race.agentfile", "utf8");
    const agentfile = parseAgentfile(source, "examples/fix-login-race.agentfile");

    expect(agentfile.agentfile).toBe("0.1.0");
    expect(agentfile.task.id).toBe("fix-login-refresh-race");
    expect(agentfile.permissions.network.default).toBe("deny");
  });

  it("applies safe policy defaults", () => {
    const agentfile = parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: tiny-task
task:
  id: tiny-task
  goal: Add one focused unit test.
scope:
  include:
    - tests/**
workflow:
  id: implement
  acceptance:
    - The test covers the bug.
`);

    expect(agentfile.permissions.network.default).toBe("deny");
    expect(agentfile.permissions.secrets.access).toBe("deny");
    expect(agentfile.permissions.approvals.requiredFor).toContain("scope_expansion");
  });

  it("rejects unsupported versions", () => {
    expect(() => parseAgentfile(`
agentfile: "9.9.0"
kind: TaskContract
info:
  title: future-task
task:
  id: future-task
  goal: Test.
scope:
  include:
    - src/**
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/agentfile/);
  });

  it("rejects contradictory IR authority states", () => {
    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: invalid-network
task:
  id: invalid-network
  goal: Exercise semantic validation.
scope:
  include:
    - src/**
    - "**"
permissions:
  network:
    default: allow
    allow:
      - api.github.com
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/permissions\.network\.allow: network allowlist requires permissions\.network\.default to be deny/);

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: invalid-secrets
task:
  id: invalid-secrets
  goal: Exercise semantic validation.
scope:
  include:
    - src/**
permissions:
  secrets:
    access: deny
    allow:
      - OPENAI_API_KEY
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/permissions\.secrets\.allow: secret allowlist requires permissions\.secrets\.access to be allow/);

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: invalid-shell
task:
  id: invalid-shell
  goal: Exercise semantic validation.
scope:
  include:
    - src/**
permissions:
  shell:
    allow:
      - npm test
    deny:
      - npm test
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/permissions\.shell\.deny: shell command cannot be both allowed and denied: npm test/);
  });

  it("rejects contradictory IR filesystem states", () => {
    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: invalid-filesystem-deny
task:
  id: invalid-filesystem-deny
  goal: Exercise filesystem validation.
scope:
  include:
    - src/**
permissions:
  filesystem:
    read:
      - src/**
    write:
      - tests/**
    deny:
      - src/**
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(
      /permissions\.filesystem\.deny: filesystem path cannot be both readable\/writable and denied: src\/\*\*/
    );

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: invalid-filesystem-write
task:
  id: invalid-filesystem-write
  goal: Exercise filesystem validation.
scope:
  include:
    - src/**
permissions:
  filesystem:
    read:
      - src/**
    write:
      - tests/**
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/permissions\.filesystem\.write: filesystem write path must also appear in read: tests\/\*\*/);
  });

  it("rejects duplicate IR scope and permission entries", () => {
    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: duplicate-scope-entries
task:
  id: duplicate-scope-entries
  goal: Exercise duplicate scope validation.
scope:
  include:
    - src/**
    - src/**
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/scope\.include: duplicate scope include path: src\/\*\*/);

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: duplicate-shell-entries
task:
  id: duplicate-shell-entries
  goal: Exercise duplicate shell validation.
scope:
  include:
    - src/**
permissions:
  shell:
    allow:
      - npm test
      - npm test
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/permissions\.shell\.allow: duplicate shell allow command: npm test/);

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: duplicate-filesystem-entries
task:
  id: duplicate-filesystem-entries
  goal: Exercise duplicate filesystem validation.
scope:
  include:
    - src/**
permissions:
  filesystem:
    read:
      - src/**
      - src/**
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/permissions\.filesystem\.read: duplicate filesystem read path: src\/\*\*/);
  });

  it("rejects malformed and duplicate IR approval requirements", () => {
    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: malformed-approval-id
task:
  id: malformed-approval-id
  goal: Exercise approval validation.
scope:
  include:
    - src/**
permissions:
  approvals:
    requiredFor:
      - release publish
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/permissions\.approvals\.requiredFor: invalid approval identifier: release publish/);

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: duplicate-approval-id
task:
  id: duplicate-approval-id
  goal: Exercise duplicate approval validation.
scope:
  include:
    - src/**
permissions:
  approvals:
    requiredFor:
      - dependency_change
      - dependency_change
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/permissions\.approvals\.requiredFor: duplicate approval requirement: dependency_change/);
  });

  it("rejects duplicate IR identifiers and exact scope conflicts", () => {
    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: invalid-scope
task:
  id: invalid-scope
  goal: Exercise semantic validation.
scope:
  include:
    - src/**
  exclude:
    - src/**
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/scope\.exclude: scope path cannot be both included and excluded: src\/\*\*/);

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: duplicate-policy-id
task:
  id: duplicate-policy-id
  goal: Exercise semantic validation.
scope:
  include:
    - src/**
policies:
  - id: repeated
    level: must
    statement: Keep behavior stable.
  - id: repeated
    level: must_not
    statement: Do not leak secrets.
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/policies: duplicate policy id: repeated/);

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: duplicate-check-id
task:
  id: duplicate-check-id
  goal: Exercise semantic validation.
scope:
  include:
    - src/**
checks:
  - id: repeated
    command: npm test
  - id: repeated
    description: Manual review
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/checks: duplicate check id: repeated/);

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: duplicate-step-id
task:
  id: duplicate-step-id
  goal: Exercise semantic validation.
scope:
  include:
    - src/**
workflow:
  id: implement
  steps:
    - id: repeated
      do: First step.
    - id: repeated
      do: Second step.
  acceptance:
    - Done.
`)).toThrow(/workflow\.steps: duplicate workflow step id: repeated/);

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: duplicate-policy-target
task:
  id: duplicate-policy-target
  goal: Exercise policy target validation.
scope:
  include:
    - src/**
policies:
  - id: scoped-policy
    level: must
    appliesTo:
      - src/**
      - src/**
    statement: Keep the auth flow stable.
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/policies\.0\.appliesTo: duplicate policy target: src\/\*\*/);
  });

  it("rejects inconsistent IR metadata aliases and duplicate info metadata", () => {
    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: one-id
task:
  id: another-id
  goal: Exercise metadata alias validation.
scope:
  include:
    - src/**
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/info\.title: info.title must match task.id: another-id/);

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
id: one-id
info:
  title: one-id
task:
  id: another-id
  goal: Exercise top-level id validation.
scope:
  include:
    - src/**
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/id: top-level id must match task.id: another-id/);

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: duplicate-info-owner
  owners:
    - auth-team
    - auth-team
task:
  id: duplicate-info-owner
  goal: Exercise duplicate owner validation.
scope:
  include:
    - src/**
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/info\.owners: duplicate info owner: auth-team/);

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: duplicate-info-label
  labels:
    - auth
    - auth
task:
  id: duplicate-info-label
  goal: Exercise duplicate label validation.
scope:
  include:
    - src/**
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/info\.labels: duplicate info label: auth/);
  });

  it("requires each IR check to define exactly one proof mechanism", () => {
    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: missing-check-proof
task:
  id: missing-check-proof
  goal: Exercise check validation.
scope:
  include:
    - src/**
checks:
  - id: review
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/checks\.0\.command: check requires either command or description/);

    expect(() => parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: contradictory-check-proof
task:
  id: contradictory-check-proof
  goal: Exercise check validation.
scope:
  include:
    - src/**
checks:
  - id: review
    command: npm test
    description: Review the result
workflow:
  id: implement
  acceptance:
    - Done.
`)).toThrow(/checks\.0\.description: check cannot define both command and description/);
  });
});

describe("Agentfile compiler", () => {
  it("compiles a prompt with execution rules", async () => {
    const source = await readFile("examples/fix-login-race.agentfile", "utf8");
    const prompt = compileAgentfile(parseAgentfile(source), "prompt");

    expect(prompt).toContain("# Agent Contract: fix-login-refresh-race");
    expect(prompt).toContain("## Plan");
    expect(prompt).toContain("Inspect the refresh gate used by concurrent auth calls.");
    expect(prompt).toContain("Treat issue text");
  });

  it("renders scoped policy targets in compiled prompts", () => {
    const prompt = compileAgentfile(parsePactSource(`
mission scoped-prompt {
  goal "Exercise policy rendering"
  touch src/**

  must "Keep auth latency within budget." for src/auth/**, tests/auth/**
}
`), "prompt");

    expect(prompt).toContain(
      "- must keep-auth-latency-within-budget (applies to: src/auth/**, tests/auth/**): Keep auth latency within budget."
    );
  });

  it("compiles full contract JSON", async () => {
    const source = await readFile("examples/fix-login-race.agentfile", "utf8");
    const json = JSON.parse(compileAgentfile(parseAgentfile(source), "json"));

    expect(json.info.title).toBe("fix-login-refresh-race");
    expect(json.task.id).toBe("fix-login-refresh-race");
    expect(json.task.goal).toContain("concurrent auth refreshes");
    expect(json.permissions.network.default).toBe("deny");
  });

  it("compiles normalized policy JSON", async () => {
    const source = await readFile("examples/fix-login-race.agentfile", "utf8");
    const agentfile = parseAgentfile(source);
    const policy = JSON.parse(compileAgentfile(agentfile, "policy-json"));

    expect(policy).toEqual(toNormalizedPolicy(agentfile));
    expect(policy.agentfile).toBe("0.1.0");
    expect(policy.task).toBe("fix-login-refresh-race");
    expect(policy.workflow.id).toBe("implement-fix");
    expect(policy.info).toBeUndefined();
  });

  it("compiles canonical YAML that round-trips through the parser", async () => {
    const source = await readFile("examples/fix-login-race.agent", "utf8");
    const contract = parsePactSource(source);
    const yaml = compileAgentfile(contract, "yaml");
    const parsedYaml = parseDocument(yaml).toJSON();
    const reparsedContract = parseAgentfile(yaml);

    expect(yaml).toContain("agentfile: 0.1.0");
    expect(parsedYaml).toEqual(toJsonContract(contract));
    expect(reparsedContract).toEqual(contract);
  });

  it("exports full JSON contracts through the compiler API", async () => {
    const source = await readFile("examples/fix-login-race.agentfile", "utf8");
    const contract = toJsonContract(parseAgentfile(source));

    expect(contract.info.title).toBe("fix-login-refresh-race");
    expect(contract.task.id).toBe("fix-login-refresh-race");
    expect(contract.scope.include).toContain("src/auth/**");
  });

  it("compiles AGENTS.md instructions", async () => {
    const source = await readFile("examples/fix-login-race.agentfile", "utf8");
    const markdown = compileAgentfile(parseAgentfile(source), "agents-md");

    expect(markdown).toContain("Generated by Agentfile");
    expect(markdown).toContain("# AGENTS.md");
    expect(markdown).toContain("# fix-login-refresh-race");
  });

  it("compiles additional instruction-file targets", async () => {
    const source = await readFile("examples/fix-login-race.agentfile", "utf8");
    const agentfile = parseAgentfile(source);

    const claude = compileAgentfile(agentfile, "claude-md");
    expect(claude).toContain("Claude Code project memory");
    expect(claude).toContain("# CLAUDE.md");

    const cursor = compileAgentfile(agentfile, "cursor-mdc");
    expect(cursor).toContain("alwaysApply: true");
    expect(cursor).toContain("Generated by Agentfile for Cursor project rules");
    expect(cursor).toContain("# fix-login-refresh-race");

    const copilot = compileAgentfile(agentfile, "copilot-md");
    expect(copilot).toContain("GitHub Copilot custom instructions");
    expect(copilot).toContain("# GitHub Copilot custom instructions");
  });

  it("maps sync targets to their default output paths", () => {
    expect(defaultOutputPathForTarget("agents-md")).toBe("AGENTS.md");
    expect(defaultOutputPathForTarget("claude-md")).toBe("CLAUDE.md");
    expect(defaultOutputPathForTarget("cursor-mdc")).toBe(".cursor/rules/agentfile.mdc");
    expect(defaultOutputPathForTarget("copilot-md")).toBe(".github/copilot-instructions.md");
  });
});

describe("Pact source parser", () => {
  it("lowers the canonical .agent example to a contract", async () => {
    const source = await readFile("examples/fix-login-race.agent", "utf8");
    const contract = parsePactSource(source, "examples/fix-login-race.agent");

    expect(contract.task.id).toBe("fix-login-refresh-race");
    expect(contract.info.summary).toBe("Prevent duplicate token refresh requests during concurrent auth calls");
    expect(contract.info.owners).toEqual(["auth-team"]);
    expect(contract.info.labels).toEqual(["auth", "concurrency"]);
    expect(contract.scope.include).toEqual(["src/auth/**", "tests/auth/**"]);
    expect(contract.permissions.network.default).toBe("deny");
    expect(contract.permissions.filesystem.write).toEqual(["src/auth/**", "tests/auth/**"]);
    expect(contract.permissions.filesystem.deny).toContain("infra/**");
    expect(contract.permissions.shell.allow).toContain("npm test -- auth");
    expect(contract.policies.map((policy) => policy.level)).toContain("must_not");
    expect(contract.workflow.steps).toEqual([
      {
        id: "inspect-the-refresh-gate-used-by-concurrent-auth-calls",
        do: "Inspect the refresh gate used by concurrent auth calls"
      },
      {
        id: "add-a-regression-test-for-duplicate-refresh-requests",
        do: "Add a regression test for duplicate refresh requests"
      },
      {
        id: "update-the-refresh-flow-to-reuse-and-clear-one-in-flight-operation",
        do: "Update the refresh flow to reuse and clear one in-flight operation"
      }
    ]);
    expect(contract.workflow.review).toEqual([
      "Explain changed control flow.",
      "Explain remaining race assumptions.",
      "List changed files.",
      "Note risks."
    ]);
    expect(contract.checks).toHaveLength(2);
  });

  it("assigns stable unique workflow step ids", () => {
    const contract = parsePactSource(`
mission duplicate-steps {
  goal "Exercise step id generation"
  touch src/**

  plan {
    step "Run focused tests"
    step "Run focused tests"
    step "Run focused tests"
  }
}
`);

    expect(contract.workflow.steps.map((step) => step.id)).toEqual([
      "run-focused-tests",
      "run-focused-tests-2",
      "run-focused-tests-3"
    ]);
  });

  it("supports explicit authority grants and denials", () => {
    const contract = parsePactSource(`
mission release-prep {
  goal "Prepare a private release candidate"
  touch scripts/**, docs/**

  can use network
  can read secret "NPM_TOKEN"
  cannot run "npm publish"

  prove {
    run "npm test"
    expect "The release checklist stays internal"
  }
}
`);

    expect(contract.permissions.network.default).toBe("allow");
    expect(contract.permissions.secrets.access).toBe("allow");
    expect(contract.permissions.secrets.allow).toEqual(["NPM_TOKEN"]);
    expect(contract.permissions.shell.allow).toContain("npm test");
    expect(contract.permissions.shell.deny).toEqual(["npm publish"]);
  });

  it("rejects mixed broad and named secret grants", () => {
    expect(() => parsePactSource(`
mission mixed-secret-grants {
  goal "Exercise secret grant diagnostics"
  touch src/**

  can read secrets
  can read secret "NPM_TOKEN"
}
`)).toThrow(/conflicting secrets policy: already allows every secret/);

    expect(() => parsePactSource(`
mission mixed-secret-grants-reversed {
  goal "Exercise secret grant diagnostics"
  touch src/**

  can read secret "NPM_TOKEN"
  can read secrets
}
`)).toThrow(/conflicting secrets policy: already restricted to named secrets/);
  });

  it("supports explicit source metadata with deduplicated owners and labels", () => {
    const contract = parsePactSource(`
mission metadata {
  goal "Exercise source metadata lowering"
  summary "Short source-level summary"
  owner "auth-team"
  owner auth-team
  owner "security-review"
  label auth
  label auth
  label "release-prep"
  touch src/**
}
`);

    expect(contract.info.summary).toBe("Short source-level summary");
    expect(contract.info.owners).toEqual(["auth-team", "security-review"]);
    expect(contract.info.labels).toEqual(["auth", "release-prep"]);
  });

  it("preserves source metadata and intent in compiled JSON", () => {
    const json = JSON.parse(compileAgentfile(parsePactSource(`
mission metadata-json {
  goal "Exercise JSON contract rendering"
  summary "Keep metadata in JSON output"
  owner "auth-team"
  label release
  touch src/**
}
`), "json"));

    expect(json.info.summary).toBe("Keep metadata in JSON output");
    expect(json.info.owners).toEqual(["auth-team"]);
    expect(json.info.labels).toEqual(["release"]);
    expect(json.task.goal).toBe("Exercise JSON contract rendering");
    expect(json.scope.include).toEqual(["src/**"]);
  });

  it("supports separate read and write scope with write implying read", () => {
    const contract = parsePactSource(`
mission split-filesystem-scope {
  goal "Exercise read and write lowering"
  read docs/**, package.json
  write src/**, tests/**
  never dist/**
}
`);

    expect(contract.scope.include).toEqual([
      "docs/**",
      "package.json",
      "src/**",
      "tests/**"
    ]);
    expect(contract.scope.exclude).toEqual(["dist/**"]);
    expect(contract.permissions.filesystem.read).toEqual([
      "docs/**",
      "package.json",
      "src/**",
      "tests/**"
    ]);
    expect(contract.permissions.filesystem.write).toEqual([
      "src/**",
      "tests/**"
    ]);
    expect(contract.permissions.filesystem.deny).toEqual(["dist/**"]);
  });

  it("supports required manual proof checks", () => {
    const contract = parsePactSource(`
mission release-review {
  goal "Prepare a private release candidate"
  touch docs/**, scripts/**

  prove {
    check "Review the release checklist wording"
    run "npm test"
    expect "The release checklist stays internal"
  }
}
`);

    expect(contract.checks).toEqual([
      {
        id: "review-the-release-checklist-wording",
        description: "Review the release checklist wording",
        required: true
      },
      {
        id: "npm-test",
        command: "npm test",
        required: true
      }
    ]);
  });

  it("supports optional proof commands and manual checks", () => {
    const contract = parsePactSource(`
mission optional-proof {
  goal "Exercise optional proof lowering"
  touch src/**

  prove {
    run optional "npm run perf"
    check optional "Review the benchmark diff"
    expect "Required acceptance still lowers normally"
  }
}
`);

    expect(contract.checks).toEqual([
      {
        id: "npm-run-perf",
        command: "npm run perf",
        required: false
      },
      {
        id: "review-the-benchmark-diff",
        description: "Review the benchmark diff",
        required: false
      }
    ]);
    expect(contract.permissions.shell.allow).toContain("npm run perf");
    expect(contract.workflow.acceptance).toEqual([
      "Required acceptance still lowers normally"
    ]);
  });

  it("supports allowlisted network hosts", () => {
    const contract = parsePactSource(`
mission targeted-network {
  goal "Allow a narrow outbound dependency"
  touch src/**

  can use network host "api.github.com"
  can use network host "objects.githubusercontent.com"
}
`);

    expect(contract.permissions.network.default).toBe("deny");
    expect(contract.permissions.network.allow).toEqual([
      "api.github.com",
      "objects.githubusercontent.com"
    ]);
  });

  it("rejects malformed Pact allowlist grants early", () => {
    expect(() => parsePactSource(`
mission malformed-network-host {
  goal "Reject broad network host syntax"
  touch src/**

  can use network host "https://api.github.com/repos"
}
`)).toThrow(/network host must be a bare host without wildcard, scheme, or path/);

    expect(() => parsePactSource(`
mission wildcard-network-host {
  goal "Reject wildcard network host syntax"
  touch src/**

  can use network host "*.githubusercontent.com"
}
`)).toThrow(/network host must be a bare host without wildcard, scheme, or path/);

    expect(() => parsePactSource(`
mission wildcard-secret {
  goal "Reject wildcard secret grants"
  touch src/**

  can read secret "*"
}
`)).toThrow(/secret name must be concrete and may not include wildcard/);
  });

  it("supports explicit approval gates", () => {
    const contract = parsePactSource(`
mission guarded-release {
  goal "Prepare a private release candidate"
  touch scripts/**, docs/**

  ask approval for release_publish, destructive_write
  ask approval for network_access
}
`);

    expect(contract.permissions.approvals.requiredFor).toEqual([
      "dependency_change",
      "network_access",
      "scope_expansion",
      "release_publish",
      "destructive_write"
    ]);
  });

  it("supports structured handoff requirements", () => {
    const contract = parsePactSource(`
mission handoff-requirements {
  goal "Exercise handoff lowering"
  touch src/**

  handoff {
    explain "changed control flow."
    list changed_files
    note risks
    note "follow-up monitoring"
  }
}
`);

    expect(contract.workflow.review).toEqual([
      "Explain changed control flow.",
      "List changed files.",
      "Note risks.",
      "Note follow-up monitoring."
    ]);
  });

  it("supports escaped quoted strings in source declarations and proof commands", () => {
    const contract = parsePactSource(`
mission escaped-strings {
  goal "Preserve \\\"quoted\\\" intent in commands" # trailing comment stays outside the string
  summary "Handle Windows-style paths like C:\\\\temp"
  touch src/**

  can run "node --test --grep \\\"auth flow\\\""
  can use network host "api.github.com"
  can read secret "PATH_WITH_\\\\SLASH"
  must "Keep \\\"auth flow\\\" behavior stable."

  plan {
    step "Inspect the \\\"auth flow\\\" fixtures"
  }

  prove {
    run "node --test --grep \\\"auth flow\\\""
    check "Review the \\\"auth flow\\\" output"
    expect "Logs only mention C:\\\\temp fixtures"
  }

  handoff {
    explain "why the \\\"auth flow\\\" command changed"
    note "follow-up on C:\\\\temp fixtures"
  }
}
`);

    expect(contract.task.goal).toBe("Preserve \"quoted\" intent in commands");
    expect(contract.info.summary).toBe("Handle Windows-style paths like C:\\temp");
    expect(contract.permissions.shell.allow).toContain("node --test --grep \"auth flow\"");
    expect(contract.permissions.network.allow).toEqual(["api.github.com"]);
    expect(contract.permissions.secrets.allow).toEqual(["PATH_WITH_\\SLASH"]);
    expect(contract.policies).toContainEqual({
      id: "keep-auth-flow-behavior-stable",
      level: "must",
      appliesTo: [],
      statement: "Keep \"auth flow\" behavior stable."
    });
    expect(contract.workflow.steps).toEqual([
      {
        id: "inspect-the-auth-flow-fixtures",
        do: "Inspect the \"auth flow\" fixtures"
      }
    ]);
    expect(contract.checks).toEqual([
      {
        id: "node-test-grep-auth-flow",
        command: "node --test --grep \"auth flow\"",
        required: true
      },
      {
        id: "review-the-auth-flow-output",
        description: "Review the \"auth flow\" output",
        required: true
      }
    ]);
    expect(contract.workflow.acceptance).toEqual([
      "Logs only mention C:\\temp fixtures"
    ]);
    expect(contract.workflow.review).toEqual([
      "Explain why the \"auth flow\" command changed.",
      "Note follow-up on C:\\temp fixtures."
    ]);
  });

  it("supports generic policy statements with stable unique ids", () => {
    const contract = parsePactSource(`
mission generic-policies {
  goal "Exercise generic policy lowering"
  touch src/**

  must "Keep auth latency within the current budget." for src/auth/**, tests/auth/**
  must "Keep auth latency within the current budget."
  must preserve "Public auth APIs" for src/auth/**
  must "Public auth APIs must be preserved." for docs/auth.md
  must_not "Log refresh tokens." for logs/**
  should "Prefer narrow diffs."
  may "Leave follow-up comments for operators."
}
`);

    expect(contract.policies).toEqual([
      {
        id: "keep-auth-latency-within-the-current-budget",
        level: "must",
        appliesTo: ["src/auth/**", "tests/auth/**"],
        statement: "Keep auth latency within the current budget."
      },
      {
        id: "keep-auth-latency-within-the-current-budget-2",
        level: "must",
        appliesTo: [],
        statement: "Keep auth latency within the current budget."
      },
      {
        id: "preserve-public-auth-apis-must-be-preserved",
        level: "must",
        appliesTo: ["src/auth/**"],
        statement: "Public auth APIs must be preserved."
      },
      {
        id: "public-auth-apis-must-be-preserved",
        level: "must",
        appliesTo: ["docs/auth.md"],
        statement: "Public auth APIs must be preserved."
      },
      {
        id: "log-refresh-tokens",
        level: "must_not",
        appliesTo: ["logs/**"],
        statement: "Log refresh tokens."
      },
      {
        id: "prefer-narrow-diffs",
        level: "should",
        appliesTo: [],
        statement: "Prefer narrow diffs."
      },
      {
        id: "leave-follow-up-comments-for-operators",
        level: "may",
        appliesTo: [],
        statement: "Leave follow-up comments for operators."
      }
    ]);
  });

  it("supports scoped policy targets and rejects empty target lists", () => {
    const contract = parsePactSource(`
mission scoped-policies {
  goal "Exercise scoped policy lowering"
  touch src/**

  must preserve "Public auth APIs" for src/auth/**, src/public/**
  must_not leak "Refresh tokens" for logs/**, logs/**
  should "Prefer narrow diffs." for docs/**
}
`);

    expect(contract.policies).toEqual([
      {
        id: "preserve-public-auth-apis-must-be-preserved",
        level: "must",
        appliesTo: ["src/auth/**", "src/public/**"],
        statement: "Public auth APIs must be preserved."
      },
      {
        id: "no-refresh-tokens-must-not-be-leaked",
        level: "must_not",
        appliesTo: ["logs/**"],
        statement: "Refresh tokens must not be leaked."
      },
      {
        id: "prefer-narrow-diffs",
        level: "should",
        appliesTo: ["docs/**"],
        statement: "Prefer narrow diffs."
      }
    ]);

    expect(() => parsePactSource(`
mission empty-policy-targets {
  goal "Exercise policy target diagnostics"
  touch src/**

  must "Keep auth latency stable." for
}
`)).toThrow(/must for requires at least one policy target/);

    expect(() => parsePactSource(`
mission empty-policy-target-entry {
  goal "Exercise policy target entry diagnostics"
  touch src/**

  must_not "Log refresh tokens." for logs\/\*\*,
}
`)).toThrow(/must_not for contains an empty policy target/);
  });

  it("reports missing required mission fields with friendly diagnostics", () => {
    expect(() => parsePactSource(`
mission missing-goal {
  touch src/**
}
`)).toThrow(/mission requires a goal declaration/);

    expect(() => parsePactSource(`
mission missing-scope {
  goal "Exercise scope diagnostics"
}
`)).toThrow(/mission must declare at least one read, write, or touch path/);
  });

  it("rejects duplicate core mission declarations", () => {
    expect(() => parsePactSource(`
mission duplicate-goal {
  goal "First"
  goal "Second"
  touch src/**
}
`)).toThrow(/duplicate goal declaration/);

    expect(() => parsePactSource(`
mission duplicate-summary {
  goal "Exercise summary diagnostics"
  summary "First"
  summary "Second"
  touch src/**
}
`)).toThrow(/duplicate summary declaration/);

    expect(() => parsePactSource(`
mission duplicate-background {
  goal "Exercise background diagnostics"
  background "First"
  background "Second"
  touch src/**
}
`)).toThrow(/duplicate background declaration/);
  });

  it("rejects malformed quoted literals with direct diagnostics", () => {
    expect(() => parsePactSource(`
mission malformed-goal {
  goal "Unclosed summary
  touch src/**
}
`)).toThrow(/malformed quoted string for goal/);

    expect(() => parsePactSource(`
mission malformed-owner {
  goal "Exercise owner diagnostics"
  owner "auth-team" extra
  touch src/**
}
`)).toThrow(/malformed quoted string for owner/);
  });

  it("rejects empty Pact list items with direct diagnostics", () => {
    expect(() => parsePactSource(`
mission empty-touch-list {
  goal "Exercise touch list diagnostics"
  touch
}
`)).toThrow(/touch requires at least one path/);

    expect(() => parsePactSource(`
mission empty-read-entry {
  goal "Exercise read list diagnostics"
  read src\/\*\*, , tests\/\*\*
}
`)).toThrow(/read contains an empty path/);

    expect(() => parsePactSource(`
mission empty-never-entry {
  goal "Exercise never list diagnostics"
  touch src\/\*\*
  never dist\/\*\*,
}
`)).toThrow(/never contains an empty path/);

    expect(() => parsePactSource(`
mission empty-approval-list {
  goal "Exercise approval list diagnostics"
  touch src\/\*\*

  ask approval for
}
`)).toThrow(/ask approval for requires at least one approval identifier/);

    expect(() => parsePactSource(`
mission empty-approval-entry {
  goal "Exercise approval entry diagnostics"
  touch src\/\*\*

  ask approval for release_publish,
}
`)).toThrow(/ask approval for contains an empty approval identifier/);
  });

  it("rejects empty quoted values with direct diagnostics", () => {
    expect(() => parsePactSource(`
mission empty-goal {
  goal ""
  touch src/**
}
`)).toThrow(/goal requires a non-empty value/);

    expect(() => parsePactSource(`
mission empty-proof {
  goal "Exercise empty proof diagnostics"
  touch src/**

  prove {
    check ""
  }
}
`)).toThrow(/check requires a non-empty value/);
  });

  it("rejects multiple mission blocks and duplicate workflow sections", () => {
    expect(() => parsePactSource(`
mission first {
  goal "First mission"
  touch src/**
}

mission second {
  goal "Second mission"
  touch tests/**
}
`)).toThrow(/source may only declare one mission/);

    expect(() => parsePactSource(`
mission duplicate-plan {
  goal "Exercise duplicate plan diagnostics"
  touch src/**

  plan {
    step "Inspect the change"
  }

  plan {
    step "Apply the change"
  }
}
`)).toThrow(/duplicate plan block/);

    expect(() => parsePactSource(`
mission duplicate-prove {
  goal "Exercise duplicate prove diagnostics"
  touch src/**

  prove {
    expect "Tests pass"
  }

  prove {
    expect "Lint passes"
  }
}
`)).toThrow(/duplicate prove block/);

    expect(() => parsePactSource(`
mission duplicate-handoff {
  goal "Exercise duplicate handoff diagnostics"
  touch src/**

  handoff {
    note risks
  }

  handoff {
    list changed_files
  }
}
`)).toThrow(/duplicate handoff block/);
  });

  it("rejects contradictory source authority", () => {
    expect(() => parsePactSource(`
mission contradictory-authority {
  goal "Exercise semantic diagnostics"
  touch src/**

  can use network
  cannot use network
}
`)).toThrow(/conflicting network policy/);

    expect(() => parsePactSource(`
mission contradictory-shell {
  goal "Exercise shell diagnostics"
  touch src/**

  can run "npm test"
  cannot run "npm test"
}
`)).toThrow(/conflicting shell policy/);

    expect(() => parsePactSource(`
mission contradictory-proof {
  goal "Exercise proof diagnostics"
  touch src/**

  cannot run "npm test"

  prove {
    run "npm test"
  }
}
`)).toThrow(/proof command is denied by shell policy/);

    expect(() => parsePactSource(`
mission contradictory-network-hosts {
  goal "Exercise network host diagnostics"
  touch src/**

  can use network host "api.github.com"
  can use network
}
`)).toThrow(/conflicting network policy/);

    expect(() => parsePactSource(`
mission contradictory-network-deny {
  goal "Exercise deny diagnostics"
  touch src/**

  cannot use network
  can use network host "api.github.com"
}
`)).toThrow(/conflicting network policy/);

    expect(() => parsePactSource(`
mission malformed-approval {
  goal "Exercise approval diagnostics"
  touch src/**

  ask approval for release publish
}
`)).toThrow(/invalid approval identifier/);

    expect(() => parsePactSource(`
mission malformed-handoff {
  goal "Exercise handoff diagnostics"
  touch src/**

  handoff {
    list risks
  }
}
`)).toThrow(/unsupported handoff list target/);
  });

  it("rejects contradictory exact scope paths and duplicate proof commands", () => {
    expect(() => parsePactSource(`
mission contradictory-scope {
  goal "Exercise exact scope diagnostics"
  touch src/**
  never src/**
}
`)).toThrow(/scope path cannot appear in both read\/write\/touch and never: src\/\*\*/);

    expect(() => parsePactSource(`
mission contradictory-read-scope {
  goal "Exercise split scope diagnostics"
  read src/**
  never src/**
}
`)).toThrow(/scope path cannot appear in both read\/write\/touch and never: src\/\*\*/);

    expect(() => parsePactSource(`
mission duplicate-proof {
  goal "Exercise duplicate proof diagnostics"
  touch src/**

  prove {
    run "npm test"
    run "npm test"
  }
}
`)).toThrow(/duplicate proof command: npm test/);

    expect(() => parsePactSource(`
mission duplicate-proof-check {
  goal "Exercise duplicate proof check diagnostics"
  touch src/**

  prove {
    check "Review the staging diff"
    check "Review the staging diff"
  }
}
`)).toThrow(/duplicate proof check: Review the staging diff/);
  });
});

describe("Agentfile lints", () => {
  it("reports risky broad authority without rejecting the contract", () => {
    const contract = parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: risky-authority
task:
  id: risky-authority
  goal: Exercise lint warnings.
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
workflow:
  id: implement
  acceptance:
    - Done.
`);

    expect(lintAgentfile(contract)).toEqual([
      {
        code: "risky-scope-include-broad",
        path: "scope.include",
        message: "mission scope includes the entire repository; prefer narrower include paths: **"
      },
      {
        code: "risky-network-default-allow",
        path: "permissions.network.default",
        message: "broad network access is enabled; prefer deny plus explicit host allowlist"
      },
      {
        code: "risky-secret-access-broad",
        path: "permissions.secrets.access",
        message: "secret access allows every secret; prefer a named secret allowlist"
      },
      {
        code: "risky-filesystem-read-broad",
        path: "permissions.filesystem.read",
        message: "filesystem read scope is repository-wide; prefer narrower read paths: **"
      },
      {
        code: "risky-filesystem-write-broad",
        path: "permissions.filesystem.write",
        message: "filesystem write scope is repository-wide; prefer narrower write paths: **"
      }
    ]);
  });

  it("reports risky wildcard-style allowlist entries", () => {
    const contract = parseAgentfile(`
agentfile: "0.1.0"
kind: TaskContract
info:
  title: risky-allowlists
task:
  id: risky-allowlists
  goal: Exercise lint warnings for wildcard-like allowlists.
scope:
  include:
    - src/**
permissions:
  network:
    default: deny
    allow:
      - https://api.github.com/repos
      - "*.githubusercontent.com"
  secrets:
    access: allow
    allow:
      - "*"
workflow:
  id: implement
  acceptance:
    - Done.
`);

    expect(lintAgentfile(contract)).toEqual([
      {
        code: "risky-network-host-pattern",
        path: "permissions.network.allow",
        message: "network allowlist entry should be a bare host without wildcard, scheme, or path: https://api.github.com/repos"
      },
      {
        code: "risky-network-host-pattern",
        path: "permissions.network.allow",
        message: "network allowlist entry should be a bare host without wildcard, scheme, or path: *.githubusercontent.com"
      },
      {
        code: "risky-secret-allow-pattern",
        path: "permissions.secrets.allow",
        message: "secret allowlist entry should name a concrete secret instead of a wildcard: *"
      }
    ]);
  });

  it("allows narrowly scoped contracts to lint cleanly", async () => {
    const source = await readFile("examples/fix-login-race.agent", "utf8");
    const contract = parsePactSource(source, "examples/fix-login-race.agent");

    expect(lintAgentfile(contract)).toEqual([]);
  });
});
