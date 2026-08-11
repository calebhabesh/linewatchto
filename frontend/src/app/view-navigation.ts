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

export type InAppBackAction =
  | "close-account-dialog"
  | "close-station"
  | "close-commute-preview"
  | "navigate-view"
  | "clear-impact"
  | "none";

export function resolveInAppBackAction({
  accountDialogOpen,
  stationOpen,
  commutePreviewOpen,
  viewOpen,
  impactOpen,
}: {
  accountDialogOpen: boolean;
  stationOpen: boolean;
  commutePreviewOpen: boolean;
  viewOpen: boolean;
  impactOpen: boolean;
}): InAppBackAction {
  if (accountDialogOpen) return "close-account-dialog";
  if (stationOpen) return "close-station";
  if (commutePreviewOpen) return "close-commute-preview";
  if (viewOpen) return "navigate-view";
  if (impactOpen) return "clear-impact";
  return "none";
}
