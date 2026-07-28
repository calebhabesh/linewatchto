# TTC / GO/UP Design-Language Consistency Slice

**Date:** 2026-07-28
**Status:** In progress

## Goal

Make TTC and GO/UP modes feel like two network views of the same LineWatchTO product. Treat the mature TTC mode as the reference design, then reuse shared components and behavior wherever the underlying meaning is equivalent. Preserve corridor-specific identity, source labels, availability states, and genuine capability differences.

## Scope

### 1. Inventory and parity matrix

- Compare desktop and mobile TTC and GO/UP screens state by state.
- Inventory top chrome, network switching, menus, sheets, cards, station detail, alert detail, accessibility detail, map controls, legends, search, time/freshness labels, and loading/empty/stale/disabled/error states.
- Record each pattern as shared, intentionally network-specific, or missing before refactoring.

### 2. Shared presentation primitives

- Extract or extend common time, age, freshness, source, availability, badge, icon-button, menu-row, panel-header, card-shell, and state-message components where semantics match.
- Centralize equivalent formatting and transition logic instead of maintaining visually divergent TTC and regional copies.
- Prefer composition and network metadata over large components filled with network conditionals.

### 3. Navigation and responsive layout parity

- Align desktop submenu hierarchy, icons, selection state, close/back behavior, focus restoration, and transitions.
- Align mobile bottom navigation, status sheets, inspectors, safe-area spacing, scroll behavior, and breakpoint transitions.
- Keep controls stable in size and preserve reduced-motion, static-motion, high-contrast, pointer, touch, and keyboard behavior.

### 4. Map and detail interaction parity

- Reuse the established interaction grammar for hover, focus, selection, station rings, segment activation, zoom controls, legends, and detail opening.
- Keep TTC and regional renderers separate where their SVG topology or camera behavior genuinely differs.
- Apply network corridor colors and terminology without changing the shared hierarchy or feedback language.

### 5. Content and source-honesty guardrails

- Do not add TTC-only controls to GO/UP unless the regional capability exists.
- Do not fill unsupported regional states with TTC fixtures or inferred data.
- Use shared time display only when timestamps have equivalent meaning; label source update, estimate, scheduled time, and alert age distinctly.
- Consistency means a common visual and interaction system, not identical information architecture at the expense of clarity.

## Verification

- Add fixture tests for shared formatters and state variants.
- Add component/source tests for parity-sensitive menus, icons, labels, and transitions.
- Add desktop and mobile Playwright coverage that switches networks and compares equivalent navigation, map-selection, station-detail, accessibility, and availability flows.
- Run fixture tests, TypeScript, ESLint, production build, and the relevant Playwright suite before marking the slice complete.

## Completion Criteria

- Equivalent TTC and GO/UP surfaces use the same component or an explicitly documented network-specific variant.
- Time, freshness, source, loading, stale, disabled, unavailable, and error states follow one vocabulary and hierarchy.
- Desktop and mobile navigation behave consistently across network switches.
- No regional capability, data precision, or freshness is implied solely to achieve visual parity.

## Current Parity Matrix

| Surface | Decision | Implementation |
| --- | --- | --- |
| Top chrome and network switching | Shared | `LineWatchShell` and `NetworkSelector` own one responsive interaction path for both networks. |
| Desktop menu and mobile status hierarchy | Shared with capability gates | Alerts, delays, closures, accessibility, and line/corridor status use the same rows, icons, counts, navigation stack, focus behavior, and transitions. TTC-only Reduced Speed Zones and surface notices remain hidden in regional mode. |
| Impact panels and cards | Shared | Active alerts, delays, planned closures, timestamps, source labels, filters, list/card views, and map-focus actions use the same components with network-scoped data. |
| Time, source, and fallback vocabulary | Shared | `network-presentation.ts`, `impact-time.ts`, and `dashboard-source-label.ts` centralize equivalent wording and formatting. Regional fallback labels explicitly say demo/not live. |
| Station panel chrome | Shared | TTC and GO/UP use `StationDetailHeader` plus the same dock/sheet layout, save action, close behavior, entrance/exit transition, reduced-motion handling, and scroll treatment. |
| Line/corridor identity | Shared primitive | `TransitLineBadge` renders authored TTC, GO, and UP badges in menus, status rows, station corridors, and arrival rows. Network colors and names remain distinct. |
| Station detail content | Deliberate variant | TTC keeps scheduled/live subway arrival grouping and reviewed accessibility metadata. GO/UP keeps freshness-checked realtime estimates, official schedule links, and source-scoped amenity notices. Both use the same section hierarchy and availability vocabulary where meaning matches. |
| Map scene and camera | Partial, deliberate renderer variant | Separate SVG renderers preserve authored topology and camera behavior. Regional delay segments now replicate the TTC blue lane, filled hourglass, direction-arrow, motion, and reduced-motion grammar. Selection, hover/focus, activation, legends, and controls are aligned; suspension, planned-closure, station-impact, overlap, and mobile-scale visual parity still require screenshot review. |
| Loading, empty, stale, disabled, and unavailable states | Shared vocabulary, source-specific explanation | Equivalent headings and hierarchy are retained while messages identify TTC fixture fallback, regional demo mode, stale/disabled regional data, and estimate limitations honestly. |
| Reliability, My Commutes, notifications, and surface notices | Intentionally network-specific | Regional versions remain absent until their backend/product slices exist; the consistency pass does not expose TTC-only behavior as regional capability. |

## Verification Coverage

- Pure tests cover shared network status, source, fallback, and clear-service labels.
- Source/component tests require both station panels to use the shared header and badge primitives.
- Desktop smoke coverage switches networks and exercises the shared regional station actions.
- Mobile smoke coverage switches networks and verifies source-honest status, capability-gated menus, and shared station actions.

## Remaining Review

- Review every regional impact state against its TTC counterpart at desktop and mobile map scales: delay, suspension, planned closure, overlapping impacts, station-only impacts, selected, hovered, focused, static-motion, and high-contrast.
- Review the regional status console, legends, map controls, alert cards, station panels, loading/empty/error states, and network-switch transitions with side-by-side screenshots rather than relying only on source parity.
- Run the new browser assertion for regional directional delay glyphs in an environment that permits the Playwright stub to bind to ports 4173 and 4174.
