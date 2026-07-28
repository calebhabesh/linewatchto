# Regional My Commutes Implementation Record

**Date:** 2026-07-28
**Status:** Implemented

## Delivered boundary

- Saved commutes are network-scoped in persistence and API responses.
- GO/UP origins and destinations validate against the reviewed regional catalog rather than TTC station rows.
- Default regional paths use the reviewed adjacent-link topology, including KI/UP shared stations and transfers between corridors at common stations such as Union.
- Baseline durations are explicitly low-confidence topology planning estimates. They are not schedule-backed departure or arrival predictions.
- Fresh dashboard-visible Metrolinx route-wide, station, and segment impacts match against each outbound or optional return leg.
- Missing or stale successful regional ingestion produces an explicit unavailable impact state and suppresses source alerts.
- Regional routes can be reviewed as a stop list and highlighted on the regional schematic; their label, endpoints, and return-leg setting can be edited.
- Existing TTC commutes retain their weighted schedule/fallback routing and notification behavior.
- Regional commutes are excluded from the TTC saved-commute push planner.

## Deferred

- TTC-to-GO/UP cross-network routing.
- Static-GTFS schedule-derived regional travel-time weights.
- Alternate route selection beyond the computed default route.
- Regional push subscriptions, lifecycle deduplication, and restoration notifications.
- Regional reliability aggregation.
