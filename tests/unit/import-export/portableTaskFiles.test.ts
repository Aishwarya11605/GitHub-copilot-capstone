import { describe, expect, it, vi } from "vitest";
import {
  confirmImportReplacement,
  exportTasks,
  previewImportFile,
} from "../../../src/data/portableTaskFiles";
import { TASK_STORAGE_KEY, TaskRepository, type StorageLike } from "../../../src/data/taskRepository";
import type { Task } from "../../../src/domain/task";

const makeTask = (id = "task-1"): Task => ({
  id,
  title: "Read",
  description: "Book",
  completed: false,
  createdAt: "2026-01-01T00:00:00.000Z",
});

function fakeFile(content: string, size = new TextEncoder().encode(content).length): File {
  return {
    size,
    text: vi.fn(async () => content),
  } as unknown as File;
}

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  writes: Array<[string, string]> = [];
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes.push([key, value]); this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

const envelope = (tasks: Task[]) => JSON.stringify({ schemaVersion: 1, tasks });

describe("strict task import/export", () => {
  it("accepts a file exactly 5,000,000 bytes at the size gate", async () => {
    const file = fakeFile(envelope([makeTask()]), 5_000_000);
    expect((await previewImportFile(file)).status).toBe("preview");
    expect(file.text).toHaveBeenCalledTimes(1);
  });

  it("rejects 5,000,001 bytes before reading or previewing", async () => {
    const file = fakeFile(envelope([makeTask()]), 5_000_001);
    const result = await previewImportFile(file);
    expect(result).toMatchObject({ status: "rejected", reason: expect.stringContaining("5,000,000 bytes") });
    expect(file.text).not.toHaveBeenCalled();
  });

  it("accepts 10,000 tasks and rejects 10,001 before preview", async () => {
    const tasks = Array.from({ length: 10_001 }, (_, index) => makeTask(`id-${index}`));
    expect((await previewImportFile(fakeFile(envelope(tasks.slice(0, 10_000))))).status).toBe("preview");
    expect(await previewImportFile(fakeFile(envelope(tasks)))).toMatchObject({
      status: "rejected",
      reason: expect.stringContaining("10,000 tasks"),
    });
  });

  it.each([
    ["malformed JSON", "{"],
    ["unsupported version", JSON.stringify({ schemaVersion: 2, tasks: [makeTask()] })],
    ["extra envelope property", JSON.stringify({ schemaVersion: 1, tasks: [makeTask()], extra: true })],
    ["missing envelope property", JSON.stringify({ schemaVersion: 1 })],
    ["missing task property", JSON.stringify({ schemaVersion: 1, tasks: [{ id: "id" }] })],
    ["extra task property", envelope([{ ...makeTask(), extra: true } as Task])],
    ["duplicate ids", envelope([makeTask("same"), makeTask("same")])],
    ["empty tasks", envelope([])],
    ["invalid title", envelope([{ ...makeTask(), title: "  " }])],
    ["overlong title", envelope([{ ...makeTask(), title: "x".repeat(101) }])],
    ["overlong description", envelope([{ ...makeTask(), description: "x".repeat(501) }])],
    ["invalid completion", envelope([{ ...makeTask(), completed: "false" } as unknown as Task])],
    ["invalid date", envelope([{ ...makeTask(), createdAt: "not-a-date" }])],
    ["non-ISO creation date", envelope([{ ...makeTask(), createdAt: "January 1, 2026" }])],
    ["impossible calendar date", envelope([{ ...makeTask(), createdAt: "2025-02-29T12:00:00Z" }])],
    ["positive offset beyond ISO-8601 limit", envelope([{ ...makeTask(), createdAt: "2026-01-01T00:00:00+14:01" }])],
    ["negative offset beyond ISO-8601 limit", envelope([{ ...makeTask(), createdAt: "2026-01-01T00:00:00-14:01" }])],
    ["positive offset beyond 14 hours", envelope([{ ...makeTask(), createdAt: "2026-01-01T00:00:00+23:59" }])],
    ["negative offset beyond 14 hours", envelope([{ ...makeTask(), createdAt: "2026-01-01T00:00:00-23:59" }])],
    ["blank id", envelope([{ ...makeTask(), id: " " }])],
  ])("rejects %s", async (_label, content) => {
    expect(await previewImportFile(fakeFile(content))).toMatchObject({ status: "rejected" });
  });

  it.each([
    "2024-02-29T23:59:59.123Z",
    "2026-01-01T00:00:00+05:30",
    "2026-01-01T00:00:00+14:00",
    "2026-01-01T00:00:00-14:00",
    "2026-01-01T00:00:00+13:59",
    "2026-01-01T00:00:00-13:59",
  ])("previews valid ISO-8601 creation date %s", async (createdAt) => {
    const result = await previewImportFile(fakeFile(envelope([{ ...makeTask(), createdAt }])));
    expect(result).toMatchObject({
      status: "preview",
      preview: { tasks: [{ createdAt }] },
    });
  });

  it("revalidates at confirmation and performs one whole-list write", async () => {
    const storage = new MemoryStorage();
    const repository = new TaskRepository(storage);
    repository.load();
    const current = makeTask("old");
    expect(repository.save([current]).status).toBe("saved");
    storage.writes = [];
    const importResult = await previewImportFile(fakeFile(envelope([makeTask("new")])));
    expect(importResult.status).toBe("preview");
    if (importResult.status !== "preview") return;

    expect(storage.writes).toHaveLength(0);
    expect(confirmImportReplacement(repository, importResult.preview)).toEqual({ status: "saved" });
    expect(storage.writes).toHaveLength(1);
    expect(storage.writes[0]?.[0]).toBe(TASK_STORAGE_KEY);
    expect(JSON.parse(storage.writes[0]?.[1] ?? "{}")).toEqual({
      schemaVersion: 1,
      tasks: [makeTask("new")],
    });
  });

  it("rejects a changed invalid preview and preserves saved bytes", async () => {
    const storage = new MemoryStorage();
    const repository = new TaskRepository(storage);
    const oldData = envelope([makeTask("old")]);
    storage.data.set(TASK_STORAGE_KEY, oldData);
    const result = await previewImportFile(fakeFile(envelope([makeTask("new")])));
    if (result.status !== "preview") throw new Error("Expected a preview");
    const changedPreview = { ...result.preview, tasks: [{ ...makeTask("new"), title: "" }] };
    expect(confirmImportReplacement(repository, changedPreview).status).toBe("not-saved");
    expect(storage.data.get(TASK_STORAGE_KEY)).toBe(oldData);
    expect(storage.writes).toHaveLength(0);
  });

  it("exports all task fields without modifying the task collection", () => {
    const tasks = [makeTask()];
    const before = structuredClone(tasks);
    const result = exportTasks(tasks);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.json)).toEqual({ schemaVersion: 1, tasks });
    expect(tasks).toEqual(before);
  });

  it("does not report a failed import as success or overwrite prior data", async () => {
    const storage = new MemoryStorage();
    const oldData = envelope([makeTask("old")]);
    storage.data.set(TASK_STORAGE_KEY, oldData);
    const repository = new TaskRepository(storage);
    storage.setItem = vi.fn(() => { throw new Error("write blocked"); });
    const result = await previewImportFile(fakeFile(envelope([makeTask("new")])));
    if (result.status !== "preview") throw new Error("Expected a preview");
    expect(confirmImportReplacement(repository, result.preview).status).toBe("not-saved");
    expect(storage.data.get(TASK_STORAGE_KEY)).toBe(oldData);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });
});
