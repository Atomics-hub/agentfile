# Agentfile Contract IR v0.1 Spec

Agentfile v0.1 is the YAML/JSON contract IR for agent-executed software tasks.

The format is intentionally conservative. It should be easy for humans to review, easy for agents to follow, and easy for automation to validate.

The experimental Pact source language lowers into this IR.

## Top-Level Shape

```yaml
agentfile: "0.1.0"
kind: TaskContract
info: {}
task: {}
scope: {}
permissions: {}
policies: []
checks: []
workflow: {}
```

## Required Fields

### `agentfile`

The language version. v0.1 requires:

```yaml
agentfile: "0.1.0"
```

### `kind`

The contract kind. v0.1 supports:

```yaml
kind: TaskContract
```

### `info`

Human-facing metadata.

```yaml
info:
  title: fix-login-refresh-race
  version: "0.1.0"
  summary: Prevent duplicate token refresh requests.
  labels:
    - auth
    - concurrency
```

`info.title` is the human-facing alias for `task.id` in the contract IR, so the two fields must match exactly.

`info.owners` and `info.labels` should be treated as normalized sets. Duplicate exact entries are invalid.

### `task`

The work to perform.

```yaml
task:
  id: fix-login-refresh-race
  goal: Make concurrent auth refreshes share one in-flight refresh operation.
  background: The current client can issue duplicate refresh requests.
```

### `scope`

The codebase areas that are relevant to the contract.

```yaml
scope:
  include:
    - src/auth/**
    - tests/auth/**
  exclude:
    - src/billing/**
```

Exact path entries may not appear in both `scope.include` and `scope.exclude`.

`scope.include` and `scope.exclude` should be treated as normalized sets. Duplicate exact entries are invalid.

### `permissions`

The authority granted to the agent.

```yaml
permissions:
  shell:
    allow:
      - npm test -- auth
  network:
    default: deny
    allow:
      - api.github.com
  filesystem:
    read:
      - src/auth/**
    write:
      - src/auth/**
      - tests/auth/**
    deny:
      - .env
      - .env.*
  secrets:
    access: deny
  approvals:
    requiredFor:
      - dependency_change
      - network_access
      - scope_expansion
```

Exact path entries may not appear in both `permissions.filesystem.read` or `permissions.filesystem.write` and `permissions.filesystem.deny`.

Exact `permissions.filesystem.write` entries must also appear in `permissions.filesystem.read`.

`permissions.network.allow` entries must be bare hosts without schemes, paths, or wildcards. `permissions.secrets.allow` entries must name concrete secrets instead of wildcard patterns.

Authority lists should be normalized. Duplicate exact entries in shell allow/deny lists, network host allowlists, filesystem read/write/deny lists, secret allowlists, and approval requirements are invalid.

### `policies`

Rules that must remain true.

```yaml
policies:
  - id: no-token-logging
    level: must_not
    appliesTo:
      - src/auth/**
      - tests/auth/**
    statement: Refresh tokens must never be logged.
```

`level` may be `must`, `must_not`, `should`, or `may`.

`appliesTo` is optional and scopes a policy to the relevant paths, surfaces, or subsystems. Like other authority lists, it should be treated as a normalized set. Duplicate exact entries are invalid.

### `checks`

Commands or review checks used to verify the work.

```yaml
checks:
  - id: test
    command: npm test
    required: true
```

Each check must define exactly one proof mechanism: `command` for executable verification or `description` for a required manual review check.

Check ids must be unique within a contract.

Contracts should define at least one proof obligation through `checks` or `workflow.acceptance`. Contracts that only use manual proof and omit every executable `checks[*].command` are still valid IR, but the CLI linter warns so teams can keep verification posture concrete.

### `workflow`

The execution plan, acceptance, and handoff requirements for the agent run.

```yaml
workflow:
  id: implement
  steps:
    - id: inspect-auth-flow
      do: Inspect the existing auth refresh flow.
  acceptance:
    - Required checks pass.
  review:
    - Explain the changed control flow.
```

Workflow step ids must be unique within `workflow.steps`.

### Identifier Uniqueness

Contracts must not reuse ids within the same semantic list:

- `policies[*].id` values must be unique.
- `checks[*].id` values must be unique.
- `workflow.steps[*].id` values must be unique.

If the optional top-level `id` field is present for compatibility with downstream tooling, it must match `task.id`.

## Policy Defaults

If a permission field is omitted, integrations should use the safer interpretation:

- Network: deny.
- Network allowlist entries are only valid when `permissions.network.default` is `deny`.
- Secrets: deny.
- Secret allowlist entries are only valid when `permissions.secrets.access` is `allow`.
- Contracts that grant secret access should also require `secret_access` in `permissions.approvals.requiredFor`; the CLI linter warns when that gate is missing.
- Shell: deny except explicit allowlist.
- Shell entries may not appear in both allow and deny lists.
- Scope expansion: approval required.
- Dependency changes: approval required.

The CLI reports these defaults in compiled JSON.

Pact source may add project-specific approval gates with lines such as:

```agent
ask approval for release_publish, destructive_write
```

Pact lowering is conservative about risky authority. Source lines that grant secret access add `secret_access`, publish commands add `release_publish`, destructive shell commands add `destructive_write`, and dependency-changing commands retain `dependency_change` in the lowered IR.

Approval identifiers use the same conservative shape as other ids: lowercase alphanumerics plus `.`, `_`, or `-`, starting with an alphanumeric character.

## JSON Schema

The CLI can export a structural JSON Schema for the strict YAML/JSON contract IR:

```sh
agentfile schema > agentfile.schema.json
```

The schema is designed for editor integration, generated forms, and lightweight preflight checks. It describes required fields, enums, identifier shapes, and object structure. It does not replace `agentfile check`, which remains the source of truth for semantic invariants such as `info.title` matching `task.id`, duplicate id detection, scope/permission consistency, and risky authority validation.
