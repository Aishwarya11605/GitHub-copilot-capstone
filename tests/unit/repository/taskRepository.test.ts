import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isTaskStorageEvent,
  TASK_STORAGE_KEY,
  TaskRepository,
  type StorageLike,
} from "../../../src/data/taskRepository";
import type { Task } from "../../../src/domain/task";

const task: Task = {
  id: "task-1",
  title: "Read",
  description: "",
  completed: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem = vi.fn((key: string) => this.data.get(key) ?? null);
  setItem = vi.fn((key: string, value: string) => { this.data.set(key, value); });
  removeItem = vi.fn((key: string) => { this.data.delete(key); });
  clear = vi.fn(() => { this.data.clear(); });
}

describe("TaskRepository", () => {
  let storage: MemoryStorage;
  let repository: TaskRepository;

  beforeEach(() => {
    storage = new MemoryStorage();
    repository = new TaskRepository(storage);
  });

  it("distinguishes an absent key from valid stored data", () => {
    expect(repository.load()).toEqual({ status: "ready", tasks: [], source: "absent" });
    storage.data.set(TASK_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks: [task] }));
    expect(repository.load()).toEqual({ status: "ready", tasks: [task], source: "stored" });
    expect(storage.getItem).toHaveBeenCalledWith(TASK_STORAGE_KEY);
  });

  it.each([
    ["malformed JSON", "{"],
    ["wrong schema", JSON.stringify({ schemaVersion: 2, tasks: [] })],
    ["extra fields", JSON.stringify({ schemaVersion: 1, tasks: [], backup: [] })],
    ["missing fields", JSON.stringify({ schemaVersion: 1 })],
    ["invalid task", JSON.stringify({ schemaVersion: 1, tasks: [{ ...task, title: " " }] })],
    ["non-ISO creation date", JSON.stringify({ schemaVersion: 1, tasks: [{ ...task, createdAt: "January 1, 2026" }] })],
    ["impossible calendar date", JSON.stringify({ schemaVersion: 1, tasks: [{ ...task, createdAt: "2025-02-29T12:00:00Z" }] })],
    ["positive offset beyond ISO-8601 limit", JSON.stringify({ schemaVersion: 1, tasks: [{ ...task, createdAt: "2026-01-01T00:00:00+14:01" }] })],
    ["negative offset beyond ISO-8601 limit", JSON.stringify({ schemaVersion: 1, tasks: [{ ...task, createdAt: "2026-01-01T00:00:00-14:01" }] })],
    ["positive offset beyond 14 hours", JSON.stringify({ schemaVersion: 1, tasks: [{ ...task, createdAt: "2026-01-01T00:00:00+23:59" }] })],
    ["negative offset beyond 14 hours", JSON.stringify({ schemaVersion: 1, tasks: [{ ...task, createdAt: "2026-01-01T00:00:00-23:59" }] })],
  ])("preserves invalid %s without writing", (_name, raw) => {
    storage.data.set(TASK_STORAGE_KEY, raw);
    expect(repository.load()).toMatchObject({ status: "invalid", raw });
    expect(storage.data.get(TASK_STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    "2024-02-29T23:59:59.123Z",
    "2026-01-01T00:00:00+05:30",
    "2026-01-01T00:00:00+14:00",
    "2026-01-01T00:00:00-14:00",
    "2026-01-01T00:00:00+13:59",
    "2026-01-01T00:00:00-13:59",
  ])("loads valid ISO-8601 creation date %s", (createdAt) => {
    storage.data.set(TASK_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      tasks: [{ ...task, createdAt }],
    }));
    expect(repository.load()).toMatchObject({
      status: "ready",
      tasks: [{ createdAt }],
    });
  });

  it("reports access errors as unavailable instead of empty", () => {
    storage.getItem.mockImplementation(() => { throw new Error("blocked"); });
    expect(repository.load()).toMatchObject({ status: "unavailable" });
  });

  it("writes a validated document once to the sole task-data key", () => {
    repository.load();
    expect(repository.save([task])).toEqual({ status: "saved" });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      TASK_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, tasks: [task] }),
    );
  });

  it("maps failed writes and invalid candidates to truthful not-saved outcomes", () => {
    repository.load();
    storage.setItem.mockImplementation(() => { throw new Error("quota"); });
    expect(repository.save([task])).toMatchObject({ status: "not-saved" });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(repository.save([{ ...task, title: "" }])).toMatchObject({ status: "not-saved" });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("maps serialization errors to not-saved without attempting a write", () => {
    repository.load();
    const stringify = vi.spyOn(JSON, "stringify").mockImplementationOnce(() => {
      throw new Error("serialization failed");
    });
    expect(repository.save([task])).toMatchObject({ status: "not-saved", reason: "Task data could not be serialized." });
    expect(storage.setItem).not.toHaveBeenCalled();
    stringify.mockRestore();
  });

  it("blocks writes after stale detection until an explicit valid reload", () => {
    repository.load();
    repository.markStale();
    expect(repository.save([task])).toMatchObject({ status: "stale" });
    expect(storage.setItem).not.toHaveBeenCalled();
    storage.data.set(TASK_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks: [task] }));
    expect(repository.reload()).toMatchObject({ status: "ready", tasks: [task] });
    expect(repository.isStale()).toBe(false);
    expect(repository.save([task])).toEqual({ status: "saved" });
  });

  it("remains stale after an invalid reload", () => {
    repository.markStale();
    storage.data.set(TASK_STORAGE_KEY, "{invalid");
    expect(repository.reload()).toMatchObject({ status: "invalid" });
    expect(repository.isStale()).toBe(true);
    expect(repository.save([task]).status).toBe("stale");
  });

  it("does not overwrite corrupt data through an ordinary mutation", () => {
    const raw = "{corrupt";
    storage.data.set(TASK_STORAGE_KEY, raw);
    expect(repository.load().status).toBe("invalid");
    expect(repository.save([task]).status).toBe("not-saved");
    expect(storage.data.get(TASK_STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("accepts task-key update/removal/clear notifications only for the same storage area", () => {
    expect(isTaskStorageEvent({ key: TASK_STORAGE_KEY, storageArea: storage as unknown as Storage }, storage)).toBe(true);
    expect(isTaskStorageEvent({ key: null, storageArea: storage as unknown as Storage }, storage)).toBe(true);
    expect(isTaskStorageEvent({ key: "other", storageArea: storage as unknown as Storage }, storage)).toBe(false);
    const otherStorage = new MemoryStorage();
    expect(isTaskStorageEvent({ key: TASK_STORAGE_KEY, storageArea: otherStorage as unknown as Storage }, storage)).toBe(false);
  });
});
