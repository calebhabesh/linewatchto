/*
 * Keeps an overlay drawn while it fades out after leaving the map's content:
 * each item that leaves stays, marked `exiting`, for `exitMs`. An update that
 * briefly empties the list (a refresh between two snapshots) is held for
 * `emptyHoldMs` before anything starts to fade.
 */
import { useEffect, useMemo, useRef, useState } from "react";

type Retained<T> = { item: T; exiting: boolean };

export function useRetainedMapItems<T extends { key: string; exiting?: boolean }>(
  items: T[],
  exitMs = 240,
  emptyHoldMs = 90,
): T[] {
  const [retained, setRetained] = useState<Retained<T>[]>(() => items.map((item) => ({ item, exiting: false })));
  const retainedRef = useRef(retained);

  useEffect(() => {
    retainedRef.current = retained;
  }, [retained]);

  useEffect(() => {
    const nextKeys = new Set(items.map((item) => item.key));
    const shouldHoldTransientEmptyFrame =
      items.length === 0 && retainedRef.current.some((layer) => !layer.exiting);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRetained((previous) => {
      if (items.length === 0 && previous.some((layer) => !layer.exiting)) return previous;
      const leaving = new Map(previous.map((layer) => [layer.item.key, layer]));
      const next: Retained<T>[] = items.map((item) => {
        leaving.delete(item.key);
        return { item, exiting: false };
      });
      for (const layer of leaving.values()) next.push({ ...layer, exiting: true });
      return next;
    });

    const emptyHoldTimer = shouldHoldTransientEmptyFrame
      ? window.setTimeout(() => {
          setRetained((current) => current.map((layer) => ({ ...layer, exiting: true })));
        }, emptyHoldMs)
      : null;
    const timer = window.setTimeout(() => {
      setRetained((current) => current.filter((layer) => !layer.exiting || nextKeys.has(layer.item.key)));
    }, exitMs + (shouldHoldTransientEmptyFrame ? emptyHoldMs : 0));

    return () => {
      if (emptyHoldTimer !== null) window.clearTimeout(emptyHoldTimer);
      window.clearTimeout(timer);
    };
  }, [items, exitMs, emptyHoldMs]);

  // A drawn item keeps its object while it stays, so memoized overlays skip it.
  return useMemo(
    () => retained.map(({ item, exiting }) => (exiting ? { ...item, exiting: true } : item)),
    [retained],
  );
}
