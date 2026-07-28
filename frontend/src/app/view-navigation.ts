export function pushViewHistory<T>(history: readonly T[], current: T, next: T): T[] {
  if (current === next) return [...history];
  return [...history, current];
}

export function popViewHistory<T>(
  history: readonly T[],
  fallback: T,
): { history: T[]; view: T } {
  if (history.length === 0) {
    return { history: [], view: fallback };
  }

  return {
    history: history.slice(0, -1),
    view: history[history.length - 1] ?? fallback,
  };
}
