import { useEffect, useRef } from "react";
import type { Task } from "../domain/task";

type DeleteConfirmationProps = {
  task: Task;
  onConfirm: () => void;
  onCancel: () => void;
};

export function DeleteConfirmation({ task, onConfirm, onCancel }: DeleteConfirmationProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    cancelRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="dialog-content">
        <h2 id="delete-dialog-title">Delete task?</h2>
        <p id="delete-dialog-description">Confirm deletion of “{task.title}”. If storage saves the change, only this task is removed.</p>
        <div className="button-row dialog-actions">
          <button className="danger" type="button" onClick={onConfirm}>Delete</button>
          <button ref={cancelRef} className="secondary" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </dialog>
  );
}
