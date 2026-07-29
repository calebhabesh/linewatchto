# TTC My Commutes Route Review and Editing Implementation Record

**Date:** 2026-07-29
**Status:** Implemented

## Delivered boundary

- TTC saved commutes now use the same account-owned route editor as regional saved commutes.
- Riders can edit the route label, origin, destination, and optional return-leg monitoring.
- Saving an edit recalculates the TTC weighted default path in both enabled directions and reruns dashboard-visible disruption matching.
- Existing per-route notification rules remain attached to the commute and are not reset by route edits.
- Duplicate-route, station validation, and account-ownership checks remain enforced by the backend.
- Recalculated outbound and return stop lists remain reviewable in My Commutes and can be highlighted on the authored TTC map.
- No database migration or new frontend styling was required.

## Source honesty

- Route editing recomputes LineWatchTO's weighted default path; it does not offer alternate-route selection.
- Travel times remain schedule/fallback weighted estimates, not live train-movement predictions.
- Map previews are schematic paths on the authored TTC map, not imported GTFS geometry.

## Deferred

- Alternate-route choice and manual intermediate-stop editing.
- Cross-network TTC-to-GO/UP routing.
- Accessibility-personalized commute routing.
- Standalone commute-impact API and commute email notifications.
