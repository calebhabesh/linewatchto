# Regional Push Notifications Implementation Record

**Date:** 2026-07-29
**Status:** Implemented

## Delivered boundary

- GO/UP saved commutes use the existing granular per-route notification rules, including independent outbound and return Toronto-time schedules, event-type filters, lifecycle deduplication, meaningful-update delivery, and service-restored handling.
- All eight authored GO/UP corridors are available as opt-in account-level notification subscriptions alongside TTC line subscriptions.
- Regional notification candidates come only from freshness-gated dashboard-visible Metrolinx rail alerts. TTC and regional clearance decisions use independent source freshness checks.
- Regional current, planned, updated, and restored notification entries reuse the existing observation, delivery, diagnostics, service-worker display, and retained-tag plumbing.
- Regional titles use authored GO corridor codes/names or the UP Express identity, and notification links switch the dashboard to GO/UP before opening the affected commute or impact.
- Existing device permission, VAPID configuration, delivery opt-in, retry, and browser/OS limitations remain unchanged.

## Source-honest limits

- Regional push does not include accessibility amenity notices, station arrivals, estimated train markers, reliability aggregates, bus notices, or cross-network routes.
- Regional route baseline times remain low-confidence topology planning estimates and are not used as notification evidence.
- Metrolinx notices may be broad or approximately projected to the reviewed topology; Web Push delivery is not guaranteed.

## Deferred

- TTC route review/editing.
- Cross-network TTC-to-GO/UP routing.
- Commute email notifications.
