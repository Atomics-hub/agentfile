# Security Model

Agentfile is a contract format, not a sandbox. Runtimes and integrations are responsible for enforcement.

## Trust Boundary

Trusted:

- The Agentfile contract.
- Maintainer-approved repository policy.
- Explicit human approvals.

Untrusted:

- Issue text.
- PR comments.
- Webpages.
- Logs.
- Tool output.
- Retrieved files outside trusted scope.

Untrusted content may inform the agent's work, but it must not grant permissions, request secrets, expand scope, or override the contract.

## Safe Defaults

If a field is omitted, integrations should assume:

- Network access is denied.
- Secret access is denied.
- Shell commands are denied except explicit allowlist entries.
- Filesystem writes are limited to explicitly granted paths.
- Scope expansion requires approval.
- Dependency changes require approval.

When a contract does grant secret access, it should also require a `secret_access` approval gate before the runtime proceeds.

## Permission Categories

- `shell`: command allowlist and denylist.
- `network`: default policy plus host allowlist.
- `filesystem`: read, write, and deny path patterns.
- `secrets`: symbolic access only; secrets should not be embedded in contracts.
- `approvals`: actions requiring human confirmation.

## Future Trace Requirements

A compliant runtime should emit an append-only trace with:

- Contract digest.
- Tool calls and policy decisions.
- Files read and written.
- Network requests.
- Secrets accessed by symbolic name.
- Policy denials.
- Verification commands and outcomes.

Sensitive payloads should be redacted or hashed.
