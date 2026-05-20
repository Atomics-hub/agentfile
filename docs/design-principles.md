# Design Principles

## Contracts Over Instructions

Agentfile should describe what an agent may do, what it must preserve, and how completion is proven. Free-form instructions are useful, but they should live inside a contract that tools can validate.

## Deny By Default

Network, secrets, shell, dependency changes, destructive filesystem operations, and scope expansion should be denied or approval-gated unless the contract grants them explicitly.

## Existing Tools First

Agentfile should compile into the surfaces teams already use: `AGENTS.md`, `CLAUDE.md`, Cursor rules, Copilot instructions, CI checks, and policy engines. It should not require teams to replace their coding agent stack.

## Reviewable Artifacts

Generated prompts, policy JSON, and future traces should be short enough to inspect in code review. Hidden autonomy is a product smell.

## Small Language, Strong Semantics

New syntax must earn its place by reducing a real agent failure mode. Prefer schema fields, validation rules, and compiler targets before inventing a bigger language.
