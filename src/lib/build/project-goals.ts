// SCRUM-170: the project owner's goals (captured in the questionnaire as a
// pipe-delimited string) are fed to the optimiser so it weights suggestions
// toward what the owner is trying to achieve. Pure helpers so the parsing + the
// prompt fragment are unit-testable.

/** Parse the questionnaire's pipe-delimited project_goals into a clean list. */
export function parseProjectGoals(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split("|")
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
}

/**
 * The system-prompt fragment that tells the optimiser to weight confidence +
 * ordering toward the owner's goals and to emit goal_alignment. Empty string
 * when there are no goals — the optimiser then behaves exactly as before
 * (the legacy-project fallback).
 */
export function goalsPromptContext(goals: string[]): string {
  if (goals.length === 0) return "";
  return `\n\nPROJECT OWNER'S GOALS:
The owner is using this analysis to: ${goals.join(", ")}.
Weight each suggestion's confidence AND the ordering of the suggestions toward these goals — a suggestion that strongly serves a stated goal should rank higher (earlier in the array) and score higher than one that does not. For EVERY suggestion, populate "goal_alignment" with one entry per goal above: { "goal": <the goal, verbatim>, "score": 0.0-1.0 (how well this suggestion serves that goal), "rationale": <one concrete sentence referencing the estimate, e.g. "high for comparing cost because the SIP swap saves 12% on materials"> }.`;
}
