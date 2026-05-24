const identifierPattern = "^[a-z0-9][a-z0-9._-]*$";
const nonEmptyString = { type: "string", minLength: 1 } as const;
const identifier = { ...nonEmptyString, pattern: identifierPattern } as const;
const stringList = {
  type: "array",
  items: nonEmptyString,
  default: []
} as const;

export const agentfileJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/Atomics-hub/agentfile/schemas/agentfile.schema.json",
  title: "Agentfile TaskContract",
  description: "Structural JSON Schema for Agentfile v0.1 strict YAML/JSON contract IR. Use agentfile check for semantic invariants such as duplicate ids, scope/permission consistency, and risky authority diagnostics.",
  type: "object",
  additionalProperties: false,
  required: ["agentfile", "kind", "info", "task", "scope", "workflow"],
  properties: {
    agentfile: {
      const: "0.1.0",
      description: "Agentfile contract IR version."
    },
    kind: {
      const: "TaskContract",
      description: "Contract kind."
    },
    id: identifier,
    info: {
      type: "object",
      additionalProperties: false,
      required: ["title"],
      properties: {
        title: identifier,
        version: nonEmptyString,
        license: nonEmptyString,
        summary: nonEmptyString,
        owners: stringList,
        labels: stringList
      }
    },
    task: {
      type: "object",
      additionalProperties: false,
      required: ["id", "goal"],
      properties: {
        id: identifier,
        goal: nonEmptyString,
        background: nonEmptyString
      }
    },
    scope: {
      type: "object",
      additionalProperties: false,
      required: ["include"],
      properties: {
        include: {
          type: "array",
          items: nonEmptyString,
          minItems: 1
        },
        exclude: stringList
      }
    },
    permissions: {
      type: "object",
      additionalProperties: false,
      properties: {
        shell: {
          type: "object",
          additionalProperties: false,
          properties: {
            allow: stringList,
            deny: stringList
          }
        },
        network: {
          type: "object",
          additionalProperties: false,
          properties: {
            default: {
              type: "string",
              enum: ["allow", "deny"],
              default: "deny"
            },
            allow: stringList
          }
        },
        filesystem: {
          type: "object",
          additionalProperties: false,
          properties: {
            read: stringList,
            write: stringList,
            deny: stringList
          }
        },
        secrets: {
          type: "object",
          additionalProperties: false,
          properties: {
            access: {
              type: "string",
              enum: ["allow", "deny"],
              default: "deny"
            },
            allow: stringList
          }
        },
        approvals: {
          type: "object",
          additionalProperties: false,
          properties: {
            requiredFor: {
              type: "array",
              items: identifier,
              default: ["dependency_change", "network_access", "scope_expansion"]
            }
          }
        }
      }
    },
    policies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "level", "statement"],
        properties: {
          id: identifier,
          level: {
            type: "string",
            enum: ["must", "must_not", "should", "may"]
          },
          appliesTo: stringList,
          statement: nonEmptyString
        }
      },
      default: []
    },
    checks: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "command"],
            properties: {
              id: identifier,
              command: nonEmptyString,
              required: {
                type: "boolean",
                default: true
              }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "description"],
            properties: {
              id: identifier,
              description: nonEmptyString,
              required: {
                type: "boolean",
                default: true
              }
            }
          }
        ]
      },
      default: []
    },
    workflow: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: identifier,
        steps: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "do"],
            properties: {
              id: identifier,
              do: nonEmptyString
            }
          },
          default: []
        },
        acceptance: stringList,
        review: stringList
      }
    }
  }
} as const;

export function compileJsonSchema(): string {
  return `${JSON.stringify(agentfileJsonSchema, null, 2)}\n`;
}
