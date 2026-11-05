/**
 * Loads the surface search index (plan 14, U3): one generated file per
 * network, fetched the first time search opens and cached like the other Map
 * View assets (never as an API response). The tokens are built in slices so
 * the first focus does not block typing.
 */

import { cachedLoader } from "./geographic-bus-catalog.ts";
import type { NetworkId } from "./dashboard-contract.ts";
import {
  prepareSurfaceSearchIndexInSlices,
  type PreparedSurfaceIndex,
  type SurfaceSearchIndexFile,
} from "./surface-search.ts";

export const SURFACE_SEARCH_INDEX_URLS: Record<NetworkId, string> = {
  ttc: "/assets/linewatch/geographic/search-index-ttc.json",
  regional: "/assets/linewatch/geographic/search-index-go.json",
};

export function isSurfaceSearchIndexFile(value: unknown, network: NetworkId): value is SurfaceSearchIndexFile {
  const file = value as Partial<SurfaceSearchIndexFile> | null;
  return Boolean(file
    && file.network === network
    && typeof file.schemaVersion === "string" && file.schemaVersion.startsWith("1.")
    && Array.isArray(file.sources) && Array.isArray(file.colors)
    && file.routes && Array.isArray(file.routes.route)
    && file.stops && Array.isArray(file.stops.name) && Array.isArray(file.stops.lonDeltaE5)
    && (Array.isArray(file.stops.code) || Array.isArray(file.stops.codeDelta)));
}

const fileLoaders = {
  ttc: cachedLoader(SURFACE_SEARCH_INDEX_URLS.ttc, (value): value is SurfaceSearchIndexFile => isSurfaceSearchIndexFile(value, "ttc"), "TTC stop search"),
  regional: cachedLoader(SURFACE_SEARCH_INDEX_URLS.regional, (value): value is SurfaceSearchIndexFile => isSurfaceSearchIndexFile(value, "regional"), "GO stop search"),
};

const prepared: Partial<Record<NetworkId, PreparedSurfaceIndex>> = {};
const pending: Partial<Record<NetworkId, Promise<PreparedSurfaceIndex>>> = {};

export function cachedSurfaceSearchIndex(network: NetworkId): PreparedSurfaceIndex | null {
  return prepared[network] ?? null;
}

/** The prepared index for one network; a failed load can be tried again. */
export function loadSurfaceSearchIndex(network: NetworkId): Promise<PreparedSurfaceIndex> {
  const ready = prepared[network];
  if (ready) return Promise.resolve(ready);
  pending[network] ??= fileLoaders[network].load()
    .then((file) => prepareSurfaceSearchIndexInSlices(file))
    .then((index) => {
      prepared[network] = index;
      return index;
    })
    .finally(() => {
      delete pending[network];
    });
  return pending[network];
}

type PrefetchEnvironment = {
  onLine: boolean;
  saveData: boolean;
  effectiveType: string | undefined;
  /** Runs `task` once the page has loaded and gone idle; returns a cancel. */
  whenIdle: (task: () => void) => () => void;
  load: (network: NetworkId) => Promise<unknown>;
};

function browserPrefetchEnvironment(): PrefetchEnvironment {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return {
    onLine: navigator.onLine,
    saveData: connection?.saveData === true,
    effectiveType: connection?.effectiveType,
    whenIdle: (task) => {
      let idleHandle: number | null = null;
      let timer: number | null = null;
      const schedule = () => {
        if (typeof window.requestIdleCallback === "function") idleHandle = window.requestIdleCallback(task, { timeout: 5_000 });
        else timer = window.setTimeout(task, 2_000);
      };
      if (document.readyState === "complete") schedule();
      else window.addEventListener("load", schedule, { once: true });
      return () => {
        window.removeEventListener("load", schedule);
        if (idleHandle !== null) window.cancelIdleCallback(idleHandle);
        if (timer !== null) window.clearTimeout(timer);
      };
    },
    load: loadSurfaceSearchIndex,
  };
}

/**
 * Loads both networks' indexes once the page is idle, `first` before the other, so the first
 * search answers at once (about 125 KB compressed together, then cached per release by the
 * service worker). Not offline, with Save-Data on, or on a 2G connection; search then loads on
 * focus as before. Returns a cancel for anything not yet started.
 */
export function prefetchSurfaceSearchIndexes(first: NetworkId, environment: PrefetchEnvironment = browserPrefetchEnvironment()): () => void {
  if (!environment.onLine || environment.saveData || /(^|-)2g$/.test(environment.effectiveType ?? "")) return () => {};
  let cancelled = false;
  const cancelIdle = environment.whenIdle(() => {
    const order: NetworkId[] = first === "ttc" ? ["ttc", "regional"] : ["regional", "ttc"];
    void order.reduce<Promise<unknown>>(
      (previous, network) => previous.then(() => (cancelled ? undefined : environment.load(network).catch(() => undefined))),
      Promise.resolve(),
    );
  });
  return () => {
    cancelled = true;
    cancelIdle();
  };
}
