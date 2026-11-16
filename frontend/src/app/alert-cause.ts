/** A missing source value says nothing about what the operator knows. */
export function suppliedAlertCause(cause: string | null | undefined): string | null {
  const value = cause?.trim();
  if (!value) return null;
  const key = value.replace(/_/g, " ").replace(/\s+/g, " ").toLowerCase();
  return key === "unknown" || key === "unknown cause" ? null : value;
}

/**
 * TTC files planned work under a "CLOSURE - <reason>" cause even when trains keep
 * running (limited nightly service). The effect badge already states the effect, so
 * cause rows show only the reason.
 */
export function alertCauseReason(cause: string | null | undefined): string | null {
  const value = suppliedAlertCause(cause);
  if (!value) return null;
  return value.replace(/^closure\s*[-–—:]\s*/i, "").trim() || value;
}
