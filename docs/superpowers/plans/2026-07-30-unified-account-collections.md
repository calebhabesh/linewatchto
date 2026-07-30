# Unified My Stations And My Commutes Implementation Record

**Date:** 2026-07-30
**Status:** Implemented

## Delivered boundary

- My Stations and My Commutes now show the signed-in account's TTC and GO/UP items from either map mode.
- Both panels provide All, TTC, and GO & UP filters and retain explicit network badges on individual rows.
- Account-menu, mobile More, and mobile navigation summaries use account-wide counts rather than counts from only the active map.
- Opening a saved station, commute path, matched route impact, or accessibility drill-down switches to the item's network before showing the map-owned destination.
- Shared station IDs remain network-qualified in saved-state lookup, React row identity, detail caching, dashboard context, and panel actions.
- My Stations uses the matching TTC or regional dashboard context for each visible row, preventing the active map's impacts from leaking into off-network stations.
- New commute creation defaults to the active map but exposes an explicit TTC / GO & UP choice. Editing retains the route's existing network.

## Retained product boundaries

- A saved commute remains wholly TTC or wholly GO/UP. Cross-network route computation is not implemented.
- My Stations remains an in-app watchlist and does not create push subscriptions.
- Regional planning times remain low-confidence topology estimates, not schedule-backed predictions.
- Every off-network disruption, arrival, and accessibility row retains its source-specific freshness and availability rules.
