import { useEffect, useRef } from "react";
import type { ImportPreview } from "../data/portableTaskFiles";

type ImportReplaceDialogProps = {
  preview: ImportPreview;
  fileName: string;
  onReplace: () => void;
  onCancel: () => void;
  error?: string;
  guidance?: string;
  onRetry?: () => void;
};

export function ImportReplaceDialog({
  preview,
  fileName,
  onReplace,
  onCancel,
  error,
  guidance,
  onRetry,
}: ImportReplaceDialogProps) {
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
      aria-labelledby="import-dialog-title"
      aria-describedby="import-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="dialog-content">
        <h2 id="import-dialog-title">Replace task list?</h2>
        <p id="import-dialog-description">
          {fileName ? `Selected file: ${fileName}. ` : ""}
          This file contains {preview.tasks.length} tasks. Replacing will remove the entire current task list and use these imported tasks instead.
        </p>
        <ul className="preview-list" aria-label="Imported task preview">
          {preview.tasks.slice(0, 5).map((task) => <li key={task.id}>{task.title}</li>)}
        </ul>
        {preview.tasks.length > 5 && <p>And {preview.tasks.length - 5} more tasks.</p>}
        {error && (
          <div className="error-panel" role="alert">
            <p>{error}</p>
            {guidance && <p>{guidance}</p>}
            {onRetry && <button className="secondary" type="button" onClick={onRetry}>Retry replacement</button>}
          </div>
        )}
        <div className="button-row dialog-actions">
          <button type="button" onClick={onReplace}>Replace</button>
          <button ref={cancelRef} className="secondary" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </dialog>
  );
}
