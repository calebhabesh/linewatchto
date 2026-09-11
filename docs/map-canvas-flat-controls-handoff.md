# Navy map canvas and flat controls: Gemini implementation handoff

Prepared 2026-09-11 for Gemini 3.8 Flash. This document is the implementation prompt. The design direction is approved; application changes have not been made as part of this handoff.

## Task and scope

Refine the Next.js dashboard in `frontend/`: introduce a muted navy map canvas in normal dark mode and unify the floating front-screen controls with opaque, flat charcoal surfaces and soft drop shadows. Apply the treatment to mobile web/PWA and desktop, in both TTC and GO/UP modes.

Also relocate the mobile closing-soon/closed notice into the Current Service pull-up sheet, with the small spacing and typography refinements specified below.

Refine the sheet's detailed service list, correct unsupported unaffected-line status labels, and add surface-notice category icons and route-search relevance ordering as specified below. These additions include frontend behavior changes as well as styling.

Read [AGENTS.md](../AGENTS.md), inspect the current working tree, and build on the ongoing mobile refactor. The [previous mobile menu handoff](mobile-menu-header-layout-handoff.md) provides context; this brief supersedes its front-screen surface guidance only where necessary. Preserve current layouts and interactions except for the explicitly approved sheet refinements below. The separate Expo application in `mobile/` is outside this task.

Implement a reviewable first pass, then perform the appropriate final validation. No deployment or commit is requested.

## Approved visual direction

The reference is Google Maps in dark mode: a blue-toned map beneath neutral charcoal floating controls, with darker sheets below. Adopt that surface separation while retaining LineWatchTO's transit identity. The reference is inspiration, not a request to reproduce Google's branding, geographic map, navigation, or control placement.

| Surface | Treatment |
| --- | --- |
| Normal dark map canvas | Muted, low-saturation navy; start at `#192638` and refine after viewing both networks |
| Floating map controls | One opaque neutral charcoal/slate material, coordinated with the existing flat search bar and shortcut pills |
| Menus, sheets, dialogs, cards, bottom navigation | Retain the existing visionOS/slate treatment and established surface hierarchy |
| Light mode | Retain the light map palette; use an equivalent opaque light control material with appropriate shadows |
| High-contrast mode | Retain the black canvas and explicit high-contrast boundaries, text, and focus indicators |

The navy value is a starting point, not an exact sampled Google color. Keep it subdued enough for TTC line colors, GO corridors, station labels, and service overlays to dominate. Do not recolor every application surface blue or globally replace panel tokens.

## Floating control treatment

Inventory the actual visible controls in the current checkout. Include the mobile legend pill, info button, map mode/network switcher, View Trains toggle, and equivalent desktop controls. Include existing floating map utility actions such as rotation, recentering, or zoom where present. Use the existing search bar and shortcut pills as the visual reference and consolidate their material tokens where needed without redesigning them.

- Use a shared opaque fill, foreground palette, subtle boundary, and outward shadow. Remove decorative gradients, backdrop blur, inset highlights, and bevel effects from these outer control surfaces.
- Keep circles, pills, and segmented controls in their existing appropriate shapes. Uniform material does not require identical geometry or dimensions. Preserve current spacing, positions, safe-area offsets, and touch targets.
- Give each independent floating surface one shadow. A segmented switcher gets an outer shadow; its segments do not each need elevation. Likewise, avoid separate shadows on every row inside the expanded legend.
- Preserve obvious hover, pressed, selected, disabled, and keyboard-focus states. Toggles must remain visibly distinguishable when enabled. Keep existing semantic network/state accents, but render selected control fills flat instead of glossy.
- Keep authored route badges, line colors, service indicators, alert counts, and their semantics intact. Flattening the control container does not mean removing status signals or replacing transit identity with grey.
- Keep the legend's outer material consistent when expanded; retain its information hierarchy and interaction. Info dialogs, menus opened by controls, and search result containers retain their existing menu treatment.
- Restrict changes to front-screen instances when a component or selector is also used inside menus. Do not flatten all buttons throughout the app.

Prefer the current computed search/pill fill if it already works. If it needs adjustment, a neutral charcoal around `#34363A` is a reasonable trial value. Use readable off-white text and icons. A starting shadow is `0 2px 5px rgb(3 7 14 / 28%), 0 6px 16px rgb(3 7 14 / 24%)`; tune it against the actual navy canvas. These are proposed implementation values, not mandatory final tokens. Avoid colored glows or heavy black halos.

## Mobile operating-hours notice and sheet refinements

Move the existing subway closing-soon/closed notice into the **Current Service pull-up sheet**, immediately below the header row and above the alert-type badge grid. This relocation is for mobile web/PWA; preserve the existing desktop notice placement. Apply the shared sheet spacing consistently across networks, while keeping notice eligibility and wording network-specific. Do not show a TTC subway notice in GO/UP mode or invent new regional operating-hours logic.

Intended order:

```text
                    drag handle

Current Service       LIVE       22 Impacts

moon/clock  Subway closing soon           chevron

[ Active Alerts       ] [ Delays          ]
[ Reduced Speed Zones ] [ Planned Closures ]

------------------------------------------------
       Map       Status       Saved       More
```

The count and badge values remain dynamic. LIVE describes data freshness, not whether trains are operating; retain its existing freshness logic and keep it visually distinct from the operating-hours notice.

### Approved spacing adjustments

Treat these measurements as small starting deltas from the current layout, then inspect the result at real viewport sizes:

- Reduce the bottom navigation height by about **4px**, preserving safe-area padding and comfortable touch targets. Update any dependent occupied-height/layout tokens together so content is not obscured.
- Move the alert-type badge grid down about **4px**, retaining roughly **10–12px** between its bottom edge and the navigation divider. Keep the existing grid and button sizing; do not squeeze the buttons to accommodate the notice.
- Move the entire header row up about **4–6px**, including LIVE for alignment. Increase **Current Service** and **22 Impacts** text by about **1–2px**, while keeping LIVE compact. Cap typography responsively on narrow screens so the header stays on one line without collisions.
- Leave the drag handle in place and preserve breathing room and its drag target above the header. Do not move text into the handle area.
- Make the notice a slim, softly tinted full-width row, starting around **36–40px** tall, with roughly **8px** above and below. Align its outer edges with the badge grid. Preserve an adequate touch target and allow height to grow for enlarged text rather than clipping content.
- Soften the bright divider above the bottom navigation to a subtle separator in normal themes; preserve a sufficiently clear boundary in high-contrast mode.

These adjustments alone do not create enough space for the notice. Let the sheet expand **upward** by the remaining required height when it appears, keeping the badge grid and bottom navigation at their newly adjusted positions. When neither closing-soon nor closed applies, omit the notice and its reserved spacing and return to the refined compact sheet height. Use the existing sheet sizing/detent system rather than absolute-positioning the row over other content. Preserve manual sheet interaction and avoid resetting the map camera when the notice changes.

Keep the notice visible in the default peek state. If the existing sheet supports a further minimized state with a service label, a compact moon indicator beside that label can preserve awareness; do not add a new detent solely for this task.

### Notice appearance and behavior

- Closing soon: moon/clock icon, **Subway closing soon**, subtle amber tint/accent.
- Closed: moon icon, **Subway service is closed**, quieter neutral treatment.
- Include a trailing chevron and open the existing operating-hours explanation/details when activated. Preserve existing published timing/countdown information in the details and reuse current state calculations.
- Use modest rounding and a flat tinted fill; avoid a new glowing alert card. Retain the surrounding sheet's existing slate material.
- Do not count this notice as a disruption or modify impact totals, source freshness, operating windows, train-marker suppression, or notification behavior.

### Remove stale top-of-map containers

**Remove the old mobile closing-soon AND closed container placements currently left beneath the search bar/in the former top-left announcement area.** This is a relocation, not an additional copy. Do not leave an invisible mounted duplicate, empty wrapper, reserved gap, stale pointer target, or accessibility-tree duplicate there.

Trace both conditional render branches and their responsive styles. Remove obsolete mobile announcement offsets and modifier usage where they existed only to accommodate these notices, including legend/control displacement. Preserve offsets still needed by other announcements and preserve shared desktop markup/styles where applicable. The search bar, shortcut pills, legend, and map controls must not shift into legacy announcement positions when the operating-hours state changes.

Do not delete the underlying closing/closed details dialog or its business logic. Reconnect its existing action to the new sheet row. Verify closing soon, closed, dismissed-details, and normal-service states so neither old container resurfaces after dismissing details, switching networks, resizing, or changing themes.

## Current Service detailed list

Improve the information layout inside the mobile pull-up sheet while preserving the compact default peek and its padding. The reference screenshot shows timing squeezed into the alert heading, wrapping awkwardly, and unaffected lines displaying inconsistent labels such as Delayed, Normal, and Ready.

### Unaffected lines: Good Service

Investigate the line displaying **Delayed** even though it has no qualifying alert, delay, or planned closure. Trace `currentServiceSummary`, the unaffected-line calculation, freshness, and the status label source; do not merely hard-code that particular line or hide a real disruption. The current component renders `line.statusLabel` for unaffected lines, so verify whether an aggregate/legacy label is inconsistent with the eligible impacts.

When fresh, available service data establishes that a line has no qualifying alert, delay (including RSZ), or planned closure in the summary's existing time scope, display **Good Service** with a green check icon. Use consistent wording for genuinely unaffected lines instead of Normal or Ready. Retain honest unavailable/demo/stale states; absence of data alone must not produce Good Service. Preserve legitimate closed/not-operating states where applicable, and do not infer current service from a future closure outside the existing summary scope.

**Bottom-align the Good Service text with the green check icon**, with a small consistent gap. Inspect the actual glyph and icon alignment rather than relying only on their box dimensions. Keep the icon readable and prevent wrapping between it and the label.

### Three-row rail impact entries

Keep the route badge in its own left column and arrange each impact's content in three semantic rows:

1. **Alert-type icon and alert type.** Increase the type text modestly, starting around 1–2px above its current size. Make the icon approximately as tall as the visible text and vertically aligned. Preserve the actual category, including Planned Closure in Effect.
2. **Starts/ends timing.** Put the existing source-backed timing on a separate, quieter row. Preserve effective-window logic and appropriate Starts/Ends wording; avoid duplicate prefixes. Omit unavailable timing rather than inventing it or leaving a blank spacer.
3. **Stations/affected span and direction.** Put the location first, followed by direction when available. Allow natural wrapping on narrow screens; these are three content rows, not a requirement to truncate all content into exactly three physical lines.

Keep the full entry actionable with the existing detail/map selection behavior. Avoid clipping long station names at the scroll edge, and retain adequate right padding beside scroll indicators.

Move the grey explanatory text (“Active alerts, delays & planned closures starting within 24h”) slightly upward, and move **Subway & Light Rail** upward closer to that text. Start by reducing excess margins by roughly 4px and inspect both sheet sizes. Preserve their intended visibility in the default view; do not accidentally expose, hide, or clip content by breaking the default peek geometry. Keep the header legible without cramping the grid above it. Apply equivalent spacing to GO & UP Rail where the shared component is used.

## Surface-notice category icons and route search

Add category-specific icons alongside the existing text labels in Streetcar & Bus Notices. Cover the notice card category labels and the type filter's selected value/options where supported, and use the same mapping in Current Service surface rows. Reuse the existing icon library and available category conventions for Service Change, Bypass, Detour, No Service, and Notice; keep text labels and counts. The current summary already uses some icons, so consolidate that mapping rather than introducing an inconsistent second set. Keep icons decorative to assistive technology when adjacent text conveys their meaning. Preserve keyboard navigation, focus, and accessible naming in the filter control.

When the rider searches for a route, **direct route matches must appear before loosely related results**, even when Importance is selected. For example, searching `8` should put notices whose structured route IDs contain exactly route `8` first, including multi-route notices containing `8`. A notice about route `88`, or one mentioning an incidental `8` in its prose, must not outrank a direct route-8 match solely due to severity or recency.

Use structured route IDs and normalize whitespace/case without conflating distinct route numbers or suffixes. Rank exact route matches first; retain existing search matching for remaining results. Within the same relevance tier, honor the selected Importance/Most Recent order and a stable tie-breaker. Preserve active category filters. Empty queries retain the existing sort behavior, and clearing search restores it. Do not automatically change the user's selected sort control.

Update the sorting explanation while relevance ranking applies, for example “Route matches first, then importance and newest updates” or “Route matches first, then newest updates.” The current unconditional “Important first, then newest updates” must not misdescribe search ordering. Keep non-route searches honest to their actual ranking behavior.

This is surface-notice presentation/search work only: it must not introduce surface notices into rail status, maps, reliability, commute matching, or push notifications.

## Implementation map

Paths are relative to the repository root. Inspect the cascade and component usage before editing; some styles are distributed across responsive overrides.

| Area | Starting files |
| --- | --- |
| Theme and shared tokens | `frontend/src/styles/foundation/tokens.css`, `frontend/src/styles/foundation/themes.css` |
| Canvas and shell | `frontend/src/styles/shell/dashboard-shell.css`, `frontend/src/styles/map/base-map.css`, `frontend/src/styles/map/regional-map.css` |
| Floating controls and responsive overrides | `frontend/src/styles/shell/map-controls.css`, `frontend/src/styles/shell/map-mode-control.css`, `frontend/src/styles/shell/mobile-chrome.css`, `frontend/src/styles/shell/desktop-chrome.css`, `frontend/src/styles/shell/mobile-landscape.css` |
| Existing flat search/pills and sheets | `frontend/src/styles/shell/search-bar.css`, `frontend/src/styles/shell/mobile-sheets.css` and their actual component selectors |
| Operating-hours notice relocation | `frontend/src/styles/shell/subway-closed.css`, `frontend/src/styles/shell/mobile-chrome.css`, `frontend/src/components/MobileLegend.tsx`; trace the actual closing/closed render branches and Current Service peek markup from their callers |
| Detailed service list and status derivation | `frontend/src/components/CurrentServicePanel.tsx`, `frontend/src/app/current-service.ts`, `frontend/src/styles/shell/current-service.css` |
| Surface-notice icons, filters, and search ordering | `frontend/src/components/SurfaceNoticesPanel.tsx`, `frontend/src/app/surface-notice-data.ts`, `frontend/src/app/surface-notice-groups.ts`, `frontend/src/styles/panels/surface-notices.css`; trace any imported search/sort helpers |
| Legend | `frontend/src/styles/map/map-legends.css`, `frontend/src/components/NetworkMapLegends.tsx` |
| Control components | `frontend/src/components/MobileMapControls.tsx`, `frontend/src/components/DefaultMapModeControl.tsx` |
| Map rendering and generated assets | `frontend/src/components/RasterMapPlane.tsx`, `frontend/src/components/InteractiveTtcMap.tsx`, `frontend/src/components/InteractiveRegionalMap.tsx`, `frontend/src/app/transit-map.tsx`, `frontend/src/app/map-assets.ts`, `frontend/scripts/generate-map-rasters.mjs` |

Introduce a small semantic token family, such as `--map-canvas-bg` and `--map-control-*`, if existing tokens cannot express this scope safely. Define normal dark, light, and high-contrast values. Reuse these across desktop/mobile instead of introducing parallel hard-coded palettes. In particular, `--mobile-chrome-*` and panel/sheen tokens also serve other surfaces; changing them globally could unintentionally flatten menus and bottom navigation.

Trace the complete canvas paint path: shell, map viewport, SVG/raster planes, loading state, map-entrance wash, recenter feedback, and network/theme transitions. The new background must remain continuous during pan, zoom, rotation, loading, and switching networks. Avoid old black rectangles, canvas seams, or flashes.

There is a concrete asset concern: `frontend/scripts/generate-map-rasters.mjs` uses `#0d0808` for the dark regional `#regional-route-lw-div` stroke. Review its corresponding SVG/runtime styling and other background-colored masks or separators. A CSS canvas change alone may leave an old-colored seam in generated imagery. Preserve transparency and authored map geometry; change only background-dependent rendering colors where required. If baked colors change, use the existing generation workflow, inspect generated diffs, and keep source and generated rendering consistent. Do not blindly replace every black stroke or fill: many encode intentional station/route details. Inspect label halos against the navy as well.

Keep map camera logic, hit targets, overlay order, animation behavior, saved viewport state, and control persistence intact. Preserve source labels, freshness behavior, and the distinction between estimated train markers and physical train positions. The authorized frontend behavior changes are the notice relocation, accurate unaffected-line labels, and surface-notice search ranking; no backend/API or new data capabilities are requested.

## Review and acceptance criteria

1. Normal dark mode has a continuous muted navy canvas on desktop and mobile for both networks. Menus and sheets retain their current slate appearance.
2. Floating controls read as one flat charcoal family with consistent elevation. No isolated glossy/blurred control remains in that family, and selected states remain clear.
3. TTC yellow, green, purple, and orange routes remain legible. Check all GO corridors, especially darker blue, maroon, and brown routes, the UP badge, and blue planned-closure previews. Improve background-dependent contrast without casually changing authored route colors.
4. Station labels, accessibility symbols, red suspension overlays, orange delays, RSZ chevrons, selected paths/rings, and estimated markers remain readable. Check dense interchange areas as well as quiet map areas.
5. Existing search, legend expansion, info action, network/mode switching, and train toggle still work. Shadows are not clipped, focus rings remain visible, and disabled controls remain understandable.
6. Check narrow mobile portrait, mobile landscape/safe areas, and desktop. Preserve map/control spacing and sheet overlap behavior from the ongoing refactor.
7. Light and high-contrast modes remain coherent. High contrast must not depend on a subtle shadow to communicate control boundaries.
8. Mobile closing-soon/closed notices appear once, in the Current Service sheet between its enlarged header and badge grid. The sheet grows upward only as needed; normal service leaves no empty notice slot. The refined navigation height, grid spacing, and softened divider remain comfortable at narrow widths and enlarged text sizes.
9. Both obsolete mobile top-left/search-bar notice containers and their unused layout reservations are removed. Verify normal, closing-soon, and closed states, details opening/dismissal, network switches, and viewport/theme changes. Desktop notices and network-specific operating-hours behavior remain intact.
10. Detailed rail impacts show type/icon, timing, and stations/directions in separate content rows. Unaffected fresh lines show Good Service with a bottom-aligned green check; stale/unavailable data and genuine disruptions do not show a false all-clear. Introductory text and rail headings have tighter spacing without breaking the default sheet view.
11. Surface-notice categories have consistent icons and text in the list/filter/summary. Searching route `8` prioritizes exact structured route-8 notices over loose matches regardless of their severity; selected sorting still applies within relevance tiers, filters remain effective, and the sort explanation matches the result order.

Capture representative before/after views of TTC and GO/UP on mobile and desktop. Also inspect at least one open menu/sheet per network to confirm the scope stays contained. Use available fixtures/scenarios for impact states and label them honestly; do not enable ingestion just to review colors.

## Verification and delivery

Follow the repository's two-stage verification policy. During visual iteration, use focused browser inspection; do not run broad suites after every color adjustment.

For the finished shared theme/control styling change, run `npm --prefix frontend run test:visual` and inspect differences before accepting baseline updates. Include focused browser checks for the affected control interactions and responsive layouts. If TypeScript or behavior changes, also run `test:fast`, `typecheck`, and `lint` once. Add a production build or broader smoke/E2E coverage when actual integration/shared-shell behavior changes justify it, as specified in AGENTS.md. For changed generated map assets, run relevant map-asset/raster checks and inspect both render paths. Avoid tests that merely assert the new hex values.

The notice relocation warrants regression coverage for its conditional visibility, single mobile placement, details action, and disappearance during normal service. Use deterministic operating-hours scenarios or a controlled clock; do not rely on the actual time of day. Inspect sheet peek/expanded states and bottom safe areas with the notice present and absent. Do not write brittle assertions for incidental pixel deltas.

The added status/search work requires `test:fast`, `typecheck`, and `lint` for the finished frontend change. Add meaningful regression tests for the unsupported Delayed label, fresh unaffected lines, real delays/RSZ/closures, stale/unavailable data, exact route matches versus partial/prose matches, multi-route notices, sort tie-breaking, active filters, and clearing the query. Inspect the three-row layout and icon/filter accessibility at narrow widths and enlarged text sizes. Reuse existing tests where they already cover a case.

Deliver a concise account of the chosen tokens, affected surfaces, representative screenshots, checks run, and any unresolved issues. Distinguish an implementation awaiting visual review from a validated finished change. Do not claim tests passed when they were skipped.
