/**
 * What the map is focused on, across both views. A System Map ⇄ Map View switch
 * compares it before and after: the same focus is one the rider already had, so
 * the new view opens framed on it; a different one was chosen with the switch
 * (a notice's View, a stop link) and is flown to.
 */
import type { ImpactSelection } from "./linewatch-data.ts";
import type { NetworkId } from "./regional-data.ts";
import { mapFocusTargetKey, type MapSelectionState } from "./map-selection-framing.ts";
import { mergeSurfaceSelection, surfaceSelectionKey, type SurfaceMapSelection } from "./surface-map-selection.ts";

export type MapViewFocus = MapSelectionState & {
  network: NetworkId;
  selection: ImpactSelection;
  selectionAttentionGeneration: number;
  selectedSurfaceStopCode?: string | null;
  surfaceSelection?: SurfaceMapSelection | null;
};

/** Null when nothing is focused. */
export function mapViewFocusKey({
  network,
  selectionAttentionGeneration,
  selectedSurfaceStopCode,
  surfaceSelection,
  ...selected
}: MapViewFocus): string | null {
  const target = mapFocusTargetKey(selected, selectionAttentionGeneration);
  const surface = surfaceSelectionKey(mergeSurfaceSelection(selectedSurfaceStopCode, surfaceSelection));
  return target || surface ? `${network}|${target ?? ""}|${surface}` : null;
}
