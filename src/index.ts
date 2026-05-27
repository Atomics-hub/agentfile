export {
  compileAgentfile,
  compileAgentSource,
  compileAgentPrompt,
  compileAgentsMarkdown,
  compileClaudeMarkdown,
  compileCopilotMarkdown,
  compileCursorRule,
  compileTargets,
  defaultOutputPathForTarget,
  isSyncTarget,
  targetDefinition,
  toJsonContract,
  toNormalizedPolicy
} from "./compiler.js";
export type { CompileTarget, CompileTargetDefinition, JsonContract, NormalizedPolicy, SyncTarget } from "./compiler.js";
export { AgentfileError, lintAgentfile } from "./diagnostics.js";
export type { LintDiagnostic } from "./diagnostics.js";
export { diffContracts, renderContractDiff } from "./diff.js";
export type { ContractDiffEntry, ContractDiffFormat, ContractDiffKind } from "./diff.js";
export {
  defaultVscodeJsonMatches,
  defaultVscodeSchemaPath,
  defaultVscodeYamlMatches,
  renderVscodeSettings
} from "./editor.js";
export type { VscodeSettingsOptions } from "./editor.js";
export { parseAgentfile } from "./parser.js";
export { parsePactSource, parseSource } from "./source.js";
export { findTarget, quotedTargetIds } from "./targets.js";
export { agentfileSchema } from "./schema.js";
export { agentfileJsonSchema, compileJsonSchema } from "./json-schema.js";
export type { Agentfile } from "./schema.js";
