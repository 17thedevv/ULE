/**
 * Cloze Response Submission Payload Builder
 *
 * Ensures that responses are keyed strictly by `blankKey` (e.g. 'blank_1', 'blank_2')
 * and dual-keyed with `answers` (for ABP ClozeBlockDefinition.evaluate)
 * and `blanks` (for Exam Attempt deterministic-auto-grader).
 */

export interface ClozeSubmissionPayload {
  [key: string]: unknown;
  answers: Record<string, string>;
  blanks: Record<string, string>;
}

export function buildClozeSubmissionPayload(
  rawAnswers: Record<string, string>,
): ClozeSubmissionPayload {
  const cleanAnswers: Record<string, string> = {};

  for (const [key, val] of Object.entries(rawAnswers)) {
    if (typeof key === 'string' && key.trim().length > 0) {
      cleanAnswers[key.trim()] = typeof val === 'string' ? val.trim() : '';
    }
  }

  return {
    answers: cleanAnswers,
    blanks: cleanAnswers,
  };
}
