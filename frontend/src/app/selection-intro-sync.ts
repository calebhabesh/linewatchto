/*
 * Keeps a selected alert's card glow in step with its map flash. Both play the
 * same four fast pulses (--selection-fast-cycle-duration, four cycles of
 * --selection-intro-duration), but the map's flash starts when its camera
 * lands (settled-selection.ts), after the card has already been selected.
 * A map that will flash a selection says so (`announceMapSelectionIntro`),
 * then reports when the flash starts; the card waits for that start and
 * aligns its glow to it. With no map flash coming, the card glows at once.
 */

type SelectionIdentity = { kind: string; id: string };
type Intro = { startTime: number | null; settled: boolean };
type Waiter = (startTime: number | null) => void;

/** Longest a card waits for its map flash before glowing on its own. */
const MAX_WAIT_MS = 3_000;

const intros = new Map<string, Intro>();
const waiters = new Map<string, Set<Waiter>>();

const keyOf = ({ kind, id }: SelectionIdentity) => `${kind}:${id}`;

function settle(key: string, startTime: number | null) {
  intros.set(key, { startTime, settled: true });
  const pending = waiters.get(key);
  waiters.delete(key);
  pending?.forEach((resolve) => resolve(startTime));
}

/** A map will flash this selection once its camera is still. */
export function announceMapSelectionIntro(selection: SelectionIdentity) {
  intros.set(keyOf(selection), { startTime: null, settled: false });
}

/**
 * The map's flash for this selection started at `startTime` (document
 * timeline milliseconds), or will not animate (`null`: reduced motion, or the
 * selection moved on).
 */
export function settleMapSelectionIntro(selection: SelectionIdentity, startTime: number | null) {
  settle(keyOf(selection), startTime);
}

/**
 * Calls `onStart` with the map flash's start time once it is known, or with
 * null at once when no map flash is coming (or after `MAX_WAIT_MS`). Checked
 * a frame late, so a map rendered in the same commit has announced itself.
 * Returns a cancel function.
 */
export function whenMapSelectionIntroStarts(selection: SelectionIdentity, onStart: Waiter): () => void {
  const key = keyOf(selection);
  let done = false;
  let timer: number | undefined;
  const finish: Waiter = (startTime) => {
    if (done) return;
    done = true;
    if (timer !== undefined) window.clearTimeout(timer);
    waiters.get(key)?.delete(finish);
    onStart(startTime);
  };
  const frame = window.requestAnimationFrame(() => {
    const intro = intros.get(key);
    if (!intro) {
      finish(null);
      return;
    }
    if (intro.settled) {
      finish(intro.startTime);
      return;
    }
    const pending = waiters.get(key) ?? new Set<Waiter>();
    pending.add(finish);
    waiters.set(key, pending);
    timer = window.setTimeout(() => finish(null), MAX_WAIT_MS);
  });
  return () => {
    done = true;
    window.cancelAnimationFrame(frame);
    if (timer !== undefined) window.clearTimeout(timer);
    waiters.get(key)?.delete(finish);
  };
}

/** Forgets a selection's intro (it was cleared or replaced). */
export function forgetMapSelectionIntro(selection: SelectionIdentity) {
  const key = keyOf(selection);
  const intro = intros.get(key);
  if (intro && !intro.settled) settle(key, null);
  intros.delete(key);
}
