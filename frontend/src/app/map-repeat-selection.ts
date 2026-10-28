import type { ImpactSelection } from "./linewatch-data";

/**
 * A map click on the alert that is already selected (and shown on its own,
 * not as part of a station or commute view) changes nothing: it keeps the
 * selection without replaying the attention flash or moving the camera.
 * Lists and search still re-focus a selected alert on purpose.
 */
export function isRepeatMapSelection(
  current: { selection: ImpactSelection; selectedStationId?: string | null; commutePathPreview?: unknown },
  next: ImpactSelection,
): boolean {
  return Boolean(
    next
      && current.selection
      && current.selection.kind === next.kind
      && current.selection.id === next.id
      && !current.selectedStationId
      && !current.commutePathPreview,
  );
}
