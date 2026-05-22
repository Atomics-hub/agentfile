import type { Agentfile } from "./schema.js";

export type CompileTarget =
  | "agent"
  | "prompt"
  | "json"
  | "policy-json"
  | "yaml"
  | "agents-md"
  | "claude-md"
  | "cursor-mdc"
  | "copilot-md";

export type SyncTarget = Extract<CompileTarget, "agents-md" | "claude-md" | "cursor-mdc" | "copilot-md">;

export interface CompileTargetDefinition {
  id: CompileTarget;
  description: string;
  fileBacked: boolean;
  defaultOutputPath?: string;
  render: (agentfile: Agentfile) => string;
}

export type TargetRendererMap = Record<CompileTarget, (agentfile: Agentfile) => string>;

export function createTargetRegistry(renderers: TargetRendererMap): CompileTargetDefinition[] {
  return [
    {
      id: "agent",
      description: "canonical Pact .agent source generated from the contract IR",
      fileBacked: false,
      render: renderers.agent
    },
    {
      id: "prompt",
      description: "plain-text prompt for a coding agent",
      fileBacked: false,
      render: renderers.prompt
    },
    {
      id: "json",
      description: "strict JSON contract IR",
      fileBacked: false,
      render: renderers.json
    },
    {
      id: "policy-json",
      description: "normalized policy JSON projection for policy engines and audit tooling",
      fileBacked: false,
      render: renderers["policy-json"]
    },
    {
      id: "yaml",
      description: "canonical YAML contract IR",
      fileBacked: false,
      render: renderers.yaml
    },
    {
      id: "agents-md",
      description: "generated AGENTS.md instructions",
      fileBacked: true,
      defaultOutputPath: "AGENTS.md",
      render: renderers["agents-md"]
    },
    {
      id: "claude-md",
      description: "generated CLAUDE.md project memory",
      fileBacked: true,
      defaultOutputPath: "CLAUDE.md",
      render: renderers["claude-md"]
    },
    {
      id: "cursor-mdc",
      description: "generated Cursor project rule",
      fileBacked: true,
      defaultOutputPath: ".cursor/rules/agentfile.mdc",
      render: renderers["cursor-mdc"]
    },
    {
      id: "copilot-md",
      description: "generated GitHub Copilot repository instructions",
      fileBacked: true,
      defaultOutputPath: ".github/copilot-instructions.md",
      render: renderers["copilot-md"]
    }
  ];
}

export function findTarget(
  registry: CompileTargetDefinition[],
  value: string
): CompileTargetDefinition | undefined {
  return registry.find((target) => target.id === value);
}

export function quotedTargetIds(registry: CompileTargetDefinition[]): string {
  return registry.map((target) => `"${target.id}"`).join(", ");
}
