"use client";

import { useEffect, useMemo, useState } from "react";
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
  // Indexes live in a module cache, filled here or by the idle prefetch; a load only re-renders.
  const [, setLoads] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    for (const network of NETWORKS) {
      if (cachedSurfaceSearchIndex(network)) continue;
      loadSurfaceSearchIndex(network).then(() => {
        if (!cancelled) setLoads((count) => count + 1);
      }, () => {
        // Offline or unavailable: search keeps stations, lines, notices and stop numbers.
      });
    }
    return () => {
      cancelled = true;
    };
  }, [active]);

  const ttc = cachedSurfaceSearchIndex("ttc");
  const regional = cachedSurfaceSearchIndex("regional");
  return useMemo(() => [ttc, regional].filter((index): index is PreparedSurfaceIndex => index !== null), [ttc, regional]);
}

/**
 * One network's index, for a surface notice's View (plan 15, L4). `failed`
 * says it could not load this time, so the caller can stop waiting for it.
 */
export function useSurfaceSearchIndex(network: NetworkId, active: boolean): { index: PreparedSurfaceIndex | null; failed: boolean } {
  const [loaded, setLoaded] = useState<{ network: NetworkId; ok: boolean } | null>(null);
  useEffect(() => {
    if (!active || cachedSurfaceSearchIndex(network)) return;
    let cancelled = false;
    loadSurfaceSearchIndex(network).then(
      () => { if (!cancelled) setLoaded({ network, ok: true }); },
      () => { if (!cancelled) setLoaded({ network, ok: false }); },
    );
    return () => {
      cancelled = true;
    };
  }, [active, network]);
  const index = active ? cachedSurfaceSearchIndex(network) : null;
  return { index, failed: !index && loaded?.network === network && !loaded.ok };
}
