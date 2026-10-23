import type { DomainResult, EditTaskResult, Task, TaskInput } from "./task";
import { validateTaskInput } from "./validation";

export type TaskServiceOptions = {
  createId?: () => string;
  now?: () => string;
};

const defaultCreateId = (): string => crypto.randomUUID();
const defaultNow = (): string => new Date().toISOString();

export function createTask(
  tasks: readonly Task[],
  input: TaskInput,
  options: TaskServiceOptions = {},
): DomainResult<Task[]> {
  const validated = validateTaskInput(input);
  if (!validated.ok) return validated;

  const existingIds = new Set(tasks.map((task) => task.id));
  const createId = options.createId ?? defaultCreateId;
  let id = createId();
  while (existingIds.has(id)) id = createId();

  const task: Task = {
    id,
    ...validated.value,
    completed: false,
    createdAt: (options.now ?? defaultNow)(),
  };

  return { ok: true, value: [task, ...tasks] };
}

export function editTask(
  tasks: readonly Task[],
  id: string,
  input: TaskInput,
): EditTaskResult {
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) {
    return { ok: false, reason: "not-found" };
  }

  const validated = validateTaskInput(input);
  if (!validated.ok) return validated;

  const updated = tasks.map((task) =>
    task.id === id ? { ...task, ...validated.value } : task,
  );
  return { ok: true, value: updated };
}

export function deleteTask(tasks: readonly Task[], id: string): Task[] {
  return tasks.filter((task) => task.id !== id);
}

export function setTaskCompletion(
  tasks: readonly Task[],
  id: string,
  completed: boolean,
): Task[] {
  return tasks.map((task) =>
    task.id === id && task.completed !== completed
      ? { ...task, completed }
      : task,
  );
}

export function selectTasks(
  tasks: readonly Task[],
  query: string,
  filter: "all" | "completed" | "incomplete",
): Task[] {
  const needle = query.trim().toLocaleLowerCase();
  return tasks.filter((task) => {
    const matchesText =
      needle.length === 0 ||
      task.title.toLocaleLowerCase().includes(needle) ||
      task.description.toLocaleLowerCase().includes(needle);
    const matchesStatus =
      filter === "all" ||
      (filter === "completed" && task.completed) ||
      (filter === "incomplete" && !task.completed);
    return matchesText && matchesStatus;
  });
}
