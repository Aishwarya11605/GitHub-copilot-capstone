export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  createdAt: string;
}

export interface StoredTasksV1 {
  schemaVersion: 1;
  tasks: Task[];
}

export type TaskInput = {
  title: string;
  description?: string;
};

export type ValidationErrors = Partial<Record<"title" | "description", string>>;

export type ValidationResult =
  | { ok: true; value: Required<TaskInput> }
  | { ok: false; errors: ValidationErrors };

export type DomainResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationErrors };

export type EditTaskResult =
  | { ok: true; value: Task[] }
  | { ok: false; errors: ValidationErrors }
  | { ok: false; reason: "not-found" };
