# Mobile / PWA visual parity implementation plan

Last updated: 2026-09-02

## Purpose

This document is the implementation handoff for the next native-app phase. The goal is not another feature pass. The goal is to make `mobile/` feel like the same LineWatchTO product as the PWA while preserving the native app's faster, smoother interaction model.

The current native app has broad feature coverage, but its presentation is still a conventional collection of full-screen React Native pages. The PWA is a persistent, map-first transit operations shell with compact floating chrome and dense task-specific sheets. That structural difference is the main parity gap. Changing colors, padding, and card radii without changing the shell will not produce the target result.

This plan intentionally does not authorize backend or product-scope expansion. Existing source labeling, freshness rules, API contracts, auth behavior, map selection, native push behavior, and accessibility semantics must remain correct.

## Sources of truth

Use these sources in this order:

1. `AGENTS.md` is the source of truth for product capabilities, terminology, source honesty, colors, verification, and non-claims.
2. The approved PWA reference images in `~/dev/assets/LineWatch/Reddit/updated-aug-2026/final-2` are the source of truth for visual composition and density.
3. The current PWA implementation in `frontend/src/components/LineWatchShell.tsx`, related panel components, and the mobile sections of `frontend/src/app/globals.css` is the source of truth for states not visible in the reference images.
4. The current native implementation is the source of truth for native data flow, providers, routing contracts, gesture behavior, caching, and tests.

Do not copy dates, counts, live labels, station names, or disruption text from screenshots into fixtures. The screenshots demonstrate layout only. Runtime data and freshness labels must continue to come from the native API seams.

The operating-system status bar and the grey floating accessibility/assistant button visible in the supplied Android screenshots are not LineWatchTO UI and must not be reproduced.

## Canonical reference inventory

| Reference | Primary parity target |
| --- | --- |
| `01-cover.png` | Map shell, compact legend, top controls, network selector, impact peek, bottom navigation |
| `02-map-interaction.gif` | Map motion, selection response, panel/map relationship |
| `03-system-status.png` | Status overview sheet, category grid, line-status rows |
| `04-ttc-station-details.png` | TTC station sheet, route identity, jump links, amenity and arrival sections |
| `06-my-commutes.png` | Commutes sheet and dense affected-route card |
| `07-my-stations.png` | Saved-station sheet, filters, disruption summary, arrival groups |
| `08-notification-settings.png` | Notification settings hierarchy, switches, line/corridor subscriptions |
| `09-device-notifications.png` | Notification branding only; it is not an in-app screen target |
| `10-estimated-trains.gif` | Estimated-marker control and map behavior |
| `11-reliability-analytics.png` | Reliability sheet, metric rows, mono numeric hierarchy, stacked breakdown |
| `12-more.png` | More sheet, accent strip, grouped account/notification rows |
| `Screenshot_20260825-025853.png` | Regional station detail and regional route identity |

`01-cover-background-glass-v1.png` is promotional artwork, not an app-screen target.

## Definition of parity

Parity has four parts. A slice is not complete unless all applicable parts pass.

### Structural parity

- The map is the persistent product background for all five primary tabs.
- Status, Search, Commutes, and More open as floating operational sheets over the map instead of replacing it with a plain black page.
- Station detail, impact detail, Notifications, Accessibility, Notices, Reliability, and saved-station views use the same sheet family.
- Bottom navigation remains visible for primary-tab sheets and is hidden only for flows where the PWA also makes the child sheet modal.
- Switching tabs does not remount the map, reset its camera, discard selection, or trigger a duplicate dashboard fetch.

### Visual parity

- PWA colors, typography, density, border treatment, shadows, route identity, and information hierarchy are represented through shared native tokens and primitives.
- A user looking at corresponding PWA and native screenshots should recognize the same shell and the same screen before reading the copy.
- Cards stay at 8dp radius or less. Pill-shaped navigation indicators, badges, and switches are exempt because they are not cards.

### Interaction parity

- Native pan, pinch, zoom, selection, pull-to-refresh, keyboard behavior, and scroll performance remain smooth.
- Opening or closing a sheet does not interrupt the map camera.
- Android back closes the deepest sheet first, then the current primary sheet, then exits according to normal platform behavior.
- Tapping the active bottom-nav item returns its sheet to the top or closes it to the map, matching the selected interaction contract chosen in Slice 2.

### Information parity

- The PWA's visual hierarchy is adopted without inventing unsupported data.
- Runtime freshness, scheduled/live labels, confidence, source, and availability states remain source-honest.
- Native-only controls may remain when required by platform behavior, but they must use the same component language and not dominate the screen.

## Baseline gap assessment

### System-wide gaps

| Area | Current native state | Required baseline |
| --- | --- | --- |
| App composition | Each tab is a generic full-screen page | Persistent map with overlay sheets |
| Headers | Large `ProductHeader` eyebrow/title/subtitle on every page | Compact sheet heading with icon, title, context/build line, back/close controls |
| Density | Large vertical spacing and broad explanatory copy | Dense operational rows with progressive disclosure |
| Typography | Platform default font and ad hoc sizes | Inter for UI; JetBrains Mono for reliability/time-heavy numeric rows |
| Surfaces | Mostly opaque black background plus isolated cards | Layered `#0a0c10` / `#12151c` / `#151821` surfaces over visible map |
| Navigation | Per-item rectangular active background | Shared animated pill/glider inside a floating capsule |
| Icons | Emoji and text glyphs in several controls | Consistent stroke SVG icon set; emoji only where intentionally part of product copy |
| Network control | Large horizontal selector on each page | Compact shell selector; in-sheet selector only when the PWA uses one |
| Route legend | 44dp badges with thick status rings | 36dp-wide collapsed rail with 24dp route badges and expandable detail |
| Map gestures | Pan/zoom exists technically but does not yet feel like a polished interactive map | Natural focal-point pinch zoom, unconstrained-feeling pan within correct bounds, momentum, stable selection, and predictable reset |
| Sheet behavior | No shared height, drag, or close contract | Shared floating-sheet container with explicit variants |
| States | Correct but visually generic loading/error/empty blocks | Same states inside the target sheet/card hierarchy |
| Responsiveness | Bottom clearance exists, but layout is tuned to one portrait width | Compact portrait, large portrait, landscape, keyboard, and font-scale contracts |

### Screen-specific gaps

| Screen | Important current gap | PWA-aligned outcome |
| --- | --- | --- |
| Map | Native-only brand chip, oversized line rail, clipped horizontal impact chips, and awkward/restrictive pan and zoom | PWA utility cluster, compact expandable legend, wrapping impact counts, and genuinely map-like gesture behavior |
| Status | Full page begins with marketing-like title and raw alert list | Status overview sheet first; category/detail lists are secondary views |
| Search | Full page station directory | Search sheet with sticky field, grouped results, and saved-station entry point |
| Station detail | Dedicated route with conventional cards | Map-anchored station sheet with drag handle, large station title, jump grid, dense sections |
| Commutes signed out | Large header plus a small card floating in empty space | Full sheet shell with one deliberate account preview state |
| Commutes signed in | Functional native cards do not match PWA hierarchy | PWA route identity, endpoint stack, leg selector, verdict, estimate grid, impact disclosure |
| More signed out | Large form cards dominate the first viewport | PWA More sheet hierarchy; account opens a focused auth child flow |
| More signed in | Generic sections and documentation cards | Compact icon rows, badges, default-map selector, grouped sections |
| Notifications | Embedded inside a long More page | Dedicated Notifications sheet matching the PWA settings hierarchy |
| Reliability | Generic product header and stat tiles | Compact analytics heading, mono metrics, line rows, stacked incident-hours breakdown |
| Accessibility / Notices | Standalone utility pages | Consistent tool sheets launched from Status or More |

## Target native architecture

The alignment should be component-led. Do not independently restyle every feature screen.

### 1. Persistent operations shell

Create one shell mounted above the five tab scenes. It owns:

- The current network and dashboard query.
- The `SchematicMap` instance and camera state.
- Map overlays, estimated markers, line legend, top utility controls, network selector, status peek, and selected-impact preview.
- Shared safe-area measurements and occupied bottom-nav height.
- Whether map interaction is enabled behind the current sheet.

Suggested ownership:

- `mobile/src/features/shell/operations-shell.tsx`
- `mobile/src/features/shell/shell-provider.tsx`
- `mobile/src/features/shell/shell-layout.ts`
- `mobile/src/app/(tabs)/_layout.tsx`

The exact Expo Router composition may differ, but the invariant is fixed: there must be one mounted map instance, not a separately rendered map backdrop in every tab.

Do not regress these current seams:

- `NetworkProvider`
- `ImpactSelectionProvider`
- `TrainMarkersProvider`
- `useDashboard`
- `useEstimatedTrains`
- current raster layers and pan/zoom math

### 2. Shared sheet family

Introduce a native sheet primitive before converting screens.

Suggested components:

- `OperationsSheet`: surface, shadow, border, safe-area and bottom-nav clearance.
- `OperationsSheetHeader`: optional drag handle, icon, eyebrow/context, title, subtitle/build label, back, and close actions.
- `OperationsSheetScroll`: consistent scroll indicators, padding, refresh control, keyboard behavior, and sticky areas.
- `OperationsSectionHeading`: cyan glow rail plus uppercase label.
- `OperationsRow`: compact icon/copy/trailing-control row.
- `OperationsCard`: shared 6–8dp operational card.
- `SegmentedControl`: network, tab, leg, and filter variants.
- `CountBadge`, `StatusChip`, `SourceLabel`, `MetricPair`, and `IconButton`.

Required variants:

| Variant | Use | Height contract |
| --- | --- | --- |
| `primary` | Status, Search, Commutes, More | Bottom-nav anchored; max about 78% of usable height |
| `detail` | Station and impact details | Bottom anchored; may start around 64% and expand |
| `tool` | Notifications, Reliability, Accessibility, Notices | Bottom-nav anchored, near-tall sheet |
| `modal` | Auth, commute create/edit, destructive confirmation | Above all shell layers; keyboard-safe |

If drag-to-resize is implemented, use explicit snap points and accessibility actions. Do not make dragging the only way to expand or dismiss a sheet.

### 3. Route-aware sheet state

Keep URLs/routes deep-linkable. Visual parity must not collapse navigation into unaddressable local booleans.

- Primary tabs map to a primary sheet state.
- Station and impact routes map to detail sheets.
- Notifications, Reliability, Accessibility, and Notices map to tool sheets.
- Auth and commute edit/create flows map to modal states.
- Browser-like navigation history should still allow `router.back()` to reveal the previous sheet/map state.

Write the route/sheet state table in code tests before converting the first feature screen.

## Design-system contract

### Color tokens

Align native dark-mode tokens with the current PWA values, keeping semantic names rather than screen-specific hex values.

| Semantic token | Target value / treatment |
| --- | --- |
| App/map backdrop | `#0d0808` where the raster does not cover |
| Strong panel | `rgba(10, 12, 16, 0.98)`; use an opaque native equivalent when needed |
| Panel | `rgba(10, 12, 16, 0.94)` |
| Raised row/card | approximately `rgba(255, 255, 255, 0.07)` or `#151821` |
| Chrome | `rgb(14, 16, 22)` |
| Text | `#f7f8fb` |
| Muted | `#aab1bd` |
| Quiet | `#747d8c` |
| Border | `rgba(255, 255, 255, 0.16)` |
| Strong border | `rgba(255, 255, 255, 0.26)` |
| Focus/cyan accent | `#38bdf8` family |
| Suspension/closed | `#ff4545` |
| Ordinary delay | `#ff9f1c` or the existing PWA delay-yellow where that exact category is used |
| Reduced Speed Zone | `#f59e0b` |
| Planned closure | `#4aa3ff` |
| Healthy/fresh | `#30d175` |

High contrast must remain a separate semantic theme. Do not derive it by merely increasing opacity. It needs black surfaces, white borders/text, solid category fills where required, and no reliance on shadow alone.

### Typography

The PWA uses Inter for interface text and JetBrains Mono for analytics/numeric presentation. Native parity should load licensed, checked-in font assets through Expo font loading and keep a platform fallback while fonts initialize.

Create semantic text styles rather than repeating `fontSize` and `fontWeight`:

| Style | Baseline intent |
| --- | --- |
| `displayStation` | 28–32sp, heavy, tight leading |
| `sheetTitle` | 20–24sp, heavy |
| `sectionTitle` | 11–12sp, heavy uppercase |
| `cardTitle` | 14–16sp, heavy |
| `body` | 12–14sp, readable 1.35–1.45 leading |
| `meta` | 9–11sp, heavy or semibold |
| `badge` | 9–11sp, heavy |
| `metric` | 13–16sp, mono with tabular-number behavior where available |

Support font scaling. Use `maxFontSizeMultiplier` only where an individual badge or compact control would become unusable, and provide the full accessible label separately.

### Spacing and geometry

- Base spacing unit: 4dp.
- Common gaps: 4, 6, 8, 10, 12, and 16dp.
- Sheet outer inset: 8dp.
- Sheet internal padding: 12dp.
- Card/row radius: 6–8dp.
- Compact icon-button visual size: 34–40dp within at least a 44dp hit target.
- Bottom nav: 16dp side inset, 74dp visual height, platform-safe bottom offset.
- Primary sheet bottom edge: above the complete bottom-nav occupied height.
- Status peek: inset more narrowly than the nav, wraps category chips, and never clips text horizontally.

### Borders, shadows, and glow

- Use one-pixel-equivalent borders on panels and rows.
- Reserve colored left rails for impact severity and affected commute/station cards.
- Use the PWA chrome shadow family for floating nav, status peek, and sheets.
- Use cyan glow only for section rails/focus and not as a generic card decoration.
- Do not use gradients or glow to replace semantic color labels.

### Icons and route identity

- Replace emoji controls such as `🚆`, `☀`, `↻`, and `🔍` with local React Native SVG icons.
- Reuse a consistent 1.8–2dp stroke, rounded-cap icon language.
- Preserve official route colors and the PWA badge shapes: circles for TTC; rounded squares/route marks for regional corridors.
- Copy only project-owned or appropriately licensed assets. Keep acknowledgements with any new bundled assets.

## Implementation sequence

Each slice should leave the app runnable and verified. Do not begin screen-by-screen pixel tuning before Slices 0–3 are stable.

### Slice 0: Freeze the baseline and golden matrix

Deliverables:

- Record the current native screenshots for Map, Status, Search, signed-out Commutes, signed-out More, TTC station detail, and regional station detail.
- Record reference crops from the PWA images at matching logical widths.
- Add a parity checklist under `mobile/` or `docs/` that records device, viewport, theme, network, auth state, data scenario, and expected sheet.
- Define deterministic demo/scenario data for screenshots; do not depend on a changing live poll.
- Add Maestro screenshot flows for the primary states even if visual comparison is manual initially.

Acceptance:

- A future implementer can reproduce the same before/after images without guessing environment state.
- The comparison matrix includes at least 360dp compact Android, approximately 393dp modern portrait, 432dp large portrait, and one landscape case.

### Slice 1: Tokens, fonts, icons, and primitives

Primary files:

- `mobile/src/theme/tokens.ts`
- `mobile/src/theme/theme-provider.tsx`
- new `mobile/src/theme/typography.ts`
- new `mobile/src/components/operations-*`
- `mobile/src/components/tab-icons.tsx`

Deliverables:

- PWA-aligned semantic colors, typography, spacing, elevation, and geometry.
- Inter and JetBrains Mono initialization with a tested loading/fallback path.
- Shared SVG icon components.
- Shared card, row, header, section, badge, segmented-control, and icon-button primitives.
- A development-only component gallery or focused Jest render coverage for every primitive/state.

Acceptance:

- Existing feature screens can adopt the system without hard-coded duplicate hex values.
- Dark and high-contrast variants render all primitives.
- All interactive primitives expose at least a 44dp target and correct accessibility role/state.

### Slice 2: Persistent shell and bottom navigation

Primary files:

- `mobile/src/app/(tabs)/_layout.tsx`
- `mobile/src/features/dashboard/dashboard-screen.tsx`
- new `mobile/src/features/shell/*`

Deliverables:

- One persistent `SchematicMap` beneath all primary tab scenes.
- Transparent tab scenes that host sheets rather than black full pages.
- Floating 5-item bottom-nav capsule with one animated active glider.
- Correct safe-area and keyboard visibility behavior.
- Explicit Android back and active-tab reselect behavior.

Acceptance:

- Switching Map → Status → Commutes → Map keeps camera, zoom, network, selection, and marker preference.
- Dashboard query observer count and network requests do not multiply per tab.
- Bottom-nav labels and badges do not clip at supported font scales.
- No screen has unexplained empty black space above or below its content.

### Slice 3: Map chrome parity

Primary files:

- `mobile/src/features/dashboard/map-dashboard-chrome.tsx`
- `mobile/src/features/dashboard/selected-impact-preview.tsx`
- `mobile/src/features/map/schematic-map.tsx`
- `mobile/src/features/map/raster-map-plane.tsx`

Deliverables:

- Remove the native-only `LineWatchTO` brand chip from the map viewport.
- Replace the large legend rail with the PWA compact 36dp rail and 24dp badges.
- Add expanded legend behavior with line/corridor name, state, impact count, and collapse affordance.
- Match the PWA top utility cluster: display mode, orientation/rotate action, and information control. If map rotation is not implemented in the same slice, the control must not falsely suggest it works; deliver rotation as part of this slice or omit it until functional.
- Match the compact vertical TTC / GO & UP selector.
- Rebuild the status peek with wrapping count chips, correct category colors, freshness state, and a 60dp visual recenter control inside a 44dp-or-larger target.
- Preserve selected-impact preview positioning across dynamic peek height.
- Match initial map framing and visual scale for TTC and regional assets on all golden widths.
- Replace the current technically functional but awkward pan/zoom behavior with a polished interactive-map gesture model.
- Pinch zoom must stay anchored beneath the user's fingers instead of zooming around the canvas center or visibly jumping when the gesture begins.
- Panning must work naturally at every zoom level, including diagonal movement and two-finger translation during a pinch.
- Allow a small, deliberate amount of elastic overscroll at the bounds, then settle smoothly to a valid position. Do not hard-stop or repeatedly snap while the gesture is active.
- Add velocity-aware pan momentum with bounded decay, while keeping reset and programmatic centering deterministic.
- Use a useful zoom range: the fitted network overview is the normal minimum, while the maximum must make individual stations, labels, impact rings, and short segments comfortably inspectable.
- Preserve the visual point under the fingers when transitioning between one- and two-finger gestures. Adding or removing a finger must not cause a camera jump.
- A quick tap must continue to select a station/segment; a pan or pinch must not accidentally activate the item beneath the gesture.
- Map hit testing must remain aligned with rendered stations and segments after every scale and translation.
- When an overlay sheet changes height, do not silently reset the camera. Recenter only after an explicit Center Map action or an intentional station/impact focus action.
- Reset must animate smoothly to the correct network-specific fitted extent and remain interruptible by a new gesture.
- Resolve gesture ownership between the map, floating sheet, legend, status peek, and bottom navigation so a map gesture never drags a sheet and a sheet scroll never moves the map.

Acceptance:

- No count chip truncates or requires horizontal scrolling in the golden scenarios.
- Legend and controls never overlap each other, operating-hours announcements, system safe areas, or a visible sheet.
- Pan/zoom remains on the UI thread and visually smooth under sustained pinch and pan input.
- A user can move from the fitted network overview to a specific station or short segment in one continuous pinch/pan sequence without fighting bounds, jumps, premature clamping, or unintended selections.
- Gesture behavior is tested on at least one physical or hardware-accelerated Android device, not only through synthetic Jest events or a mouse-driven emulator.
- Estimated markers remain conservative schematic placements and remain hidden during closed hours.

### Slice 4: Shared sheet mechanics and Status hierarchy

Primary files:

- new shared sheet components
- `mobile/src/features/alerts/alerts-screen.tsx`
- `mobile/src/features/alerts/alert-filter-bar.tsx`
- `mobile/src/components/line-status-list.tsx`
- `mobile/src/components/alert-card.tsx`

Deliverables:

- `OperationsSheet` variants, header, close/back, scroll, refresh, and snap/expand behavior.
- Status opens to the PWA overview: network context, freshness, category grid, and line-status rows.
- Category cards route to dense category lists; do not dump all alert cards into the overview first viewport.
- Planned closures retain Today / This weekend / Later grouping in their detail view.
- Line rows expose impact counts and healthy state with correct route colors.
- Impact cards retain map-selection linkage and source labels.

Acceptance:

- Status overview composition matches `03-system-status.png` before category details are judged.
- Selecting an impact from a card or map opens the same typed detail state.
- Closing Status reveals the unchanged map.

### Slice 5: Search, My Stations, and station detail

Primary files:

- `mobile/src/features/stations/stations-screen.tsx`
- `mobile/src/features/stations/station-detail-screen.tsx`
- saved-stations provider and existing station tests

Deliverables:

- Search becomes a primary floating sheet with sticky search, network/line filters, saved entry point, result count, and dense station rows.
- My Stations becomes a focused saved-station sheet instead of only a filter chip experience.
- Station detail becomes a map-anchored detail sheet with drag handle, save action, large station name, route/direction rows, jump grid, and dense operational sections.
- TTC and regional station details share structure but keep network-specific capabilities.
- Arrival sources, availability, cancellation annotations, accessibility outages, and surface connections remain source-honest.
- Opening a station from search or the map centers/highlights it without destroying the prior camera for back navigation.

Acceptance:

- TTC detail visually follows `04-ttc-station-details.png`.
- Regional detail visually follows `Screenshot_20260825-025853.png`.
- Saved-station presentation follows `07-my-stations.png` for signed-in data and has a deliberate signed-out/empty state.
- Keyboard opening keeps search and results usable and hides/repositions the bottom nav according to the shell contract.

### Slice 6: My Commutes parity

Primary files:

- `mobile/src/features/commutes/commutes-screen.tsx`
- `mobile/src/state/commutes-provider.tsx`
- commute tests

Deliverables:

- Convert Commutes to a PWA-like primary sheet.
- Signed-out state uses the shared account-feature preview and fills the sheet intentionally.
- Signed-in header contains network/all filtering, affected count, sort control, and Add Route.
- Route cards adopt the PWA hierarchy: label and impact total, network/state badges, endpoint stack, outbound/return leg selector, current verdict, station/time summary, confidence label, typical-versus-impacted estimate grid, and collapsible impact list.
- Create/edit remains a native modal flow but uses shared fields and row styles.
- Preserve return-leg semantics, route notification rules, and low-confidence wording.

Acceptance:

- The first affected route card matches the visual reading order in `06-my-commutes.png`.
- Clear, affected, unreliable, and filtered routes are distinguishable without relying on color alone.
- Train cancellations do not alter commute travel-time estimates.

### Slice 7: More, auth, and Notifications parity

Primary files:

- `mobile/src/features/more/more-screen.tsx`
- `mobile/src/features/more/account-section.tsx`
- `mobile/src/features/more/notifications-section.tsx`
- auth and push providers

Deliverables:

- Convert More to the accent-strip sheet in `12-more.png`.
- Signed-in default view uses compact grouped icon rows for identity, sign out, Google link state, My Commutes, My Stations, default map, Notifications, and remaining tools.
- Signed-out default view shows a compact account entry row; the full sign-in/register form moves to a focused auth modal/sheet.
- Move full notification preferences to their own tool sheet.
- Notification sections match `08-notification-settings.png`: device state, commute alerts, closure reminders, network subscriptions, event types, and timing policy.
- Preserve platform-specific native notification permission/setup states.
- Documentation, attribution, privacy, and external resources remain reachable below higher-priority operational controls.

Acceptance:

- The first More viewport is useful account/operations UI, not a long auth form.
- Notification switches report accurate account intent and current-device state.
- Google configuration awareness and link status remain correct.

### Slice 8: Reliability, Accessibility, Notices, and impact detail

Primary files:

- `mobile/src/features/reliability/reliability-screen.tsx`
- `mobile/src/features/accessibility/accessibility-outages-screen.tsx`
- `mobile/src/features/notices/notices-screen.tsx`
- `mobile/src/features/alerts/impact-detail-screen.tsx`

Deliverables:

- Convert all four to shared tool/detail sheets.
- Reliability uses compact line/corridor cards, mono numeric metrics, coverage/confidence copy, and the PWA stacked incident-hours breakdown.
- Accessibility and Notices reuse the same section heading, network switch, data-state, filter, row, empty, and error primitives.
- Impact detail uses the same route badge, severity rail, source, timing, segment/station identity, and map action language as its originating card.

Acceptance:

- Reliability's information order matches `11-reliability-analytics.png` without losing current API fields.
- Accessibility outages and surface notices remain separate from status, route matching, overlays, reliability, and push behavior.
- Regional trip-change wording does not imply complete or equivalent UP coverage.

### Slice 9: Cross-network, high-contrast, accessibility, and motion pass

Deliverables:

- Audit every golden screen in TTC and GO & UP.
- Audit dark and high-contrast themes.
- Audit 320–360dp compact widths, large portrait, landscape, keyboard-open states, and at least 200% font scaling where platform tooling allows.
- Add reduced-motion handling for nav glider, sheet entry, legend pulse, and selection animation.
- Verify VoiceOver/TalkBack focus order, selected/expanded states, modal focus containment, escape/back actions, and readable labels.
- Remove layout-only `adjustsFontSizeToFit` where it makes text illegibly small; reflow instead.

Acceptance:

- Every control remains usable without color or animation.
- No sheet content sits underneath the nav, home indicator, keyboard, or status bar.
- Regional screens look like LineWatchTO rather than a TTC layout with labels swapped.

### Slice 10: Visual regression and final polish

Deliverables:

- Re-capture the entire golden matrix with deterministic data.
- Compare native and PWA images side by side and as 50% opacity overlays.
- Fix remaining alignment in this order: composition, panel bounds, typography, spacing, controls, borders/colors, then decorative motion.
- Add stable screenshot flows to Maestro for all primary sheets and representative detail/tool sheets.
- Add structural Jest assertions for shell persistence, route/sheet mapping, dynamic bottom offsets, wrapping chips, and compact-width reflow.
- Update `docs/mobile-implementation-handoff.md` and the repository reality statement only after verified completion.

Acceptance:

- Key chrome positions are within about 2dp of the approved logical layout at matching widths.
- Major sheet/card bounds and spacing are within about 4dp.
- Semantic colors match the design tokens exactly.
- Text wrapping may differ by one line only when caused by platform font rasterization or accessibility scale, not by arbitrary width differences.
- There are no obvious native-only generic-page patterns left in the five primary tabs.

## Screen acceptance matrix

Every row should be captured in dark mode; rows marked HC also need high contrast.

| Flow | Network/state | Required checks |
| --- | --- | --- |
| Map default | TTC fresh demo, HC | Chrome, legend, status peek, nav, map framing |
| Map selected impact | TTC segment and station | Overlay, preview, details route, camera preservation |
| Map gestures | TTC and regional at minimum/mid/maximum zoom | Focal pinch, diagonal pan, momentum, bounds, finger-count transitions, tap cancellation, reset |
| Map markers | TTC open and closed hours | Marker source label, operating-hours gate |
| Map regional | GO & UP fresh demo, HC | Corridor legend, selector, regional framing |
| Status overview | TTC mixed impacts, HC | Category grid, line rows, freshness |
| Status details | Every impact category | Correct colors, filters, source, closures timeline |
| Search | TTC and regional | Keyboard, filters, saved state, empty results |
| Station detail | TTC interchange, regional shared station, HC | Map anchor, jump grid, arrivals/outages/connections |
| Commutes | Signed out | Account preview and auth route |
| Commutes | Signed in affected/clear | Route hierarchy, legs, timing, impacts |
| More | Signed out and signed in, HC | Priority hierarchy, auth modal, grouped rows |
| Notifications | Permission off/on, configured/unconfigured | Device/account distinction, switches, subscriptions |
| Reliability | TTC and regional | Coverage/confidence, line metrics, breakdown |
| Accessibility | TTC and regional | Grouping, empty/error, source honesty |
| Notices | TTC service notice and regional trip change | Network-specific tabs and wording |

## Testing strategy

### Component and contract tests

Keep existing API/schema tests. Add focused tests for:

- Shell stays mounted across tab changes.
- Dashboard data is observed once at the shell layer.
- Network switching updates map and visible sheet together.
- Sheet state derives from route state.
- Close/back/reselect behavior.
- Dynamic nav, status-peek, preview, and sheet offsets.
- Chip wrapping at compact widths.
- Pan/zoom math for focal-point preservation, bounded decay, elastic settling, network-specific fitted extents, and hit-test coordinate conversion.
- Gesture-state transitions that distinguish taps from pans/pinches and do not jump when finger count changes.
- Signed-out versus signed-in More and Commutes hierarchy.
- High-contrast semantic styles and accessibility state props.

Avoid large Jest snapshots of React Native style objects. Assert semantic tokens, visible hierarchy, roles, states, and test IDs.

### Maestro flows

Retain existing smoke flows and add:

- Map → Status → category → impact detail → back → map.
- Map fitted view → pinch into a station cluster → diagonal pan → select station → close detail → reset map.
- Begin a pinch, add/remove a finger, and continue panning without a camera jump or unintended station selection.
- Map station → station detail → save → My Stations.
- Search with keyboard → station detail → back with query retained.
- Commutes signed-out → demo login → affected commute.
- More → auth → back; More → Notifications → network subscription.
- TTC ↔ GO & UP switching while a primary sheet is open.
- Theme switch with persistence after relaunch.
- Rotate/orientation flow if map rotation is delivered.

### Visual comparison workflow

For each golden capture:

1. Use the same logical viewport width, theme, network, and deterministic data scenario.
2. Crop out OS-only status/navigation areas if the PWA image does not include an equivalent region.
3. Place PWA and native side by side.
4. Overlay at 50% opacity.
5. Record mismatches by category: shell, typography, spacing, component, color, behavior.
6. Fix shared primitives before adding screen-local exceptions.

Do not accept a screen based only on a developer simulator screenshot. At least one physical or hardware-accelerated Android development build should be checked for map and sheet performance.

## Performance guardrails

The native app's speed and smoothness are strengths and must survive the parity pass.

- Keep one raster map and avoid full-screen blur layers over an actively animating map.
- Prefer opaque or lightly translucent native surfaces when blur would cause frame drops.
- Keep pan/pinch and map transforms in Reanimated/worklets.
- Keep per-frame clamping, focal-point math, velocity decay, and elastic settling off the React render path.
- Do not send React state updates for every gesture frame; commit only the durable camera state needed outside the worklet layer.
- Do not put the map inside a vertical `ScrollView`.
- Use `FlatList` for large station/impact collections and preserve stable keys/render callbacks.
- Avoid nested vertical scroll views inside a draggable sheet unless gesture ownership is explicit and tested.
- Do not refetch merely because a sheet opened or a tab received focus if the shell already owns valid data.
- Memoize derived map overlays and route/station lookup maps.
- Test release/development-build behavior; Expo Go timing is not the performance baseline.

## Constraints and non-goals

- No backend schema or endpoint changes unless a parity state is impossible with the existing contract and that gap is documented first.
- No cross-network commute routing.
- No email notifications.
- No invented realtime, exact-position, accessibility-completeness, or reliability claims.
- No wholesale replacement of TanStack Query, Expo Router, providers, raster map assets, or the tested map interaction math.
- No PWA regression work is part of this phase unless a shared asset or documented visual value is incorrect.
- No marketing landing page, onboarding carousel, or decorative splash should replace the usable map-first first screen.
- Do not make every screen visually identical at the expense of network-specific truth.

## Verification gates

Run and read these checks after every implementation slice that changes mobile code:

```bash
npm --prefix mobile run typecheck
npm --prefix mobile run lint
npm --prefix mobile test
```

Run the full gate at the end of every phase and before calling parity complete:

```bash
npm --prefix mobile run typecheck
npm --prefix mobile run lint
npm --prefix mobile test
npm --prefix mobile run doctor
npm --prefix mobile run export:android
```

Backend tests are required only if backend/session transport code changes:

```bash
mvn -f backend/pom.xml test
```

## Completion checklist

- [ ] The map remains mounted across all primary tabs.
- [ ] All five primary tabs use the shared operations shell.
- [ ] Map chrome matches the PWA composition and does not clip.
- [ ] Pan, focal-point pinch zoom, momentum, bounds, reset, and hit testing feel like a polished interactive map on a real device.
- [ ] Status is an overview-first sheet with category detail flows.
- [ ] Search and station details are map-anchored sheets.
- [ ] My Stations has a first-class PWA-aligned sheet.
- [ ] Commute cards match the PWA information hierarchy.
- [ ] More prioritizes compact operational/account rows.
- [ ] Auth is a focused child flow rather than the default More viewport.
- [ ] Notifications is a dedicated settings sheet.
- [ ] Reliability, Accessibility, Notices, and impact detail share the tool/detail sheet language.
- [ ] TTC and GO & UP pass the full screen matrix.
- [ ] Dark and high-contrast themes pass.
- [ ] Compact width, large font, keyboard, landscape, and safe-area states pass.
- [ ] VoiceOver/TalkBack semantics pass.
- [ ] Existing data, auth, push, station, commute, and map tests pass.
- [ ] Maestro primary journeys and screenshot captures pass.
- [ ] Android export succeeds.
- [ ] Final native/PWA overlay review has no unresolved structural mismatch.

## Instruction to the implementing agent

Start with Slice 0 and proceed in order. Before each slice, inspect the named native files and the corresponding PWA component/CSS implementation. Preserve working feature behavior and tests. Prefer shared primitives over local style patches. Do not report a slice complete based solely on typecheck or Jest; capture and inspect its golden screens. If a structural decision would change routing, deep links, map lifetime, or back behavior beyond this plan, document the decision and its tradeoff before implementing the dependent screens.
