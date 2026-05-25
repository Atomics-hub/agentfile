#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);

const publicSurfaces = [
  "README.md",
  "package.json",
  "docs/demo.md",
  "docs/cli.md",
  "docs/github-actions.md",
  "docs/security-model.md",
  "docs/benchmark-results.md",
  "docs/launch-readiness.md",
  "docs/phase-1-launch-packet.md",
  "docs/language-thesis.md",
  "docs/roadmap.md",
  "benchmarks/README.md"
];

const blockedClaims = [
  {
    id: "world-takeover",
    pattern: /\btake over the world\b/iu,
    reason: "Avoid spectacle claims that are not technical launch claims."
  },
  {
    id: "replace-languages",
    pattern: /\breplac(?:e|es|ing)\s+(?:programming\s+)?languages\b/iu,
    reason: "Do not imply Agentfile replaces general-purpose programming languages."
  },
  {
    id: "outperform-everything",
    pattern: /\boutperform(?:s|ed|ing)?\s+every\b/iu,
    reason: "Universal performance claims are not supported by the current evidence."
  },
  {
    id: "broadly-better",
    pattern: /\bbroadly\s+better\s+than\b/iu,
    reason: "Broad comparative claims require broader benchmark evidence."
  },
  {
    id: "python-comparison",
    pattern: /\bbetter\s+than\s+Python\b/iu,
    reason: "The current benchmark does not compare Agentfile with Python."
  },
  {
    id: "beats-instructions",
    pattern: /\bbeats?\s+(?:plain\s+issue|strong\s+Markdown|instruction\s+files|scattered\s+instruction)/iu,
    reason: "Use receipt-backed metric language instead of broad win/loss language."
  },
  {
    id: "safe-reviewable",
    pattern: /\bsafe,\s*reviewable\b/iu,
    reason: "Use reviewable or governable language instead of implying safety guarantees."
  },
  {
    id: "safety-guarantee",
    pattern: /\bguarantee(?:s|d)?\s+(?:safe|safer|safety)\b|\bguarantees?\s+safer\s+agent\s+behavior\b/iu,
    reason: "Do not imply Agentfile guarantees safe or safer agent behavior."
  },
  {
    id: "reliability-superiority",
    pattern: /\bmore\s+reliably\s+than\s+today'?s\s+ad\s+hoc\b/iu,
    reason: "Frame this as the project goal until broader evidence exists."
  }
];

const allowedContext = [
  /\bdo not claim\b/iu,
  /\bdo not use\b/iu,
  /\bdoes not support\b/iu,
  /\bdoes not yet earn\b/iu,
  /\bnot as evidence\b/iu,
  /\bnot trying to\b/iu,
  /\bnot .*replacement\b/iu,
  /\breports? that\b/iu,
  /\bsource:\s*https?:\/\//iu
];

export async function reviewPublicClaims() {
  const files = await Promise.all(publicSurfaces.map(async (path) => ({
    path,
    text: await readFile(resolve(root, path), "utf8")
  })));

  const violations = [];

  for (const file of files) {
    const lines = file.text.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const claim of blockedClaims) {
        if (!claim.pattern.test(line) || allowedContext.some((pattern) => pattern.test(line))) {
          continue;
        }

        violations.push({
          path: file.path,
          line: index + 1,
          claimId: claim.id,
          reason: claim.reason,
          text: line.trim()
        });
      }
    });
  }

  return {
    surfaceCount: publicSurfaces.length,
    blockedClaimCount: blockedClaims.length,
    violationCount: violations.length,
    violations
  };
}

export function renderClaimReview(review) {
  return [
    "# Agentfile Public Claim Review",
    "",
    `Surfaces reviewed: ${review.surfaceCount}`,
    `Blocked claim patterns: ${review.blockedClaimCount}`,
    `Violations: ${review.violationCount}`,
    "",
    ...(review.violations.length > 0 ? [
      "## Violations",
      "",
      table(
        ["File", "Line", "Claim", "Reason", "Text"],
        review.violations.map((violation) => [
          violation.path,
          violation.line,
          violation.claimId,
          violation.reason,
          violation.text
        ])
      ),
      ""
    ] : [
      "No blocked public-claim patterns were found in launch-facing surfaces.",
      ""
    ])
  ].join("\n");
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`)
  ].join("\n");
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const json = process.argv.includes("--json");
  const review = await reviewPublicClaims();

  process.stdout.write(json ? `${JSON.stringify(review, null, 2)}\n` : renderClaimReview(review));

  if (review.violationCount > 0) {
    process.exitCode = 1;
  }
}
