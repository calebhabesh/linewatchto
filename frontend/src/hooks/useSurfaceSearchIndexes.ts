"use client";

import { useEffect, useState } from "react";
import type { NetworkId } from "../app/dashboard-contract";
import { cachedSurfaceSearchIndex, loadSurfaceSearchIndex } from "../app/surface-search-index";
import type { PreparedSurfaceIndex } from "../app/surface-search";

const NETWORKS: NetworkId[] = ["ttc", "regional"];

/**
 * Both networks' stop and route search, loaded once `active` first turns on
 * (the search box opens or takes focus). Until a network's index arrives its
 * stops are simply absent; a typed stop number still opens its departures.
 */
export function useSurfaceSearchIndexes(active: boolean): PreparedSurfaceIndex[] {
  const [indexes, setIndexes] = useState<PreparedSurfaceIndex[]>(() =>
    NETWORKS.map(cachedSurfaceSearchIndex).filter((index): index is PreparedSurfaceIndex => index !== null));

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    for (const network of NETWORKS) {
      if (cachedSurfaceSearchIndex(network)) continue;
      loadSurfaceSearchIndex(network).then(() => {
        if (cancelled) return;
        setIndexes(NETWORKS.map(cachedSurfaceSearchIndex).filter((index): index is PreparedSurfaceIndex => index !== null));
      }, () => {
        // Offline or unavailable: search keeps stations, lines, notices and stop numbers.
      });
    }
    return () => {
      cancelled = true;
    };
  }, [active]);

  return indexes;
}
