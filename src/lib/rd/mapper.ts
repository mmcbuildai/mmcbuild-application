import type { RdTag } from "@/lib/supabase/types";

export interface FileMapping {
  pattern: string;
  stage: string;
  deliverable: string;
  rd_tag: RdTag;
  priority: number;
}

export interface FileMappingMatch {
  stage: string;
  deliverable: string;
  rd_tag: RdTag;
}

/**
 * Convert a glob-like pattern to a RegExp.
 * Supports ** (any path), * (any segment), and ? (single char).
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");

  return new RegExp(`^${escaped}$`);
}

/**
 * Match a list of file paths against configured file mappings.
 * Returns the highest-priority match, or null if no match.
 */
export function matchFiles(
  filePaths: string[],
  mappings: FileMapping[]
): FileMappingMatch | null {
  if (mappings.length === 0) return null;

  // Sort by priority descending (higher priority wins)
  const sorted = [...mappings].sort((a, b) => b.priority - a.priority);

  for (const mapping of sorted) {
    const regex = patternToRegex(mapping.pattern);
    const matched = filePaths.some((fp) => regex.test(fp));
    if (matched) {
      return {
        stage: mapping.stage,
        deliverable: mapping.deliverable,
        rd_tag: mapping.rd_tag,
      };
    }
  }

  return null;
}
