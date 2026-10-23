import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";

const savedTask = {
  id: "axe-task",
  title: "Accessible task",
  description: "Task description",
  completed: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function makeImportFile(contents: string): File {
  const file = new File([contents], "tasks.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => contents });
  return file;
}

describe("automated accessibility checks", () => {
  beforeEach(() => window.localStorage.clear());

  async function expectNoAxeViolations() {
    const results = await axe.run(document.body);
    expect(results.violations).toEqual([]);
  }

  it("has no axe-core violations in the initial application state", async () => {
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");
    await expectNoAxeViolations();
  });

  it("has no axe-core violations in the import replacement dialog", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");
    const contents = JSON.stringify({
      schemaVersion: 1,
      tasks: [{
        id: "axe-task",
        title: "Accessible task",
        description: "",
        completed: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      }],
    });
    await user.upload(screen.getByLabelText("Import a task JSON file"), makeImportFile(contents));
    const dialog = await screen.findByRole("dialog", { name: "Replace task list?" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await expectNoAxeViolations();
  });

  it("has no axe-core violations in the delete confirmation dialog", async () => {
    window.localStorage.setItem("todo.tasks.v1", JSON.stringify({ schemaVersion: 1, tasks: [savedTask] }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: savedTask.title });
    await user.click(screen.getByRole("button", { name: `Delete ${savedTask.title}` }));
    const dialog = screen.getByRole("dialog", { name: "Delete task?" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await expectNoAxeViolations();
  });

  it("has no axe-core violations when form validation feedback is shown", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a title");
    await expectNoAxeViolations();
  });

  it("has no axe-core violations after a task save fails", async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    try {
      render(<App />);
      await screen.findByText("Current saved tasks loaded.");
      await user.type(screen.getByLabelText("Title"), "Unsaved task");
      await user.click(screen.getByRole("button", { name: "Add task" }));
      expect(await screen.findByText(/Visible task changes are not saved/)).toBeVisible();
      expect(screen.getByText(/Not saved/)).toBeVisible();
      await expectNoAxeViolations();
    } finally {
      setItem.mockRestore();
    }
  });

  it("has no axe-core violations in an import validation error state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Current saved tasks loaded.");
    await user.upload(screen.getByLabelText("Import a task JSON file"), makeImportFile("{"));
    expect(await screen.findByText("The selected file is not valid JSON.")).toBeVisible();
    await expectNoAxeViolations();
  });

  it("has no axe-core violations after import replacement storage fails", async () => {
    window.localStorage.setItem("todo.tasks.v1", JSON.stringify({ schemaVersion: 1, tasks: [savedTask] }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: savedTask.title });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    try {
      const contents = JSON.stringify({
        schemaVersion: 1,
        tasks: [{ ...savedTask, id: "imported-task", title: "Imported task" }],
      });
      await user.upload(screen.getByLabelText("Import a task JSON file"), makeImportFile(contents));
      const dialog = await screen.findByRole("dialog", { name: "Replace task list?" });
      await user.click(within(dialog).getByRole("button", { name: "Replace" }));
      expect(await within(dialog).findByText(/Replacement did not complete/)).toBeVisible();
      await expectNoAxeViolations();
    } finally {
      setItem.mockRestore();
    }
  });
});
