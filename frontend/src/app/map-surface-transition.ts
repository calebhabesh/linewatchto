export interface MapFadeController {
  fade: (opacity: 0 | 1, duration: number, signal: AbortSignal) => Promise<void>;
  reset: () => void;
}

const owners = new WeakMap<HTMLElement, object>();

/** Prepare a replacement while the current map is usable, then animate opacity only. */
export function startMapSurfaceTransition(
  surface: HTMLElement,
  options: {
    prepare: (signal: AbortSignal) => Promise<unknown>;
    update: () => void;
    reducedMotion?: boolean;
    waitForReady?: boolean;
    fade?: MapFadeController;
  },
) {
  const owner = {};
  owners.set(surface, owner);
  const controller = new AbortController();
  const { signal } = controller;
  let cancelled = false;
  const animation: { current: Animation | null } = { current: null };
  let releaseReady: (() => void) | null = null;
  const timeout = setTimeout(() => controller.abort(new Error('Map switching timed out. Please retry.')), 12000);

  const abortable = <T>(work: Promise<T>) => new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });

  const fade = async (opacity: 0 | 1, duration: number) => {
    if (options.reducedMotion) return;
    if (options.fade) {
      await abortable(options.fade.fade(opacity, duration, signal));
    } else {
      const previous = animation.current;
      const artwork = surface.querySelector<HTMLElement>(
        '.network-diagram-layer:not([data-preparing]) :is(.ttc-map-stage, .regional-map-stage)',
      );
      if (!artwork) return;
      animation.current = artwork.animate([{ opacity: 1 - opacity }, { opacity }], {
        duration, easing: 'ease-out', fill: 'both',
      });
      previous?.cancel();
      await abortable(Promise.race([
        animation.current.finished,
        new Promise<void>(resolve => setTimeout(resolve, duration + 50)),
      ]));
    }
  };

  const finished = (async () => {
    try {
      surface.dataset.mapSurfaceTransition = 'loading';
      await abortable(options.prepare(signal));
      surface.dataset.mapSurfaceTransition = 'leaving';
      await fade(0, 100);
      if (signal.aborted) throw signal.reason;
      const ready = options.waitForReady ? new Promise<void>(resolve => { releaseReady = resolve; }) : Promise.resolve();
      options.update();
      await abortable(ready);
      releaseReady = null;
      surface.dataset.mapSurfaceTransition = 'entering';
      await fade(1, 150);
    } catch (error) {
      if (!cancelled) throw error;
    } finally {
      clearTimeout(timeout);
      releaseReady = null;
      animation.current?.cancel();
      if (owners.get(surface) === owner) {
        options.fade?.reset();
        delete surface.dataset.mapSurfaceTransition;
        owners.delete(surface);
      }
    }
  })();

  return {
    finished,
    mapReady: () => releaseReady?.(),
    cancel: () => {
      cancelled = true;
      controller.abort();
      animation.current?.cancel();
      if (owners.get(surface) === owner) options.fade?.reset();
    },
  };
}
