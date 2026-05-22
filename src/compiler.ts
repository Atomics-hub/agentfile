import { stringify } from "yaml";
import {
  compileAgentsMarkdown,
  compileClaudeMarkdown,
  compileCopilotMarkdown,
  compileCursorRule
} from "./renderers/instructions.js";
import { compileAgentSource } from "./renderers/pact-source.js";
import { compileAgentPrompt } from "./renderers/prompt.js";
import type { Agentfile } from "./schema.js";
import {
  createTargetRegistry,
  findTarget,
  type CompileTarget,
  type CompileTargetDefinition,
  type SyncTarget
} from "./targets.js";

export {
  compileAgentsMarkdown,
  compileClaudeMarkdown,
  compileCopilotMarkdown,
  compileCursorRule
} from "./renderers/instructions.js";
export { compileAgentSource } from "./renderers/pact-source.js";
export { compileAgentPrompt } from "./renderers/prompt.js";
export type { CompileTarget, CompileTargetDefinition, SyncTarget } from "./targets.js";
export type JsonContract = Agentfile;

export interface NormalizedPolicy {
  agentfile: "0.1.0";
  task: string;
  scope: Agentfile["scope"];
  permissions: Agentfile["permissions"];
  policies: Agentfile["policies"];
  checks: Agentfile["checks"];
  workflow: Agentfile["workflow"];
}

export function toNormalizedPolicy(agentfile: Agentfile): NormalizedPolicy {
  return {
    agentfile: agentfile.agentfile,
    task: agentfile.task.id,
    scope: agentfile.scope,
    permissions: agentfile.permissions,
    policies: agentfile.policies,
    checks: agentfile.checks,
    workflow: agentfile.workflow
  };
}

export function compileAgentfile(agentfile: Agentfile, target: CompileTarget): string {
  return targetDefinition(target).render(agentfile);
}

export const compileTargets = createTargetRegistry({
  agent: compileAgentSource,
  prompt: compileAgentPrompt,
  json: (agentfile) => `${JSON.stringify(toJsonContract(agentfile), null, 2)}\n`,
  "policy-json": (agentfile) => `${JSON.stringify(toNormalizedPolicy(agentfile), null, 2)}\n`,
  yaml: (agentfile) => `${stringify(toJsonContract(agentfile))}`,
  "agents-md": compileAgentsMarkdown,
  "claude-md": compileClaudeMarkdown,
  "cursor-mdc": compileCursorRule,
  "copilot-md": compileCopilotMarkdown
});

export function targetDefinition(target: CompileTarget): CompileTargetDefinition {
  const definition = findTarget(compileTargets, target);
  if (!definition) {
    throw new Error(`missing compile target definition: ${target}`);
  }
  return definition;
}

export function toJsonContract(agentfile: Agentfile): JsonContract {
  return structuredClone(agentfile);
}

export function defaultOutputPathForTarget(target: SyncTarget): string {
  return targetDefinition(target).defaultOutputPath as string;
}

export function isSyncTarget(target: CompileTarget): target is SyncTarget {
  return targetDefinition(target).fileBacked;
}
