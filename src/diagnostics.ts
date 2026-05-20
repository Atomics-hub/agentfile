import type { ZodError } from "zod";

export class AgentfileError extends Error {
  constructor(message: string, readonly filePath?: string) {
    super(filePath ? `${filePath}: ${message}` : message);
    this.name = "AgentfileError";
  }
}

export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("\n");
}
