import type { Agentfile } from "./schema.js";

export type ContractDiffKind = "added" | "removed" | "changed";

export interface ContractDiffEntry {
  kind: ContractDiffKind;
  path: string;
  before?: unknown;
  after?: unknown;
}

export type ContractDiffFormat = "text" | "json";

export function diffContracts(before: Agentfile, after: Agentfile): ContractDiffEntry[] {
  const entries: ContractDiffEntry[] = [];
  diffValues(before, after, [], entries);
  return entries;
}

export function renderContractDiff(entries: ContractDiffEntry[], format: ContractDiffFormat): string {
  if (format === "json") {
    return `${JSON.stringify({
      status: entries.length === 0 ? "same" : "different",
      differences: entries
    }, null, 2)}\n`;
  }

  if (entries.length === 0) {
    return "# Agentfile Contract Diff\n\nNo contract differences.\n";
  }

  return [
    "# Agentfile Contract Diff",
    "",
    ...entries.flatMap(renderTextEntry),
    ""
  ].join("\n");
}

function diffValues(before: unknown, after: unknown, path: Array<string | number>, entries: ContractDiffEntry[]) {
  if (Object.is(before, after)) {
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      const nextPath = [...path, index];
      if (index >= before.length) {
        entries.push({ kind: "added", path: formatPath(nextPath), after: after[index] });
      } else if (index >= after.length) {
        entries.push({ kind: "removed", path: formatPath(nextPath), before: before[index] });
      } else {
        diffValues(before[index], after[index], nextPath, entries);
      }
    }
    return;
  }

  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      const nextPath = [...path, key];
      const beforeHasKey = Object.hasOwn(before, key);
      const afterHasKey = Object.hasOwn(after, key);

      if (!beforeHasKey) {
        entries.push({ kind: "added", path: formatPath(nextPath), after: after[key] });
      } else if (!afterHasKey) {
        entries.push({ kind: "removed", path: formatPath(nextPath), before: before[key] });
      } else {
        diffValues(before[key], after[key], nextPath, entries);
      }
    }
    return;
  }

  entries.push({
    kind: "changed",
    path: formatPath(path),
    before,
    after
  });
}

function renderTextEntry(entry: ContractDiffEntry): string[] {
  const lines = [`- ${entry.kind} ${entry.path}`];
  if (entry.kind === "added") {
    lines.push(`  value: ${formatValue(entry.after)}`);
  } else if (entry.kind === "removed") {
    lines.push(`  value: ${formatValue(entry.before)}`);
  } else {
    lines.push(`  from: ${formatValue(entry.before)}`);
    lines.push(`  to: ${formatValue(entry.after)}`);
  }

  return lines;
}

function formatPath(path: Array<string | number>): string {
  if (path.length === 0) {
    return "$";
  }

  return path.map((segment, index) => {
    if (typeof segment === "number") {
      return `[${segment}]`;
    }

    return index === 0 ? segment : `.${segment}`;
  }).join("");
}

function formatValue(value: unknown): string {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
