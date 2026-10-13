/**
 * Label + control + optional hint + error, shared by the registration and
 * admin actor forms. The control references `${id}-hint` / `${id}-error`
 * through its own aria-describedby.
 */
export interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function Field({ id, label, error, hint, required, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
