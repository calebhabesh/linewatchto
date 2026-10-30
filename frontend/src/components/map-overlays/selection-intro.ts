import { useEffect, useRef, useState } from "react";
import type { ImpactSelection } from "../../app/linewatch-data.ts";

/** How long a new selection flashes before it settles into breathing. */
export const MAP_SELECTION_INTRO_MS = 2400;

/**
 * What the selection intro belongs to. A new key replays the intro; the same
 * key (a dashboard refresh, a re-render) keeps the selection breathing.
 */
export function mapSelectionIntroKey({
  selection,
  linkedSelectionIntroKey,
  selectedStationId,
  commutePreviewKey,
  generation,
}: {
  selection: ImpactSelection;
  /** Shared by alerts that are one disruption, so moving between them does not replay. */
  linkedSelectionIntroKey?: string | null;
  selectedStationId?: string | null;
  commutePreviewKey?: string | null;
  /** Bumped when the rider asks to see the same selection again. */
  generation: number;
}): string | null {
  if (selection) return linkedSelectionIntroKey ?? `${selection.kind}:${selection.id}:${generation}`;
  if (selectedStationId) return `station:${selectedStationId}:${generation}`;
  if (commutePreviewKey) return `commute:${commutePreviewKey}:${generation}`;
  return null;
}

/**
 * Both maps' selection intro: the flash runs for `MAP_SELECTION_INTRO_MS`
 * after `key` changes, then the selection breathes. Returns whether the
 * intro has finished; `onComplete` runs once when it does.
 */
export function useMapSelectionIntro(key: string | null, onComplete?: () => void): boolean {
  const [completedKey, setCompletedKey] = useState<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    if (!key) return;
    const timer = window.setTimeout(() => {
      setCompletedKey(key);
      onCompleteRef.current?.();
    }, MAP_SELECTION_INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [key]);
  return Boolean(key && completedKey === key);
}
