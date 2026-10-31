import { useEffect, useRef, useState, type RefObject } from "react";
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

/** Longest an intro may take before breathing starts anyway (a long gesture holds it). */
const MAP_SELECTION_INTRO_LIMIT_MS = 15_000;

/**
 * Both maps' selection intro: the flash plays when `key` changes, then the
 * selection breathes. The intro ends when its CSS animation finishes, so a
 * pan or zoom, which pauses selection animations, delays it rather than
 * cutting it short. With nothing animating (reduced motion, mobile
 * performance mode) it ends after `MAP_SELECTION_INTRO_MS`. Returns whether
 * the intro has finished; `onComplete` runs once when it does.
 */
export function useMapSelectionIntro(
  key: string | null,
  rootRef?: RefObject<Element | null>,
  onComplete?: () => void,
): boolean {
  const [completedKey, setCompletedKey] = useState<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    if (!key) return;
    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      setCompletedKey(key);
      onCompleteRef.current?.();
    };
    let timer = window.setTimeout(complete, MAP_SELECTION_INTRO_MS);
    // The selection's overlays mount in the same commit; read their intros a frame later.
    const frame = window.requestAnimationFrame(() => {
      const root = rootRef?.current;
      if (!root || typeof root.getAnimations !== "function") return;
      const intros = [...root.querySelectorAll(".map-selection-attention")]
        .flatMap((element) => element.getAnimations())
        .filter((animation) => (
          typeof CSSAnimation !== "undefined"
          && animation instanceof CSSAnimation
          && animation.animationName.endsWith("-intro")
        ));
      if (intros.length === 0) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(complete, MAP_SELECTION_INTRO_LIMIT_MS);
      // A remounted overlay cancels its animation; the selection then breathes.
      void Promise.all(intros.map((animation) => animation.finished)).then(complete, complete);
    });
    return () => {
      done = true;
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [key, rootRef]);
  return Boolean(key && completedKey === key);
}
