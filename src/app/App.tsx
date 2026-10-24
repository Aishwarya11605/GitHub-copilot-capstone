import { useEffect, useMemo, useRef, useState } from "react";
import { DeleteConfirmation } from "../components/DeleteConfirmation";
import { ImportReplaceDialog } from "../components/ImportReplaceDialog";
import { SearchAndFilter } from "../components/SearchAndFilter";
import { TaskForm } from "../components/TaskForm";
import { TaskList } from "../components/TaskList";
import {
  confirmImportReplacement,
  exportTasks,
  previewImportFile,
  type ImportPreview,
} from "../data/portableTaskFiles";
import {
  isTaskStorageEvent,
  TaskRepository,
  type LoadResult,
} from "../data/taskRepository";
import {
  createTask,
  deleteTask,
  editTask,
  selectTasks,
  setTaskCompletion,
} from "../domain/taskService";
import type { Task, TaskInput } from "../domain/task";

type StartupState = "loading" | "ready" | "invalid" | "unavailable";
type PendingFocus = { kind: "task"; id: string } | { kind: "list" } | null;

export function App() {
  const [repository, setRepository] = useState<TaskRepository | null>(null);
  const [storage, setStorage] = useState<Storage | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [startupState, setStartupState] = useState<StartupState>("loading");
  const [storageIssue, setStorageIssue] = useState("");
  const [stale, setStale] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [formTask, setFormTask] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "completed" | "incomplete">("all");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState("");
  const [importGuidance, setImportGuidance] = useState("");
  const [pendingFocus, setPendingFocus] = useState<PendingFocus>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const importRequestIdRef = useRef(0);

  useEffect(() => {
    try {
      const browserStorage = window.localStorage;
      const taskRepository = new TaskRepository(browserStorage);
      const result = taskRepository.load();
      setStorage(browserStorage);
      setRepository(taskRepository);
      applyLoadedResult(result);
    } catch {
      setStartupState("unavailable");
      setStorageIssue("Browser storage is unavailable. Task changes cannot be saved.");
    }
  }, []);

  function applyLoadedResult(result: LoadResult) {
    if (result.status === "ready") {
      const loadedEditTask = formTask === null
        ? undefined
        : result.tasks.find((task) => task.id === formTask.id);
      const editedTaskRemoved = formTask !== null && loadedEditTask === undefined;
      setTasks(result.tasks);
      if (formTask !== null) setFormTask(loadedEditTask ?? null);
      setStartupState("ready");
      setStorageIssue("");
      setStale(false);
      setUnsaved(false);
      setStatusMessage(editedTaskRemoved
        ? "The edited task is no longer in saved tasks. The edit form was closed."
        : "Current saved tasks loaded.");
      return;
    }
    if (result.status === "invalid") {
      setStartupState("invalid");
      setStorageIssue(`${result.reason} The original saved value has not been changed. You can import a valid task file and confirm replacing it.`);
      return;
    }
    setStartupState("unavailable");
    setStorageIssue(`${result.reason} Task data was not treated as an empty saved list.`);
  }

  useEffect(() => {
    if (!storage || !repository) return;
    const onStorage = (event: StorageEvent) => {
      if (!isTaskStorageEvent(event, storage)) return;
      repository.markStale();
      setStale(true);
      setStatusMessage("Task data changed in another tab. Changes from this tab are blocked until you reload.");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [repository, storage]);

  useEffect(() => {
    if (!pendingFocus) return;
    window.requestAnimationFrame(() => {
      if (pendingFocus.kind === "list") {
        document.getElementById("task-list-heading")?.focus();
      } else {
        const heading = Array.from(document.querySelectorAll<HTMLElement>("[data-task-heading]"))
          .find((element) => element.dataset.taskId === pendingFocus.id);
        (heading ?? document.getElementById("task-list-heading"))?.focus();
      }
      setPendingFocus(null);
    });
  }, [pendingFocus, tasks]);

  const visibleTasks = useMemo(
    () => selectTasks(tasks, query, filter),
    [tasks, query, filter],
  );

  function persistVisibleChange(candidate: Task[], successText: string, failureText: string) {
    if (stale || repository?.isStale()) {
      setStatusMessage("Task data is stale. Reload current saved data before making changes.");
      return false;
    }
    const result = repository?.save(candidate);
    if (result?.status === "saved") {
      setTasks(candidate);
      setUnsaved(false);
      setStartupState("ready");
      setStorageIssue("");
      setStatusMessage(successText);
      return true;
    }
    if (result?.status === "stale") {
      setStale(true);
      setStatusMessage(result.reason);
      return false;
    }
    setTasks(candidate);
    setUnsaved(true);
    setStatusMessage(`${failureText} Not saved${result?.reason ? `: ${result.reason}` : ": browser storage is unavailable."}`);
    return false;
  }

  function submitTask(input: TaskInput) {
    if (formTask) {
      const result = editTask(tasks, formTask.id, input);
      if (!result.ok) {
        if ("reason" in result && result.reason === "not-found") {
          setFormTask(null);
          setStatusMessage("The task no longer exists. The edit was not saved.");
        } else {
          setStatusMessage("Correct the task form errors before saving.");
        }
        return;
      }
      persistVisibleChange(result.value, "Task saved.", "Your edited task is visible but could not be saved.");
      setFormTask(null);
      return;
    }
    const result = createTask(tasks, input);
    if (!result.ok) {
      setStatusMessage("Correct the task form errors before adding it.");
      return;
    }
    persistVisibleChange(result.value, "Task added.", "Your new task is visible but could not be saved.");
  }

  function toggleTask(task: Task) {
    persistVisibleChange(
      setTaskCompletion(tasks, task.id, !task.completed),
      "Task status saved.",
      "The visible status change could not be saved.",
    );
  }

  function openDelete(task: Task, trigger: HTMLButtonElement) {
    deleteTriggerRef.current = trigger;
    setDeleteTarget(task);
  }

  function returnFocusToDeleteTrigger() {
    setDeleteTarget(null);
    window.requestAnimationFrame(() => deleteTriggerRef.current?.focus());
  }

  function confirmDelete() {
    if (!deleteTarget || !repository) {
      setStatusMessage("The task could not be deleted because browser storage is unavailable.");
      returnFocusToDeleteTrigger();
      return;
    }
    const index = visibleTasks.findIndex((task) => task.id === deleteTarget.id);
    const nextVisible = index >= 0 ? visibleTasks[index + 1] : undefined;
    const result = repository.save(deleteTask(tasks, deleteTarget.id));
    if (result.status === "saved") {
      const nextTasks = deleteTask(tasks, deleteTarget.id);
      setTasks(nextTasks);
      setUnsaved(false);
      if (formTask?.id === deleteTarget.id) {
        setFormTask(null);
        setStatusMessage("Task deleted. Its edit form was closed.");
      } else {
        setStatusMessage("Task deleted.");
      }
      setDeleteTarget(null);
      setPendingFocus(nextVisible ? { kind: "task", id: nextVisible.id } : { kind: "list" });
      return;
    }
    if (result.status === "stale") {
      setStale(true);
      setStatusMessage(result.reason);
    } else {
      setStatusMessage(`Task was not deleted. ${result.reason}`);
    }
    returnFocusToDeleteTrigger();
  }

  function reloadSavedTasks() {
    if (!repository) {
      setStorageIssue("Browser storage is unavailable. Reload is not possible.");
      return;
    }
    const result = repository.reload();
    if (result.status === "ready") {
      applyLoadedResult(result);
      return;
    }
    if (result.status === "invalid") {
      setStartupState("invalid");
      setStorageIssue(`${result.reason} Current saved data remains invalid; no tasks were loaded.`);
      setStatusMessage("Reload did not replace the current view because saved data is invalid.");
      return;
    }
    setStartupState("unavailable");
    setStorageIssue(result.reason);
    setStatusMessage("Reload could not read browser storage.");
  }

  async function chooseImportFile(file: File | null) {
    const requestId = ++importRequestIdRef.current;
    setImportFile(file);
    setImportPreview(null);
    setImportError("");
    setImportGuidance("");
    setStatusMessage("");
    if (!file) return;
    const result = await previewImportFile(file);
    if (requestId !== importRequestIdRef.current) return;
    if (result.status === "preview") {
      setImportPreview(result.preview);
      return;
    }
    setImportError(result.reason);
    setImportGuidance(result.guidance);
    setStatusMessage(`Import rejected. ${result.reason}`);
  }

  async function retryImportRead() {
    if (importFile) await chooseImportFile(importFile);
  }

  function cancelImport() {
    importRequestIdRef.current += 1;
    setImportPreview(null);
    setImportError("");
    setImportGuidance("");
    window.requestAnimationFrame(() => importInputRef.current?.focus());
  }

  function replaceTasksFromImport() {
    if (!repository || !importPreview) {
      setImportError("Browser storage is unavailable; the task list was not replaced.");
      setImportGuidance("Check browser storage and choose whether to try again.");
      return;
    }
    const result = confirmImportReplacement(repository, importPreview);
    if (result.status === "saved") {
      const editFormWasOpen = formTask !== null;
      setTasks(importPreview.tasks.map((task) => ({ ...task })));
      setFormTask(null);
      setUnsaved(false);
      setStale(false);
      setStartupState("ready");
      setStorageIssue("");
      setImportPreview(null);
      setImportError("");
      setImportGuidance("");
      setStatusMessage(editFormWasOpen
        ? "Task list replaced from the selected file. The edit form was closed because the list was replaced."
        : "Task list replaced from the selected file.");
      window.requestAnimationFrame(() => importInputRef.current?.focus());
      return;
    }
    if (result.status === "stale") setStale(true);
    setImportError(`Replacement did not complete. ${result.reason}`);
    setImportGuidance("Your current saved task data was not reported as replaced. You may retry, choose another file, or cancel.");
  }

  function downloadExport() {
    const result = exportTasks(tasks);
    if (!result.ok) {
      setStatusMessage(`Export could not be prepared: ${result.reason}`);
      return;
    }
    const blob = new Blob([result.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tasks.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatusMessage(unsaved
      ? "Export download was initiated. It includes visible changes that are not saved in browser storage."
      : "Export download was initiated. Downloading does not confirm that you retained the file.");
  }

  function startEdit(task: Task) {
    setFormTask(task);
    setStatusMessage("");
  }

  return (
    <main className="app-shell">
      <header className="page-header">
        <p className="eyebrow">Personal task list</p>
        <h1>Task list</h1>
        <p>Manage tasks in this browser.</p>
      </header>

      <section className="storage-disclosure" aria-label="Storage and backup information">
        <h2>Where your tasks are stored</h2>
        <p>
          Tasks are kept in this browser’s local storage and may become unavailable if that storage is cleared or cannot be accessed.
          Exported JSON is a manual, user-managed plaintext file: you must download and retain it. It is not automatically stored,
          synced, or encrypted, and a download starting does not confirm that you kept a copy.
        </p>
        <p>
          A detected task-data change in another tab blocks writes until you reload. Storage events are notifications, not locks:
          this is not compare-and-swap and cannot protect against changes that have not yet been detected.
        </p>
      </section>

      {storageIssue && (
        <div className="error-panel" role="alert">
          <p>{storageIssue}</p>
        </div>
      )}
      {stale && (
        <div className="stale-panel" role="alert">
          <p>
            Another tab changed task data. Writes from this stale view are blocked after the change is detected.
            This event-based notice is not compare-and-swap and cannot protect against a change that has not yet been detected.
          </p>
          <button type="button" onClick={reloadSavedTasks}>Reload current saved tasks</button>
        </div>
      )}

      <section className="file-tools" aria-labelledby="file-tools-heading">
        <h2 id="file-tools-heading">Import and export</h2>
        <div className="file-tools-row">
          <div className="field import-picker">
            <label htmlFor="import-file">Import a task JSON file</label>
            <input
              ref={importInputRef}
              id="import-file"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                void chooseImportFile(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
          <button className="secondary" type="button" onClick={downloadExport}>Export JSON</button>
        </div>
        <p className="help-text">
          Imports accept this app’s strict versioned JSON format, no more than 10,000 tasks, and files up to exactly 5,000,000 bytes (decimal).
          A valid import replaces the whole list only after confirmation. Failed operations are not retried automatically; retry requires an explicit action.
        </p>
        {importError && !importPreview && (
          <div className="error-panel" role="alert">
            <p>{importError}</p>
            {importGuidance && <p>{importGuidance}</p>}
            <div className="button-row">
              {importFile && <button className="secondary" type="button" onClick={() => void retryImportRead()}>Retry file read</button>}
              <button className="secondary" type="button" onClick={cancelImport}>Cancel import</button>
            </div>
          </div>
        )}
      </section>

      {startupState === "loading" ? (
        <p role="status">Loading saved tasks…</p>
      ) : (
        <>
          <div className="workspace">
            <TaskForm
              key={formTask
                ? JSON.stringify([formTask.id, formTask.title, formTask.description])
                : "new-task"}
              task={formTask ?? undefined}
              onSubmit={submitTask}
              onCancel={formTask ? () => setFormTask(null) : undefined}
            />
            <SearchAndFilter
              query={query}
              filter={filter}
              onQueryChange={setQuery}
              onFilterChange={setFilter}
            />
          </div>
          {unsaved && <p className="unsaved-notice" role="status">Visible task changes are not saved in browser storage.</p>}
          <p className="status-message" role="status" aria-live="polite">{statusMessage}</p>
          <TaskList
            tasks={visibleTasks}
            emptyMessage={tasks.length === 0
              ? "No tasks yet. Add a task to get started."
              : "No tasks match your search or selected filter."}
            onToggle={toggleTask}
            onEdit={startEdit}
            onDelete={openDelete}
          />
        </>
      )}

      {deleteTarget && (
        <DeleteConfirmation
          task={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={returnFocusToDeleteTrigger}
        />
      )}
      {importPreview && (
        <ImportReplaceDialog
          preview={importPreview}
          fileName={importFile?.name ?? ""}
          onReplace={replaceTasksFromImport}
          onCancel={cancelImport}
          error={importError || undefined}
          guidance={importGuidance || undefined}
          onRetry={importError ? replaceTasksFromImport : undefined}
        />
      )}
    </main>
  );
}
