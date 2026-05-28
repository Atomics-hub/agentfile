const nonEmptyString = { type: "string", minLength: 1 } as const;
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

export const receiptCheckResultsJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/Atomics-hub/agentfile/schemas/receipt-check-results.schema.json",
  title: "Agentfile Receipt Check Results",
  description: "Structured check-result input consumed by agentfile receipt fill --check-results.",
  type: "object",
  additionalProperties: false,
  required: ["checks"],
  properties: {
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["status"],
        anyOf: [
          {
            required: ["id"]
          },
          {
            required: ["command"]
          }
        ],
        properties: {
          id: nonEmptyString,
          command: nonEmptyString,
          status: {
            type: "string",
            enum: ["passed", "failed", "skipped"]
          },
          evidence: evidenceValue
        }
      },
      default: []
    }
  }
} as const;

export function compileReceiptCheckResultsSchema(): string {
  return `${JSON.stringify(receiptCheckResultsJsonSchema, null, 2)}\n`;
}
