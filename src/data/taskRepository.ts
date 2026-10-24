import type { StoredTasksV1, Task } from "../domain/task";

export const TASK_STORAGE_KEY = "todo.tasks.v1";
const TASK_FIELDS = ["id", "title", "description", "completed", "createdAt"];

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export type LoadResult =
  | { status: "ready"; tasks: Task[]; source: "absent" | "stored" }
  | { status: "invalid"; raw: string; reason: string }
  | { status: "unavailable"; reason: string };

export type SaveResult =
  | { status: "saved" }
  | { status: "not-saved"; reason: string }
  | { status: "stale"; reason: string };

export type DocumentValidation =
  | { ok: true; value: StoredTasksV1 }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isIso8601Timestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offset] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (!offset) return false;
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (daysInMonth ?? 0) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }
  if (offset !== "Z") {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));
    if (offsetHour > 14 || (offsetHour === 14 && offsetMinute !== 0) || offsetMinute > 59) return false;
  }
  return true;
}

export function validateStoredDocument(value: unknown): DocumentValidation {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "tasks"])) {
    return { ok: false, reason: "The document must contain only schemaVersion and tasks." };
  }
  if (value.schemaVersion !== 1) {
    return { ok: false, reason: "This task file uses an unsupported schema version." };
  }
  if (!Array.isArray(value.tasks)) {
    return { ok: false, reason: "The tasks field must be an array." };
  }

  const seenIds = new Set<string>();
  const tasks: Task[] = [];
  for (let index = 0; index < value.tasks.length; index += 1) {
    const task: unknown = value.tasks[index];
    if (!isRecord(task) || !hasExactKeys(task, TASK_FIELDS)) {
      return { ok: false, reason: `Task ${index + 1} must contain exactly the required task fields.` };
    }
    const { id, title, description, completed, createdAt } = task;
    if (typeof id !== "string" || id.trim().length === 0) {
      return { ok: false, reason: `Task ${index + 1} has an invalid id.` };
    }
    if (seenIds.has(id)) {
      return { ok: false, reason: `Task ids must be unique (duplicate at task ${index + 1}).` };
    }
    if (typeof title !== "string" || title.length === 0 || title !== title.trim() || title.length > 100) {
      return { ok: false, reason: `Task ${index + 1} has an invalid title.` };
    }
    if (typeof description !== "string" || description.length > 500) {
      return { ok: false, reason: `Task ${index + 1} has an invalid description.` };
    }
    if (typeof completed !== "boolean") {
      return { ok: false, reason: `Task ${index + 1} has an invalid completion value.` };
    }
    if (typeof createdAt !== "string" || !isIso8601Timestamp(createdAt)) {
      return { ok: false, reason: `Task ${index + 1} has an invalid creation date.` };
    }
    seenIds.add(id);
    tasks.push({ id, title, description, completed, createdAt });
  }

  return { ok: true, value: { schemaVersion: 1, tasks } };
}

export class TaskRepository {
  private stale = false;
  private mutationReady = false;

  constructor(private readonly storage: StorageLike) {}

  load(): LoadResult {
    let raw: string | null;
    try {
      raw = this.storage.getItem(TASK_STORAGE_KEY);
    } catch {
      this.mutationReady = false;
      return { status: "unavailable", reason: "Browser storage could not be read." };
    }

    if (raw === null) {
      this.mutationReady = true;
      return { status: "ready", tasks: [], source: "absent" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      this.mutationReady = false;
      return { status: "invalid", raw, reason: "Saved task data is not valid JSON." };
    }
    const validation = validateStoredDocument(parsed);
    if (!validation.ok) {
      this.mutationReady = false;
      return { status: "invalid", raw, reason: validation.reason };
    }
    this.mutationReady = true;
    return { status: "ready", tasks: validation.value.tasks, source: "stored" };
  }

  save(tasks: readonly Task[]): SaveResult {
    if (this.stale) {
      return {
        status: "stale",
        reason: "Task data changed in another tab. Reload it before making changes.",
      };
    }
    if (!this.mutationReady) {
      return {
        status: "not-saved",
        reason: "Saved task data is invalid or unavailable. Import a valid file and confirm replacement before saving.",
      };
    }
    return this.writeValidated(tasks);
  }

  replaceAfterConfirmation(tasks: readonly Task[]): SaveResult {
    if (this.stale) {
      return {
        status: "stale",
        reason: "Task data changed in another tab. Reload it before replacing the list.",
      };
    }
    return this.writeValidated(tasks);
  }

  private writeValidated(tasks: readonly Task[]): SaveResult {
    const validation = validateStoredDocument({ schemaVersion: 1, tasks });
    if (!validation.ok) return { status: "not-saved", reason: validation.reason };

    let serialized: string;
    try {
      serialized = JSON.stringify(validation.value);
    } catch {
      return { status: "not-saved", reason: "Task data could not be serialized." };
    }

    try {
      this.storage.setItem(TASK_STORAGE_KEY, serialized);
      this.mutationReady = true;
      return { status: "saved" };
    } catch {
      return { status: "not-saved", reason: "Browser storage could not save the change." };
    }
  }

  markStale(): void {
    this.stale = true;
  }

  reload(): LoadResult {
    const result = this.load();
    if (result.status === "ready") this.stale = false;
    return result;
  }

  isStale(): boolean {
    return this.stale;
  }
}

export function isTaskStorageEvent(
  event: Pick<StorageEvent, "key" | "storageArea">,
  storage: StorageLike,
): boolean {
  return event.storageArea === storage && (event.key === TASK_STORAGE_KEY || event.key === null);
}
