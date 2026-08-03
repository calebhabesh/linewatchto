# Multi-Network My Commutes Product Boundary

**Date:** 2026-08-03  
**Status:** Launch decision

## Launch choice

My Commutes remains a reliability monitor for routes a rider intends to take. It is not a journey planner.

- A saved route belongs wholly to TTC rapid transit or GO/UP rail.
- A mixed-network rider saves one route for each system and reviews both in the account-wide My Commutes list.
- Route calculation chooses a path only within the selected rail network.
- Product copy must not describe the result as fastest, optimal, recommended, or end-to-end navigation.
- Bus, streetcar surface routing, walking, transfer feasibility, and alternate-route recommendations are outside this boundary.

This is the launch-safe choice because the existing persistence, editing, map review, impact matching, travel-time estimates, notification schedules, and Web Push lifecycle all operate on one network route. Combining only the card presentation would create inconsistent monitoring and notification behavior.

## Future composition option

If rider feedback supports it, add an advanced **multi-network commute** made of explicit, ordered network legs. This is composition, not automatic cross-network route finding.

Example:

1. GO/UP leg: Pickering GO to Union.
2. TTC leg: Union to Lawrence West.

The rider selects both legs and the transfer. LineWatchTO calculates and evaluates each network leg independently, then summarizes the results in one My Commutes card.

The first version must:

- preserve each leg's network, path, source freshness, impacts, map action, and notification evaluation;
- show each leg's travel-time estimate separately;
- state that transfer, walking, and waiting time are not included;
- support outbound and optional return monitoring without inferring a reverse transfer;
- never propose a transfer station, alternate mode, or faster route; and
- migrate existing single-network routes without changing their behavior.

Do not ship the combined card until persistence, create/edit/delete flows, account APIs, both map previews, impact aggregation, notification deduplication and restoration, and frontend/backend tests cover the composed journey as one coherent feature.
