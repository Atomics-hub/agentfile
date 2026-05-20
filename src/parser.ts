import { parseDocument } from "yaml";
import { AgentfileError, formatZodError } from "./diagnostics.js";
import { agentfileSchema, type Agentfile } from "./schema.js";

export function parseAgentfile(source: string, filePath?: string): Agentfile {
  const document = parseDocument(source, {
    prettyErrors: false,
    uniqueKeys: true
  });

  if (document.errors.length > 0) {
    throw new AgentfileError(
      document.errors.map((error) => error.message).join("\n"),
      filePath
    );
  }

  const value = document.toJSON();
  const parsed = agentfileSchema.safeParse(value);

  if (!parsed.success) {
    throw new AgentfileError(formatZodError(parsed.error), filePath);
  }

  return parsed.data;
}
