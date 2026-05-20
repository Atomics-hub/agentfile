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

### `policies`

Rules that must remain true.

```yaml
policies:
  - id: no-token-logging
    level: must_not
    statement: Refresh tokens must never be logged.
```

`level` may be `must`, `must_not`, `should`, or `may`.

### `checks`

Commands or review checks used to verify the work.

```yaml
checks:
  - id: test
    command: npm test
    required: true
```

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

## Policy Defaults

If a permission field is omitted, integrations should use the safer interpretation:

- Network: deny.
- Network allowlist entries are only valid when `permissions.network.default` is `deny`.
- Secrets: deny.
- Secret allowlist entries are only valid when `permissions.secrets.access` is `allow`.
- Shell: deny except explicit allowlist.
- Shell entries may not appear in both allow and deny lists.
- Scope expansion: approval required.
- Dependency changes: approval required.

The CLI reports these defaults in compiled JSON.
