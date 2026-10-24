import type { Task } from "../domain/task";

type TaskListProps = {
  tasks: Task[];
  emptyMessage?: string;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task, trigger: HTMLButtonElement) => void;
};

export function TaskList({ tasks, emptyMessage, onToggle, onEdit, onDelete }: TaskListProps) {
  return (
    <section className="task-list-section" aria-labelledby="task-list-heading">
      <h2 id="task-list-heading" tabIndex={-1}>Your tasks</h2>
      {tasks.length === 0 ? (
        <p className="empty-state">{emptyMessage ?? "No tasks yet. Add a task to get started."}</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <li className="task-card" key={task.id}>
              <div className="task-heading-row">
                <h3 tabIndex={-1} data-task-heading data-task-id={task.id}>
                  {task.title}
                </h3>
                <label className="completion-control">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    aria-label={task.completed ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
                    onChange={() => onToggle(task)}
                  />
                  <span>{task.completed ? "Completed" : "Incomplete"}</span>
                </label>
              </div>
              {task.description && <p className="task-description">{task.description}</p>}
              <p className="task-date">
                Created <time dateTime={task.createdAt}>{new Date(task.createdAt).toLocaleDateString()}</time>
              </p>
              <div className="button-row task-actions">
                <button className="secondary" type="button" onClick={() => onEdit(task)}>Edit {task.title}</button>
                <button
                  className="danger"
                  type="button"
                  data-action="delete"
                  data-task-id={task.id}
                  onClick={(event) => onDelete(task, event.currentTarget)}
                >
                  Delete {task.title}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
