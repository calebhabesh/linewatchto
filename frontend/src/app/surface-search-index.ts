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
