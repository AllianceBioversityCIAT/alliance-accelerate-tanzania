// Small pure helpers shared by the public registration form and the admin actor form.

/** Adds `value` to the list, or removes it if already present. */
export function toggleListValue(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** The same errors object without `field`; returned unchanged when there is nothing to clear. */
export function withoutFieldError(
  errors: Record<string, string>,
  field: string,
): Record<string, string> {
  if (!errors[field]) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
}
