import type { TaskInput, ValidationResult } from "./task";

export const TITLE_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 500;

export function validateTaskInput(input: TaskInput): ValidationResult {
  const title = input.title.trim();
  const description = input.description ?? "";
  const errors: { title?: string; description?: string } = {};

  if (title.length === 0) {
    errors.title = "Enter a title with at least one non-whitespace character.";
  } else if (title.length > TITLE_MAX_LENGTH) {
    errors.title = `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`;
  }

  if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: { title, description } };
}
