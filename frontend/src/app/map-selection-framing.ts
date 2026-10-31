/**
 * What a System Map camera frames for the current selection: the key that
 * starts a new framing, and the drawn elements it frames, found by the shared
 * overlay attributes. Pure, so every map and the tests share it.
 */
import type { AccountCommutePathPreview } from "./commute-data";
import type { ImpactSelection } from "./linewatch-data";

export type MapSelectionState = {
  selection: ImpactSelection;
  selectedStationId: string | null;
  commutePathPreview?: AccountCommutePathPreview | null;
};

/** Identifies what the camera frames; a new key frames again. */
export function mapFocusTargetKey(
  { selection, selectedStationId, commutePathPreview }: MapSelectionState,
  selectionAttentionGeneration: number,
): string | null {
  if (selection) return `${selection.kind}:${selection.id}:${selectionAttentionGeneration}`;
  if (selectedStationId) return `station:${selectedStationId}`;
  if (commutePathPreview) return `commute:${commutePathPreview.id}:${commutePathPreview.legId}`;
  return null;
}

/**
 * The drawn elements that frame the current selection, found by the shared
 * overlay attributes. Alerts frame by their tubes, never their moving glyphs,
 * which can still sit at the origin in the commit that enables them.
 */
export function selectedMapElements(
  root: ParentNode,
  { selection, selectedStationId, commutePathPreview }: MapSelectionState,
): SVGGraphicsElement[] {
  if (selection) {
    const id = CSS.escape(selection.id);
    return [...root.querySelectorAll<SVGGraphicsElement>([
      `[data-selected-impact-emphasis="${id}"]`,
      `[data-map-impact-id="${id}"] > .asset-alert-path`,
      `[data-station-impact-selection-id="${id}"]`,
      ...(commutePathPreview ? [`[data-selected-commute-impact-overlay="${id}"]`] : []),
    ].join(", "))];
  }
  if (selectedStationId) {
    // One element per station anchor; an interchange can have several.
    return [...root.querySelectorAll<SVGGraphicsElement>(
      `[data-map-selected-station-id="${CSS.escape(selectedStationId)}"]`,
    )];
  }
  if (commutePathPreview) {
    const preview = root.querySelector<SVGGraphicsElement>(
      `[data-commute-path-preview="${CSS.escape(commutePathPreview.id)}"]`,
    );
    return preview ? [preview] : [];
  }
  return [];
}
