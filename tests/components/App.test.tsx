import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { TASK_STORAGE_KEY } from "../../src/data/taskRepository";

const importedTask = {
  id: "imported-1",
  title: "Imported task",
  description: "From file",
  completed: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function makeImportFile(task = importedTask): File {
  const contents = JSON.stringify({ schemaVersion: 1, tasks: [task] });
  const file = new File([contents], "tasks.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => contents });
  return file;
}

function makeDelayedImportFile(task: typeof importedTask, name: string) {
  const contents = JSON.stringify({ schemaVersion: 1, tasks: [task] });
  let resolveText!: (value: string) => void;
  const textPromise = new Promise<string>((resolve) => {
    resolveText = resolve;
  });
  const file = new File([contents], name, { type: "application/json" });
  Object.defineProperty(file, "text", { value: vi.fn(() => textPromise) });
  return { file, resolveText: () => resolveText(contents) };
}

describe("task manager workflows", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates, edits, searches, completes, and persists a task", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");

    await user.type(screen.getByLabelText("Title"), "  Draft plan  ");
    await user.type(screen.getByLabelText("Description (optional)"), "Project notes");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("heading", { name: "Draft plan" })).toBeVisible();

    const stored = JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) ?? "{}");
    expect(stored.tasks[0]).toMatchObject({
      title: "Draft plan",
      description: "Project notes",
      completed: false,
    });

    await user.click(screen.getByRole("button", { name: "Edit Draft plan" }));
    await user.click(screen.getByRole("button", { name: "Cancel edit" }));
    expect(screen.getByRole("heading", { name: "Draft plan" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Edit Draft plan" }));
    const titleInput = screen.getByLabelText("Title");
    await user.clear(titleInput);
    await user.type(titleInput, "Updated plan");
    await user.click(screen.getByRole("button", { name: "Save task" }));
    expect(await screen.findByRole("heading", { name: "Updated plan" })).toBeVisible();

    await user.type(screen.getByLabelText("Search tasks"), "NOTES");
    expect(screen.getByRole("heading", { name: "Updated plan" })).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Show tasks"), "completed");
    expect(screen.getByText("No tasks match your search or selected filter.")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Show tasks"), "all");
    await user.clear(screen.getByLabelText("Search tasks"));

    const completion = screen.getByRole("checkbox", { name: "Mark Updated plan complete" });
    await user.click(completion);
    expect(screen.getByRole("checkbox", { name: "Mark Updated plan incomplete" })).toBeChecked();
    expect(JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) ?? "{}").tasks[0].completed).toBe(true);
  });

  it("discloses the exact import limits and user-managed storage constraints", async () => {
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");
    expect(screen.getByText(/up to exactly 5,000,000 bytes \(decimal\)/)).toBeVisible();
    expect(screen.getByText(/no more than 10,000 tasks/)).toBeVisible();
    expect(screen.getByText(/not automatically stored, synced, or encrypted/)).toBeVisible();
    expect(screen.getByText(/not retried automatically/)).toBeVisible();
    expect(screen.getByText(/not compare-and-swap/)).toBeVisible();
  });

  it("uses a separate delete dialog, Escape cancels without a write, and confirm focuses the list heading", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");
    await user.type(screen.getByLabelText("Title"), "Remove me");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await screen.findByRole("heading", { name: "Remove me" });

    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const deleteButton = screen.getByRole("button", { name: "Delete Remove me" });
    await user.click(deleteButton);
    const dialog = screen.getByRole("dialog", { name: "Delete task?" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    const cancelEvent = new Event("cancel", { bubbles: false, cancelable: true });
    fireEvent(dialog, cancelEvent);
    await waitFor(() => expect(deleteButton).toHaveFocus());
    expect(setItem).not.toHaveBeenCalled();

    await user.click(deleteButton);
    await user.click(within(screen.getByRole("dialog", { name: "Delete task?" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Your tasks" })).toHaveFocus());
    expect(screen.getByText("No tasks yet. Add a task to get started.")).toBeVisible();
    setItem.mockRestore();
  });

  it("does not overwrite invalid saved data during ordinary edits and offers explicit import replacement", async () => {
    const raw = "{invalid json";
    window.localStorage.setItem(TASK_STORAGE_KEY, raw);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/Saved task data is not valid JSON/);

    await user.type(screen.getByLabelText("Title"), "Unsaved attempt");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(window.localStorage.getItem(TASK_STORAGE_KEY)).toBe(raw);
    expect(screen.getByText(/Visible task changes are not saved/)).toBeVisible();

    await user.upload(screen.getByLabelText("Import a task JSON file"), makeImportFile());
    const dialog = await screen.findByRole("dialog", { name: "Replace task list?" });
    expect(within(dialog).getByText(/entire current task list/)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Replace" }));
    expect(await screen.findByRole("heading", { name: "Imported task" })).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) ?? "{}").tasks).toEqual([importedTask]);
  });

  it("cancels import without writing and returns focus to the file picker", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");
    const importInput = screen.getByLabelText("Import a task JSON file");
    await user.upload(importInput, makeImportFile());
    const dialog = await screen.findByRole("dialog", { name: "Replace task list?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(importInput).toHaveFocus());
    expect(window.localStorage.getItem(TASK_STORAGE_KEY)).toBeNull();
  });

  it("keeps the preview tied to the latest file when reads resolve out of order", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");
    const firstTask = { ...importedTask, id: "first-file", title: "First file task" };
    const latestTask = { ...importedTask, id: "latest-file", title: "Latest file task" };
    const first = makeDelayedImportFile(firstTask, "first.json");
    const latest = makeDelayedImportFile(latestTask, "latest.json");
    const importInput = screen.getByLabelText("Import a task JSON file");

    await user.upload(importInput, first.file);
    await waitFor(() => expect(first.file.text).toHaveBeenCalledTimes(1));
    await user.upload(importInput, latest.file);
    await waitFor(() => expect(latest.file.text).toHaveBeenCalledTimes(1));

    latest.resolveText();
    const dialog = await screen.findByRole("dialog", { name: "Replace task list?" });
    expect(within(dialog).getByText(/Selected file: latest\.json/)).toBeVisible();
    expect(within(dialog).getByText("Latest file task")).toBeVisible();
    first.resolveText();
    await waitFor(() => expect(within(dialog).getByText("Latest file task")).toBeVisible());
    expect(within(dialog).queryByText("First file task")).not.toBeInTheDocument();

    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await user.click(within(dialog).getByRole("button", { name: "Replace" }));
    expect(await screen.findByRole("heading", { name: "Latest file task" })).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) ?? "{}").tasks).toEqual([latestTask]);
    expect(setItem).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it("treats Escape in the import dialog as Cancel without writing", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");
    const importInput = screen.getByLabelText("Import a task JSON file");
    await user.upload(importInput, makeImportFile());
    const dialog = await screen.findByRole("dialog", { name: "Replace task list?" });
    const escapeCancel = new Event("cancel", { bubbles: false, cancelable: true });
    fireEvent(dialog, escapeCancel);
    await waitFor(() => expect(importInput).toHaveFocus());
    expect(window.localStorage.getItem(TASK_STORAGE_KEY)).toBeNull();
  });

  it("preserves current storage on failed replacement and lets the user reselect a file", async () => {
    const currentTask = { ...importedTask, id: "old", title: "Current saved task" };
    const currentJson = JSON.stringify({ schemaVersion: 1, tasks: [currentTask] });
    window.localStorage.setItem(TASK_STORAGE_KEY, currentJson);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Current saved task" });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const importInput = screen.getByLabelText("Import a task JSON file");
    await user.upload(importInput, makeImportFile());
    const dialog = await screen.findByRole("dialog", { name: "Replace task list?" });
    await user.click(within(dialog).getByRole("button", { name: "Replace" }));
    expect(await within(dialog).findByText(/Replacement did not complete/)).toBeVisible();
    expect(window.localStorage.getItem(TASK_STORAGE_KEY)).toBe(currentJson);
    expect(setItem).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(importInput).toHaveFocus());
    const replacementTask = { ...importedTask, id: "replacement", title: "Reselected task" };
    await user.upload(importInput, makeImportFile(replacementTask));
    const secondDialog = await screen.findByRole("dialog", { name: "Replace task list?" });
    await user.click(within(secondDialog).getByRole("button", { name: "Replace" }));
    expect(await screen.findByRole("heading", { name: "Reselected task" })).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) ?? "{}").tasks).toEqual([replacementTask]);
    expect(setItem).toHaveBeenCalledTimes(2);
    setItem.mockRestore();
  });

  it("retries a failed import only after the user activates Retry", async () => {
    const currentTask = { ...importedTask, id: "old", title: "Old list" };
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks: [currentTask] }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Old list" });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    await user.upload(screen.getByLabelText("Import a task JSON file"), makeImportFile());
    const dialog = await screen.findByRole("dialog", { name: "Replace task list?" });
    await user.click(within(dialog).getByRole("button", { name: "Replace" }));
    await within(dialog).findByText(/Replacement did not complete/);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(TASK_STORAGE_KEY)).toContain("Old list");

    await user.click(within(dialog).getByRole("button", { name: "Retry replacement" }));
    expect(await screen.findByRole("heading", { name: "Imported task" })).toBeVisible();
    expect(setItem).toHaveBeenCalledTimes(2);
    setItem.mockRestore();
  });

  it("marks visible create failure unsaved and does not retry automatically", async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");
    await user.type(screen.getByLabelText("Title"), "Not persisted");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByText("Not persisted")).toBeVisible();
    expect(screen.getByText(/Visible task changes are not saved/)).toBeVisible();
    expect(screen.getByText(/Not saved/)).toBeVisible();
    expect(setItem).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it("blocks app writes after a task storage event and retains the stale view", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");
    await user.type(screen.getByLabelText("Title"), "Current task");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    fireEvent(
      window,
      new StorageEvent("storage", {
        key: TASK_STORAGE_KEY,
        oldValue: null,
        newValue: JSON.stringify({ schemaVersion: 1, tasks: [] }),
        storageArea: window.localStorage,
      }),
    );
    expect(await screen.findByText(/Another tab changed task data/)).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Mark Current task complete" }));
    expect(screen.getByRole("checkbox", { name: "Mark Current task complete" })).not.toBeChecked();
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reload current saved tasks" })).toBeVisible();
    setItem.mockRestore();
  });

  it("refreshes an active edit from reloaded data so a stale draft cannot overwrite it", async () => {
    const original = { ...importedTask, id: "reload-edit", title: "Saved before reload", description: "Old description" };
    const latest = { ...original, title: "Saved in another tab", description: "New description" };
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks: [original] }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: original.title });

    await user.click(screen.getByRole("button", { name: `Edit ${original.title}` }));
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Stale draft title");
    await user.clear(screen.getByLabelText("Description (optional)"));
    await user.type(screen.getByLabelText("Description (optional)"), "Stale draft description");

    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks: [latest] }));
    fireEvent(
      window,
      new StorageEvent("storage", {
        key: TASK_STORAGE_KEY,
        oldValue: JSON.stringify({ schemaVersion: 1, tasks: [original] }),
        newValue: JSON.stringify({ schemaVersion: 1, tasks: [latest] }),
        storageArea: window.localStorage,
      }),
    );
    expect(await screen.findByText(/Another tab changed task data/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reload current saved tasks" }));

    expect(screen.getByLabelText("Title")).toHaveValue(latest.title);
    expect(screen.getByLabelText("Description (optional)")).toHaveValue(latest.description);
    await user.click(screen.getByRole("button", { name: "Save task" }));

    expect(await screen.findByRole("heading", { name: latest.title })).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) ?? "{}").tasks).toEqual([latest]);
    expect(screen.queryByText("Stale draft title")).not.toBeInTheDocument();
  });

  it("closes an active edit after reload when its target no longer exists", async () => {
    const original = { ...importedTask, id: "removed-on-reload", title: "Edit target" };
    const remaining = { ...importedTask, id: "remaining-task", title: "Remaining task" };
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks: [original] }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: original.title });

    await user.click(screen.getByRole("button", { name: `Edit ${original.title}` }));
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Stale draft title");

    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks: [remaining] }));
    fireEvent(
      window,
      new StorageEvent("storage", {
        key: TASK_STORAGE_KEY,
        oldValue: JSON.stringify({ schemaVersion: 1, tasks: [original] }),
        newValue: JSON.stringify({ schemaVersion: 1, tasks: [remaining] }),
        storageArea: window.localStorage,
      }),
    );
    expect(await screen.findByText(/Another tab changed task data/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reload current saved tasks" }));

    expect(await screen.findByText("The edited task is no longer in saved tasks. The edit form was closed.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save task" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: remaining.title })).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) ?? "{}").tasks).toEqual([remaining]);
  });

  it("keeps a task represented and returns focus when deletion persistence fails", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");
    await user.type(screen.getByLabelText("Title"), "Keep me");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    const deleteButton = screen.getByRole("button", { name: "Delete Keep me" });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    await user.click(deleteButton);
    await user.click(within(screen.getByRole("dialog", { name: "Delete task?" })).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("heading", { name: "Keep me" })).toBeVisible();
    expect(screen.getByText(/Task was not deleted/)).toBeVisible();
    await waitFor(() => expect(deleteButton).toHaveFocus());
    expect(setItem).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it("deletes only the selected task from a multi-task list", async () => {
    const first = { ...importedTask, id: "first", title: "First" };
    const second = { ...importedTask, id: "second", title: "Second" };
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks: [first, second] }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "First" });
    await user.click(screen.getByRole("button", { name: "Delete First" }));
    await user.click(within(screen.getByRole("dialog", { name: "Delete task?" })).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("heading", { name: "Second" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "First" })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) ?? "{}").tasks).toEqual([second]);
  });

  it("preserves an edit draft when an unrelated task is deleted", async () => {
    const editingTask = { ...importedTask, id: "editing-task", title: "Saved title", description: "Saved description" };
    const otherTask = { ...importedTask, id: "other-task", title: "Other task" };
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      tasks: [editingTask, otherTask],
    }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: editingTask.title });

    await user.click(screen.getByRole("button", { name: `Edit ${editingTask.title}` }));
    const titleInput = screen.getByLabelText("Title");
    const descriptionInput = screen.getByLabelText("Description (optional)");
    await user.clear(titleInput);
    await user.type(titleInput, "Unsaved draft title");
    await user.clear(descriptionInput);
    await user.type(descriptionInput, "Unsaved draft description");

    await user.click(screen.getByRole("button", { name: `Delete ${otherTask.title}` }));
    await user.click(within(screen.getByRole("dialog", { name: "Delete task?" })).getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("heading", { name: "Edit task" })).toBeVisible();
    expect(titleInput).toHaveValue("Unsaved draft title");
    expect(descriptionInput).toHaveValue("Unsaved draft description");
    expect(JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) ?? "{}").tasks).toEqual([editingTask]);
  });

  it("closes an edit form when its task is deleted in this tab without a stale save", async () => {
    const original = { ...importedTask, id: "same-tab-task", title: "Delete while editing" };
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks: [original] }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: original.title });
    await user.click(screen.getByRole("button", { name: `Edit ${original.title}` }));
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Stale edit");

    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await user.click(screen.getByRole("button", { name: `Delete ${original.title}` }));
    await user.click(within(screen.getByRole("dialog", { name: "Delete task?" })).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Task deleted. Its edit form was closed.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save task" })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) ?? "{}").tasks).toEqual([]);
    expect(setItem).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it("closes an edit form after imported replacement removes its task without a stale save", async () => {
    const original = { ...importedTask, id: "replaced-task", title: "Edit before import" };
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks: [original] }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: original.title });
    await user.click(screen.getByRole("button", { name: `Edit ${original.title}` }));
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Stale edit");

    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await user.upload(screen.getByLabelText("Import a task JSON file"), makeImportFile());
    const dialog = await screen.findByRole("dialog", { name: "Replace task list?" });
    await user.click(within(dialog).getByRole("button", { name: "Replace" }));

    expect(await screen.findByRole("heading", { name: "Imported task" })).toBeVisible();
    expect(screen.getByText(/Task list replaced from the selected file\. The edit form was closed/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save task" })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) ?? "{}").tasks).toEqual([importedTask]);
    expect(setItem).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it("shows accessible field errors and performs no write for invalid input", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await user.type(screen.getByLabelText("Title"), "   ");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(screen.getByText(/at least one non-whitespace character/)).toBeVisible();
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
