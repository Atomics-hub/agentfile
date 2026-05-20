# Pact Codename

The source language needs a name that feels like a real language, not a config format.

Working codename: **Pact**.

Agentfile remains the project and compiler name for now. Pact is the language layer above the contract IR.

## Why Pact

- Short.
- Memorable.
- Human-readable.
- Agent-readable.
- Implies mutual obligation without sounding like legal parody.
- Works in CLI phrases: `pact check`, `pact plan`, `pact run`, `pact verify`.

## One-Liner

Pact is a language for turning human intent into contracts that agents can execute, prove, and be held to.

Shorter:

> Contracts for agent work.

Launch-style:

> Stop shipping prompts. Start shipping pacts.

## Syntax Direction

```pact
task "prepare release notes" {
  goal:
    Summarize user-visible changes since the last release.

  inputs:
    repo: github.repo("acme/app")
    since: tag("v2.4.0")

  allow:
    read repo.commits
    read repo.pull_requests
    write file("RELEASE_NOTES.md")

  deny:
    publish release
    modify source_code

  require:
    every change cites a pull request
    breaking changes are grouped first
    output is under 1200 words

  prove:
    file("RELEASE_NOTES.md").exists
    no uncited_changes
}
```

## Concepts

- Pact: source file written by humans or agents.
- Contract IR: compiled representation.
- Task: bounded unit of work.
- Policy: reusable constraint.
- Proof: success or failure evidence.
- Grant: allowed capability.
- Deny: forbidden capability.
- Gate: approval before proceeding.
- Actor: agent, human, team, or service.
- Claim: statement requiring support.
- Trace: execution history.
- Receipt: final signed result of a run.

## Naming Risk

Pact is not final. Before public rename or package publication, check:

- npm package availability.
- GitHub organization/repo availability.
- Existing programming languages or policy engines with overlapping names.
- Trademark risk in developer tooling.

Until then, use Pact as a codename in docs and examples.
