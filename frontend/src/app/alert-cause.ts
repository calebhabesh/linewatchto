/** A missing source value says nothing about what the operator knows. */
export function suppliedAlertCause(cause: string | null | undefined): string | null {
  const value = cause?.trim();
  if (!value) return null;
  const key = value.replace(/_/g, " ").replace(/\s+/g, " ").toLowerCase();
  return key === "unknown" || key === "unknown cause" ? null : value;
}
