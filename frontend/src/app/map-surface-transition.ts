/** Animate only the map on phones; document snapshots can disturb shared chrome. */
export function startMapSurfaceTransition(
  surface: HTMLElement,
  direction: "forward" | "back",
  update: () => void,
) {
  let cancelled = false;
  let animation: Animation | null = null;
  let releaseReady: (() => void) | null = null;
  let readyTimeout: ReturnType<typeof setTimeout> | undefined;

  const finished = (async () => {
    try {
      surface.dataset.mapSurfaceTransition = "leaving";
      animation = surface.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 80,
        easing: "cubic-bezier(0.3, 0, 0.7, 1)",
        fill: "forwards",
      });
      await animation.finished;
      if (cancelled) return;

      surface.dataset.mapSurfaceTransition = "loading";
      const ready = new Promise<void>((resolve) => {
        releaseReady = resolve;
        // A failed asset must eventually expose the map's error state.
        readyTimeout = setTimeout(resolve, 4000);
      });
      update();
      await ready;
      clearTimeout(readyTimeout);
      releaseReady = null;
      if (cancelled) return;

      surface.dataset.mapSurfaceTransition = "entering";
      const leaving = animation;
      animation = surface.animate([
        { transform: `translate3d(${direction === "forward" ? "100%" : "-100%"}, 0, 0)`, opacity: 1 },
        { transform: "translate3d(0, 0, 0)", opacity: 1 },
      ], {
        duration: 420,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        fill: "both",
      });
      leaving.cancel();
      await animation.finished;
    } catch (error) {
      if (!cancelled) throw error;
    } finally {
      animation?.cancel();
      clearTimeout(readyTimeout);
      releaseReady = null;
      delete surface.dataset.mapSurfaceTransition;
    }
  })();

  return {
    finished,
    mapReady: () => releaseReady?.(),
    cancel: () => {
      cancelled = true;
      animation?.cancel();
      releaseReady?.();
    },
  };
}
