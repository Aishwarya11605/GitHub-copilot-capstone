import { useState, type FormEvent } from "react";
import type { Task, TaskInput, ValidationErrors } from "../domain/task";
import { validateTaskInput } from "../domain/validation";

type TaskFormProps = {
  task?: Task;
  onSubmit: (input: TaskInput) => void;
  onCancel?: () => void;
};

export function TaskForm({ task, onSubmit, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const editing = task !== undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateTaskInput({ title, description });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.value);
  }

  return (
    <form className="task-form" onSubmit={submit} noValidate>
      <h2>{editing ? "Edit task" : "Add a task"}</h2>
      <div className="field">
        <label htmlFor="task-title">Title</label>
        <input
          id="task-title"
          name="title"
          value={title}
          maxLength={101}
          required
          aria-invalid={errors.title ? "true" : undefined}
          aria-describedby={errors.title ? "task-title-error" : "task-title-help"}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <small id="task-title-help">Required; up to 100 characters.</small>
        {errors.title && <p className="field-error" id="task-title-error" role="alert">{errors.title}</p>}
      </div>
      <div className="field">
        <label htmlFor="task-description">Description (optional)</label>
        <textarea
          id="task-description"
          name="description"
          value={description}
          maxLength={501}
          rows={3}
          aria-invalid={errors.description ? "true" : undefined}
          aria-describedby={errors.description ? "task-description-error" : "task-description-help"}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
        <small id="task-description-help">Up to 500 characters.</small>
        {errors.description && <p className="field-error" id="task-description-error" role="alert">{errors.description}</p>}
      </div>
      <div className="button-row">
        <button type="submit">{editing ? "Save task" : "Add task"}</button>
        {onCancel && <button className="secondary" type="button" onClick={onCancel}>Cancel edit</button>}
      </div>
    </form>
  );
}
