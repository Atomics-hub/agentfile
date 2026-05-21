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
}).superRefine((approvals, ctx) => {
  for (const approval of approvals.requiredFor) {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(approval)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requiredFor"],
        message: `invalid approval identifier: ${approval}`
      });
    }
  }

  addDuplicateValueIssues(
    approvals.requiredFor,
    "approval requirement",
    ["requiredFor"],
    ctx
  );
});

export const checkSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
  command: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  required: z.boolean().default(true)
}).superRefine((check, ctx) => {
  if (!check.command && !check.description) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["command"],
      message: "check requires either command or description"
    });
  }

  if (check.command && check.description) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["description"],
      message: "check cannot define both command and description"
    });
  }
});

export const infoSchema = z.object({
  title: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
  version: z.string().min(1).optional(),
  license: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  owners: z.array(z.string().min(1)).default([]),
  labels: z.array(z.string().min(1)).default([])
}).superRefine((info, ctx) => {
  addDuplicateValueIssues(info.owners, "info owner", ["owners"], ctx);
  addDuplicateValueIssues(info.labels, "info label", ["labels"], ctx);
});

export const permissionsSchema = z.object({
  shell: shellPolicySchema.default({ allow: [], deny: [] }),
  network: networkPolicySchema.default({ default: "deny", allow: [] }),
  filesystem: filesystemPolicySchema.default({ read: [], write: [], deny: [] }),
  secrets: accessSchema.default({ access: "deny", allow: [] }),
  approvals: approvalsSchema.default({})
}).superRefine((permissions, ctx) => {
  addDuplicateValueIssues(permissions.shell.allow, "shell allow command", ["shell", "allow"], ctx);
  addDuplicateValueIssues(permissions.shell.deny, "shell deny command", ["shell", "deny"], ctx);
  addDuplicateValueIssues(permissions.network.allow, "network allow host", ["network", "allow"], ctx);
  addDuplicateValueIssues(permissions.filesystem.read, "filesystem read path", ["filesystem", "read"], ctx);
  addDuplicateValueIssues(permissions.filesystem.write, "filesystem write path", ["filesystem", "write"], ctx);
  addDuplicateValueIssues(permissions.filesystem.deny, "filesystem deny path", ["filesystem", "deny"], ctx);
  addDuplicateValueIssues(permissions.secrets.allow, "secret allow entry", ["secrets", "allow"], ctx);

  const shellOverlap = permissions.shell.allow.filter((command) => permissions.shell.deny.includes(command));
  for (const command of shellOverlap) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["shell", "deny"],
      message: `shell command cannot be both allowed and denied: ${command}`
    });
  }

  if (permissions.network.default === "allow" && permissions.network.allow.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["network", "allow"],
      message: "network allowlist requires permissions.network.default to be deny"
    });
  }

  if (permissions.secrets.access === "deny" && permissions.secrets.allow.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["secrets", "allow"],
      message: "secret allowlist requires permissions.secrets.access to be allow"
    });
  }

  const filesystemOverlap = [
    ...permissions.filesystem.read,
    ...permissions.filesystem.write
  ].filter((path, index, values) => {
    return permissions.filesystem.deny.includes(path) && values.indexOf(path) === index;
  });
  for (const path of filesystemOverlap) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["filesystem", "deny"],
      message: `filesystem path cannot be both readable/writable and denied: ${path}`
    });
  }

  const writeWithoutRead = permissions.filesystem.write.filter(
    (path) => !permissions.filesystem.read.includes(path)
  );
  for (const path of writeWithoutRead) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["filesystem", "write"],
      message: `filesystem write path must also appear in read: ${path}`
    });
  }
});

export const agentfileSchema = z.object({
  agentfile: z.literal("0.1.0"),
  kind: z.literal("TaskContract"),
  id: z.string().min(1).optional(),
  info: infoSchema,
  task: z.object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
    goal: z.string().min(1),
    background: z.string().min(1).optional()
  }),
  scope: z.object({
    include: z.array(z.string().min(1)).min(1),
    exclude: z.array(z.string().min(1)).default([])
  }),
  permissions: permissionsSchema.default({}),
  policies: z.array(z.object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
    level: z.enum(["must", "must_not", "should", "may"]),
    appliesTo: z.array(z.string().min(1)).default([]),
    statement: z.string().min(1)
  })).default([]),
  checks: z.array(checkSchema).default([]),
  workflow: z.object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
    steps: z.array(z.object({
      id: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/),
      do: z.string().min(1)
    })).default([]),
    acceptance: z.array(z.string().min(1)).default([]),
    review: z.array(z.string().min(1)).default([])
  })
}).superRefine((agentfile, ctx) => {
  addDuplicateValueIssues(agentfile.scope.include, "scope include path", ["scope", "include"], ctx);
  addDuplicateValueIssues(agentfile.scope.exclude, "scope exclude path", ["scope", "exclude"], ctx);

  if (agentfile.info.title !== agentfile.task.id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["info", "title"],
      message: `info.title must match task.id: ${agentfile.task.id}`
    });
  }

  if (agentfile.id && agentfile.id !== agentfile.task.id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["id"],
      message: `top-level id must match task.id: ${agentfile.task.id}`
    });
  }

  const overlappingScope = agentfile.scope.include.filter((path) => agentfile.scope.exclude.includes(path));
  for (const path of overlappingScope) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scope", "exclude"],
      message: `scope path cannot be both included and excluded: ${path}`
    });
  }

  addDuplicateIdIssues(agentfile.policies, "policy", ["policies"], ctx);
  addDuplicateIdIssues(agentfile.checks, "check", ["checks"], ctx);
  addDuplicateIdIssues(agentfile.workflow.steps, "workflow step", ["workflow", "steps"], ctx);
});

export type Agentfile = z.infer<typeof agentfileSchema>;

function addDuplicateValueIssues(
  values: string[],
  label: string,
  path: [string, ...string[]],
  ctx: z.RefinementCtx
): void {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `duplicate ${label}: ${value}`
      });
      continue;
    }

    seen.add(value);
  }
}

function addDuplicateIdIssues(
  values: Array<{ id: string }>,
  label: string,
  path: [string, ...string[]],
  ctx: z.RefinementCtx
): void {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `duplicate ${label} id: ${value.id}`
      });
      continue;
    }

    seen.add(value.id);
  }
}
