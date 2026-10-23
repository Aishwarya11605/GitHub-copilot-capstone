import { describe, expect, it } from "vitest";
import type { Task } from "../../../src/domain/task";
import { createTask, editTask, selectTasks, setTaskCompletion } from "../../../src/domain/taskService";
import { validateTaskInput } from "../../../src/domain/validation";

const existing: Task = {
  id: "task-existing",
  title: "Original",
  description: "Keep this",
  completed: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("shared task validation", () => {
  it("trims title and defaults an omitted description", () => {
    expect(validateTaskInput({ title: "  Write tests  " })).toEqual({
      ok: true,
      value: { title: "Write tests", description: "" },
    });
  });

  it("rejects blank title and enforces inclusive title and description limits", () => {
    expect(validateTaskInput({ title: " \t " })).toMatchObject({ ok: false, errors: { title: expect.any(String) } });
    expect(validateTaskInput({ title: "a".repeat(100), description: "d".repeat(500) }).ok).toBe(true);
    expect(validateTaskInput({ title: "a".repeat(101) })).toMatchObject({ ok: false, errors: { title: expect.any(String) } });
    expect(validateTaskInput({ title: "valid", description: "d".repeat(501) })).toMatchObject({ ok: false, errors: { description: expect.any(String) } });
  });

  it("uses the same limits for create and edit and leaves input tasks untouched", () => {
    const original = [existing];
    const create = createTask(original, { title: "x".repeat(101) });
    const edit = editTask(original, existing.id, { title: "x".repeat(101) });
    expect(create.ok).toBe(false);
    expect(edit.ok).toBe(false);
    expect(original[0]).toEqual(existing);
  });
});

describe("task domain operations", () => {
  it("allows duplicate titles, produces unique ids, and inserts newest first", () => {
    const ids = [existing.id, "task-2"];
    const result = createTask([existing], { title: existing.title }, {
      createId: () => ids.shift() ?? "task-4",
      now: () => "2026-02-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((task) => task.id)).toEqual(["task-2", existing.id]);
    expect(result.value[0]?.title).toBe(existing.title);
    expect(result.value[0]?.completed).toBe(false);
  });

  it("preserves edit position, id, completion, and creation date", () => {
    const other = { ...existing, id: "other", title: "Other", completed: false };
    const result = editTask([existing, other], existing.id, { title: "  Changed " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { ...existing, title: "Changed", description: "" },
      other,
    ]);
  });

  it("returns a distinct not-found result when editing an absent task", () => {
    const result = editTask([existing], "deleted-task", { title: "Changed" });
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(editTask([existing], "deleted-task", { title: " " })).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("changes only the selected task's completion status", () => {
    const other = { ...existing, id: "other", completed: false };
    expect(setTaskCompletion([existing, other], existing.id, false)).toEqual([
      { ...existing, completed: false },
      other,
    ]);
  });

  it("filters case-insensitive title and description substrings without mutation", () => {
    const tasks = [
      existing,
      { ...existing, id: "second", title: "Plan", description: "Quarterly review", completed: false },
    ];
    const before = structuredClone(tasks);
    expect(selectTasks(tasks, "KEEP", "completed").map((task) => task.id)).toEqual([existing.id]);
    expect(selectTasks(tasks, "pLaN", "all").map((task) => task.id)).toEqual(["second"]);
    expect(selectTasks(tasks, "QUARTER", "incomplete").map((task) => task.id)).toEqual(["second"]);
    expect(selectTasks(tasks, "missing", "all")).toEqual([]);
    expect(selectTasks(tasks, "", "all")).toHaveLength(2);
    expect(tasks).toEqual(before);
  });
});
