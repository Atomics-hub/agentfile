const nonEmptyString = { type: "string", minLength: 1 } as const;
const positiveInteger = { type: "integer", minimum: 1 } as const;
const selectorValue = {
  anyOf: [
    nonEmptyString,
    positiveInteger
  ]
} as const;
const evidenceValue = {
  anyOf: [
    nonEmptyString,
    {
      type: "array",
      minItems: 1
    },
    {
      type: "object",
      minProperties: 1
    },
    {
      type: "number"
    },
    {
      type: "boolean"
    }
  ]
} as const;
const evidenceAssignments = {
  type: "array",
  minItems: 1,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["selector", "evidence"],
    properties: {
      selector: selectorValue,
      evidence: evidenceValue
    }
  }
} as const;

export const receiptEvidenceJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/Atomics-hub/agentfile/schemas/receipt-evidence.schema.json",
  title: "Agentfile Receipt Evidence",
  description: "Structured acceptance and handoff evidence input consumed by agentfile receipt evidence --evidence-file.",
  type: "object",
  additionalProperties: false,
  anyOf: [
    {
      required: ["generatedInstructionSurfaceUsed"]
    },
    {
      required: ["acceptance"]
    },
    {
      required: ["handoff"]
    }
  ],
  properties: {
    generatedInstructionSurfaceUsed: nonEmptyString,
    acceptance: evidenceAssignments,
    handoff: evidenceAssignments
  }
} as const;

export function compileReceiptEvidenceSchema(): string {
  return `${JSON.stringify(receiptEvidenceJsonSchema, null, 2)}\n`;
}
