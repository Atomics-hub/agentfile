# Security Policy

Agentfile is designed for systems where an AI agent may read context, edit files, run tools, and ask for approval. That means the contract format must be conservative by default.

## Supported Versions

Security fixes target the latest minor release until the project publishes a formal support matrix.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately by opening a draft security advisory on GitHub or emailing the maintainers once a project email is published.

Do not include live secrets, private repository contents, or exploit payloads against third-party systems in public issues.

## Security Model

An Agentfile should make authority explicit:

- Tools are denied unless allowed by policy.
- Network access is denied unless allowed by policy.
- Secret access is denied unless explicitly granted.
- Scope expansion requires approval.
- Dependency changes require approval.
- Shell commands should be allowlisted.
- Generated prompts must label untrusted inputs as data, not instructions.

Agentfile does not make LLM execution safe by itself. It gives agent runtimes, CLIs, CI systems, and reviewers a policy artifact they can enforce.

## Prompt Injection Boundary

Contracts should separate:

- Trusted instructions: the Agentfile itself and maintainer-approved policy.
- Untrusted data: issue bodies, webpages, external docs, tool responses, logs, and user-provided files.

Agents and integrations should never treat untrusted data as authority to expand scope, access secrets, add tools, or change policy.
