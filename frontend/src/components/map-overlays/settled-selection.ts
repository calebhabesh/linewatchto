import { useEffect, useState } from "react";
import type { ImpactSelection } from "../../app/linewatch-data.ts";

/** Frames to wait for a selection's camera flight to start before checking it. */
const FLIGHT_START_FRAMES = 2;

/** A selection with the key its selection intro (fast flashes) belongs to. */
export type SettledMapSelection = {
  selection: ImpactSelection;
  /** The shell's attention key, shared by linked alerts; null when it has none. */
  introKey: string | null;
};

function sameSettled(a: SettledMapSelection, b: SettledMapSelection) {
  return a.selection?.kind === b.selection?.kind
    && a.selection?.id === b.selection?.id
    && a.introKey === b.introKey;
}

/**
 * The selection a map draws its line alert emphasis for (the raised tube and
 * the flash): the current selection once the camera is still.
 *
 * Selecting an alert flies the camera to it. Drawing its emphasis in the same
 * frame repainted the whole alert just as Chromium promoted the stage for the
 * flight, so a long alert (a whole-line delay) made the flight hitch and
 * flicker, and longer alerts more so. The map's content therefore stays as it
 * was while the camera moves, like a station flight's, and the emphasis
 * appears once it lands (map-renderer-parity.md rule 15). With no flight (the
 * alert is already framed), it appears after `FLIGHT_START_FRAMES` frames.
 * Framing measures the alert's resting tube, which is always drawn.
 *
 * The intro key settles with the selection, so the emphasis that appears
 * plays its own intro: switching keys while the previous alert's flash was
 * still drawn let that flash finish the new key's intro, and the new alert
 * went straight to breathing.
 */
export function useSettledMapSelection(
  selection: ImpactSelection,
  introKey: string | null,
  isCameraInteracting: () => boolean,
): SettledMapSelection {
  const [settled, setSettled] = useState<SettledMapSelection>({ selection, introKey });
  const current = { selection, introKey };
  const pending = !sameSettled(current, settled);
  useEffect(() => {
    if (!pending) return;
    let frame = 0;
    let waited = 0;
    let stillFrames = 0;
    const tick = () => {
      waited += 1;
      if (waited <= FLIGHT_START_FRAMES || isCameraInteracting()) {
        stillFrames = 0;
        frame = window.requestAnimationFrame(tick);
        return;
      }
      // One still frame first: the stage re-rasters at its new scale when the
      // flight ends, and the emphasis paints in the frame after.
      stillFrames += 1;
      if (stillFrames < 2) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      setSettled({ selection, introKey });
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [introKey, isCameraInteracting, pending, selection]);
  return pending ? settled : { selection, introKey };
}
