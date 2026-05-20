import { z } from "zod";

export const accessSchema = z.object({
  access: z.enum(["allow", "deny"]).default("deny"),
  allow: z.array(z.string().min(1)).default([])
});

export const networkPolicySchema = z.object({
  default: z.enum(["allow", "deny"]).default("deny"),
  allow: z.array(z.string().min(1)).default([])
});

export const shellPolicySchema = z.object({
  allow: z.array(z.string().min(1)).default([]),
  deny: z.array(z.string().min(1)).default([])
});

export const filesystemPolicySchema = z.object({
  read: z.array(z.string().min(1)).default([]),
  write: z.array(z.string().min(1)).default([]),
  deny: z.array(z.string().min(1)).default([])
});

export const toolsPolicySchema = z.object({
  shell: shellPolicySchema.default({ allow: [], deny: [] }),
  network: networkPolicySchema.default({ default: "deny", allow: [] }),
  filesystem: filesystemPolicySchema.default({ read: [], write: [], deny: [] }),
  secrets: accessSchema.default({ access: "deny", allow: [] })
});

export const approvalsSchema = z.object({
  requiredFor: z.array(z.string().min(1)).default([
    "dependency_change",
    "network_access",
    "scope_expansion"
  ])
});

export const agentfileSchema = z.object({
  agentfile: z.literal("0.1.0"),
  kind: z.literal("TaskContract"),
  id: z.string().min(1).optional(),
  info: z.object({
    title: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
    version: z.string().min(1).optional(),
    license: z.string().min(1).optional(),
    summary: z.string().min(1).optional(),
    owners: z.array(z.string().min(1)).default([]),
    labels: z.array(z.string().min(1)).default([])
  }),
  task: z.object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
    goal: z.string().min(1),
    background: z.string().min(1).optional()
  }),
  scope: z.object({
    include: z.array(z.string().min(1)).min(1),
    exclude: z.array(z.string().min(1)).default([])
  }),
  permissions: z.object({
    shell: shellPolicySchema.default({ allow: [], deny: [] }),
    network: networkPolicySchema.default({ default: "deny", allow: [] }),
    filesystem: filesystemPolicySchema.default({ read: [], write: [], deny: [] }),
    secrets: accessSchema.default({ access: "deny", allow: [] }),
    approvals: approvalsSchema.default({})
  }).default({}),
  policies: z.array(z.object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
    level: z.enum(["must", "must_not", "should", "may"]),
    appliesTo: z.array(z.string().min(1)).default([]),
    statement: z.string().min(1)
  })).default([]),
  checks: z.array(z.object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
    command: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    required: z.boolean().default(true)
  })).default([]),
  workflow: z.object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
    steps: z.array(z.object({
      id: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
      do: z.string().min(1)
    })).default([]),
    acceptance: z.array(z.string().min(1)).default([]),
    review: z.array(z.string().min(1)).default([])
  })
});

export type Agentfile = z.infer<typeof agentfileSchema>;
