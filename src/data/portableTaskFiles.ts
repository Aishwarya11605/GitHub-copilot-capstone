import type { Task } from "../domain/task";
import {
  TaskRepository,
  validateStoredDocument,
  type SaveResult,
} from "./taskRepository";

export const MAX_IMPORT_FILE_BYTES = 5_000_000;
export const MAX_IMPORT_TASKS = 10_000;

export type ImportPreview = {
  schemaVersion: 1;
  tasks: Task[];
};

export type ImportResult =
  | { status: "preview"; preview: ImportPreview }
  | { status: "rejected"; reason: string; guidance: string };

function reject(reason: string, guidance: string): ImportResult {
  return { status: "rejected", reason, guidance };
}

export async function previewImportFile(file: File): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return reject(
      "The selected file is larger than 5,000,000 bytes (decimal).",
      "Choose a smaller task export file.",
    );
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return reject("The selected file could not be read.", "Choose another readable JSON export file.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return reject("The selected file is not valid JSON.", "Choose a valid task export file.");
  }

  const document = validateStoredDocument(parsed);
  if (!document.ok) {
    return reject(document.reason, "Choose an unmodified export from this application.");
  }
  if (document.value.tasks.length > MAX_IMPORT_TASKS) {
    return reject(
      "The file contains more than 10,000 tasks.",
      "Choose an export containing no more than 10,000 tasks.",
    );
  }
  if (document.value.tasks.length === 0) {
    return reject("An import must contain at least one task.", "Choose a non-empty task export file.");
  }

  return {
    status: "preview",
    preview: {
      schemaVersion: 1,
      tasks: document.value.tasks.map((task) => ({ ...task })),
    },
  };
}

export function exportTasks(tasks: readonly Task[]): { ok: true; json: string } | { ok: false; reason: string } {
  const document = validateStoredDocument({ schemaVersion: 1, tasks });
  if (!document.ok) return { ok: false, reason: document.reason };
  try {
    return { ok: true, json: JSON.stringify(document.value, null, 2) };
  } catch {
    return { ok: false, reason: "Task data could not be prepared for export." };
  }
}

export function confirmImportReplacement(
  repository: TaskRepository,
  preview: ImportPreview,
): SaveResult {
  const validated = validateStoredDocument(preview);
  if (!validated.ok) {
    return { status: "not-saved", reason: validated.reason };
  }
  if (validated.value.tasks.length === 0) {
    return { status: "not-saved", reason: "An import must contain at least one task." };
  }
  if (validated.value.tasks.length > MAX_IMPORT_TASKS) {
    return { status: "not-saved", reason: "An import may contain no more than 10,000 tasks." };
  }
  return repository.replaceAfterConfirmation(validated.value.tasks);
}
