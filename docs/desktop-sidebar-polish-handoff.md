# Desktop sidebar polish — implementation handoff

Approved design: September 17, 2026. Intended implementer: Gemini 3.8 Flash.
This document specifies agreed behavior; implementation and browser validation remain pending.

## Outcome and scope

Build a consistent desktop sidebar for the usable map/status dashboard. Every destination shares its width, global search, inner alignment, and scrolling contract. Desktop search uses a single-pane Lines → List flow. Exactly one applicable desktop operating/connection banner is visible, including when the sidebar collapses.

Scope is desktop web. Reuse mobile presentation and navigation patterns while preserving mobile behavior. Preserve network-specific capabilities, account behavior, provider gates, map geometry, and freshness semantics. No new dependencies are expected.

Additional approved scope: enlarge the desktop TTC legend, slightly enlarge and reposition the GO/UP legend, and slightly reduce TTC alert-type count bubbles. These changes belong to the final desktop composition after sidebar geometry is stable.

Read [frontend guidance](../frontend/AGENTS.md) before implementation. For notice state and commute draft work, consult the affected sections of [domain invariants](domain-invariants.md). Before browser checks, read [testing](testing.md). If changing source claims beyond this presentation work becomes necessary, first read [source launch gates](source-licensing-launch-gates.md).

## Approved interaction contract

| Area | Required behavior |
| --- | --- |
| Width | Every expanded desktop destination targets 560px, excluding the 80px navigation rail. Destination changes never resize the sidebar. |
| Alignment | Global search, view toolbar/filter console, and content cards share 16px inner gutters and the same available width. Scrollbar allocation must not offset the card edges from the controls. |
| Responsive layout | Retain the 768px desktop breakpoint and existing overlay model. Dock at 1120px and above (80 rail + 560 sidebar + 480 map). Below that, sidebar width is `min(560, viewportWidth - 80 - 160)`, retaining 160px exposed map. |
| Scrolling | App header, global search, and the applicable shared notice remain outside the view scroller. Each view has one main vertical scroller. Its compact title/Back row stays visible; large search/filter/sort consoles scroll with content. |
| Global search | Present on every expanded desktop menu/submenu, including station/impact detail and commute editing. Remove the Search rail entry. Focus alone does not navigate; typing or Enter opens search. Enter on an empty input opens the lines browser. |
| Search return | Back restores the originating view, selected detail, local filters, scroll, and focus. Preserve unfinished commute drafts in memory during search; search does not save, submit, or discard them. |
| Escape | Close a suggestion popup first if open; otherwise return from search. Preserve existing modal/editor Escape handling outside search. |
| Local search | Keep useful collection filters with explicit scope, e.g. “Filter saved stations.” Local filtering does not change the global search query. |
| Lines/List | List View replaces the line-selection pane with the selected line's stations. Show “Back to Lines” above the list. Back restores line-browser query, filters, scroll, and focus. Station-detail Back returns to that station list before leaving search. |
| Source status | A standalone rail entry beneath the network/map-mode switcher opens a normal sidebar destination. Use “TTC Source Status” or “GO / UP Source Status” according to the current network. Remove diagnostics from More. |
| More | Flat option rows and section headings/separators, without persistent highlighted group containers. Preserve appropriate styling for switches, segmented choices, buttons, and actual data content. |
| Informational rows | Accessibility, Surface Notices/Service Notices, and Announcements under Alerts & Notices use flat full-width rows with icons, applicable counts, and chevrons. Preserve the four colored alert-type pills. |
| My Commutes | Remove the decorative outer white border/shadow when embedded in desktop sidebar. Preserve focus rings and meaningful high-contrast boundaries. |

Do not introduce new URL/history semantics merely to implement sidebar Back. Integrate with the existing navigation mechanism; verify existing browser Back/deep-link behavior remains functional. Search is a transient destination without its own rail entry; retain the originating destination's rail context while searching.

## One desktop notice owner

Use one shell-owned notice selection and placement decision, with shared presentation derived from the existing mobile banner. It must cover all desktop destinations, rather than Status alone.

Priority: an applicable connection notice wins over an operating notice; otherwise show closing/closed when applicable; otherwise render no banner. A fixture/demo state by itself is not a connection failure. Preserve existing network-specific labels, timestamps, actions, and provider/freshness gates.

| State | Placement and appearance |
| --- | --- |
| Expanded sidebar | Immediately below global search, above the active view. |
| Collapsed sidebar | One map notice using the same presentation and content. |
| Subway/network closing or closed | Mobile-style yellow container with dark text and the existing appropriate action. |
| Connection unavailable, degraded, reconnecting, or retained offline snapshot | Mobile-style black container with yellow outline and truthful existing connection copy/action. |
| Closed and connection problem together | Connection banner only. No secondary closed chip/banner or scheduled-information banner. |

Retire the independent desktop purple Status banner, desktop closing/closed map chips, stale/reconnecting pill, and any competing desktop global availability notice where this owner replaces them. Render one notice instance rather than two visually hidden copies or duplicate live regions. Keep mobile notice ownership intact.

The full closed-screen experience is an existing deliberate destination, not another compact banner. Preserve it and its entry/exit actions. Integrate compact-notice visibility with that screen's existing takeover behavior so it does not produce a second compact notice or obscure the screen. Verify both map-peek and full closed-screen transitions. Do not condition the expanded-sidebar closed notice solely on `closedMapPeek`: current mobile operating-notice construction uses that flag, while desktop must retain the relevant warning across destinations.

## Implementation sequence and owners

Paths below are relative to `frontend/src/`. Confirm current symbols before editing; code may move after this handoff.

### Session checkpoints

Follow the implementation steps continuously, with two context checkpoints at the boundaries below. These are useful places to summarize or resume in a fresh session if accumulated exploration, diffs, and test output are crowding the context. They do not require a session reset, commit, or approval pause; continue when context remains manageable.

| Checkpoint | Work completed | Why here |
| --- | --- | --- |
| After step 2 | Shared shell geometry and reversible search, including draft preservation and Lines/List navigation | These require the most navigation/state exploration. Summarize the settled shell contract before moving to notices and presentation. |
| After step 5, before final validation | Notice consolidation, source-status navigation, flat rows, and both legend adjustments | Implementation and visual iteration will have accumulated substantial context. Preserve the final change map and focused check results before loading suite output and traces. |

At each checkpoint, record a concise summary of changed files, settled behavior, focused checks/results, outstanding issues, and the next action. Reference existing code and this handoff rather than copying exploration logs. Inspect the actual diff when resuming and preserve unrelated changes.

Use the smallest useful check during implementation. Run the full application/browser/visual gates once when stable after step 5; repeat only checks invalidated by later changes. Report known regressions at the checkpoint rather than treating the boundary as completion.

### 1. Unify shell geometry and content ownership

- `app/desktop-sidebar-state.ts` currently chooses compact/medium/wide profiles (380/560/680px). Replace destination-dependent sizing with the approved single target and responsive calculation. Remove or migrate obsolete profile-dependent code and tests instead of retaining contradictory width sources.
- `components/LineWatchShell.tsx` owns desktop view dispatch, header, active destination, collapse state, and map integration. Keep map overlay insets and available-map calculations tied to the actual panel bounds.
- `styles/shell/desktop-chrome.css` owns shell gutters, desktop embedding, and much of desktop view presentation. Establish one desktop content-width contract. Normalize minimum widths, box sizing, wrapping, and scrollbar space at the owning wrappers.
- `styles/account/my-stations.css`: the list lacks matching desktop padding while its controls already have 16px gutters. Fix the desktop ownership without doubling mobile padding.
- `components/SavedCommutesPanel.tsx` and `styles/shell/floating-panels.css`: the commute panel has a border/shadow. The desktop embedding reset in `desktop-chrome.css` currently omits `.commute-panel`. Inspect computed styles and apply the reset only to the embedded desktop presentation.
- Audit all reachable sidebar views against the shared contract: Status, saved stations, station detail, saved commutes and editor, alert categories and detail, line impacts, accessibility, notices, announcements, history, analytics, notifications, account/settings, support/forms/documents, and source status. Preserve each view's useful controls and network restrictions.

Completion: switching any desktop destination leaves width unchanged; toolbar/card edges align; one main view scroller works without clipped controls or page-level horizontal overflow.

### 2. Make global search a reversible navigation step

- `LineWatchShell.tsx` currently limits global search to top-level views and navigates on input focus. Separate focus, query editing, and navigation activation.
- Keep one global input in the shared shell. Preserve suggestion keyboard behavior, accessible names, and IME composition. Capture the return context once when entering search; subsequent keystrokes must not overwrite it with the search view itself.
- Retain draft state above any subtree that search unmounts, or keep the editor mounted through an appropriate existing mechanism. Inspect the actual ownership before selecting the smaller change. Do not persist private draft data in public caches or introduce new durable storage.
- Keep return context valid across network changes and sign-out: reuse existing network/account transition rules, never restore a station/detail into the wrong network or an account editor after sign-out. Clear invalid transient context rather than bypassing those rules.
- `components/DesktopNavRail.tsx` and `app/desktop-sidebar-state.ts`: remove Search from rail destinations, update keyboard navigation/active mapping, and keep search reachable by the global input.
- `components/StationSearchPanel.tsx` already has `expandedLineId`, `data-expanded`, and Back to Lines. Reuse these for desktop instead of implementing a second state machine.
- `styles/station/station-search.css` currently splits desktop lines and stations but switches panes on mobile. Extend the single-pane presentation to the desktop sidebar. Hide inactive controls from keyboard/accessibility navigation; preserve filter/query state and focus restoration.

Completion: search from any submenu returns to the correct state; a partially edited commute survives the round trip; List View has no squeezed parallel line column.

### 3. Consolidate notice selection and rendering

- `LineWatchShell.tsx` owns `mobileOperatingNotice`, `mobileConnectionNotice`, map-top operating/connection chips, and `.dashboard-availability-notice`. Inventory their conditions before consolidating desktop ownership.
- `components/MobileStatusPeek.tsx` is the presentation/priority reference. Extract a small shared banner if that avoids duplication; pass existing resolved state and actions instead of adding fetching or freshness logic.
- `components/DesktopStatusOverview.tsx` currently renders its own purple closing/closed notice. Remove that desktop-specific branch after the shell slot owns it.
- Mobile yellow/black styles in `styles/shell/current-service.css` are within mobile rules, with related overrides in `styles/shell/status-notices.css`. Move reusable base presentation to a responsive-independent owning stylesheet while retaining mobile layout overrides.
- Preserve semantic buttons, readable wrapping at narrow desktop widths, contrast, reduced motion, and one announcement for a state change. Collapse/expand must not change notice meaning or create two announcements.

Completion: each applicable desktop state has exactly one compact notice across expanded/collapsed and Status/non-Status views, with correct network content and mobile behavior preserved.

### 4. Move source diagnostics and flatten option rows

- `components/DesktopMorePanel.tsx` currently embeds `SourceDiagnosticsBody network={currentNetwork}`. Reuse that body in the new source-status destination; preserve tabs, refresh, loading/error states, and source-record access. Avoid duplicate fetch/state machinery from other diagnostics surfaces.
- Place the rail entry below `NetworkSelector` in `DesktopNavRail.tsx`. Keep it reachable at short viewport heights and in collapsed mode, with an accessible full label and selected state. Network switching while the destination is open updates its content.
- Flatten More group backgrounds/borders via their owning `desktop-more-card`/row styles in `desktop-chrome.css`. Maintain full-row hit targets, section spacing, and hover/focus feedback. Settings retain their switch/radiogroup semantics; account actions remain clearly actionable.
- Flatten `DesktopStatusOverview.tsx` informational rows via the `desktop-status-info-*` rules. Preserve TTC-only Announcements, regional Service Notices naming, and the separate accessibility/surface counts.
- A small shared navigation-row component is optional if it removes real duplication; avoid a general-purpose menu framework for this change.

Completion: source diagnostics is reachable solely through its new desktop destination rather than duplicated in More; the specified option rows have no persistent card highlight, and all controls remain usable by keyboard.

### 5. Polish desktop map legends

Approved visual intent:

- TTC: increase overall legend size noticeably using the available map space. Slightly reduce the red count bubbles with white numbers attached to alert-type icons. This reduction targets those bubbles, not the line route badges, alert icons, or trailing total-impact indicators.
- GO/UP: slightly increase overall legend size, move it right and down, and tighten the visible gap above the “Inkscape re-creation…” attribution. Preserve the two-column route layout and Limited Service/Regular Service key when space permits.
- Preserve attribution readability and map interaction; mobile legends retain their current sizing/layout.

Owners: `components/NetworkMapLegends.tsx` positions the desktop wrapper (currently `right-6 bottom-7`); `components/LineLegend.tsx` renders network-specific rows and `LegendImpactCountBadge`; `styles/map/map-legends.css` owns count bubbles and legend presentation. Attribution is rendered separately by `components/InteractiveTtcMap.tsx` and `components/InteractiveRegionalMap.tsx`.

Visual starting targets, to tune after inspection rather than treat as user-approved exact pixels: TTC approximately 10–15% larger; GO/UP approximately 5–8% larger; GO/UP right inset approximately 12–16px instead of 24px; visible legend-to-attribution gap approximately 8–12px. The TTC count bubble currently uses 24px height and 30px width for multiple digits: start around 21px height and 26px multiple-digit width, with proportional number/offset adjustments. Judge bubble reduction by final on-screen size after enlarging the legend. Keep multi-digit counts legible and unclipped.

Prefer explicit desktop/network-specific dimensions and spacing over blindly scaling the entire wrapper, which would also enlarge count bubbles and affect layout bounds. Measure the visible bottom of the regional service key and top of attribution; diagnose both wrappers' spacing before adjusting offsets. Anchor to the available map viewport, not the full browser width. At constrained widths, reduce the enhancement as needed to retain readable labels and usable map space.

Both interactive maps measure `.desktop-map-legend`, and `components/map-chooser-keepouts.ts` includes it in overlap avoidance. Verify actual legend bounds still protect map choosers and related overlays after sizing/position changes. Preserve click targets and line/alert navigation. Read [map asset contract](ttc-map-asset-contract.md) before changing geometry or anchoring; this polish is expected to need only UI changes, not authored SVG/raster edits.

Completion: TTC legend is visibly larger with slightly smaller alert-type count bubbles; GO/UP legend is slightly larger and sits farther right/down with a tighter attribution gap; neither overlaps attribution, clips labels/counts, or breaks map controls.

## Acceptance and regression coverage

Use focused browser checks while iterating. Add behavior tests at the affected layer rather than source-string assertions or tests that mirror CSS declarations.

| Coverage | Required observation |
| --- | --- |
| Width calculation | Unit coverage for mobile, docked, overlay, and collapse/overlay-inset behavior. All destinations resolve the same expanded width. |
| Navigation | Global-search focus alone leaves the view unchanged; typing/Enter enters; suggestion Escape precedes search return; Back restores originating detail/filter/scroll/focus. |
| Commute draft | Start editing both a field and route selection, enter search, return, and verify edits remain unsaved and intact with existing notification rules. Test invalidation on sign-out/network transition through existing rules. |
| Lines/List | Open a line list, select a station, return to the list, then Back to Lines. Preserve query/amenity filters, scroll, and selected-line focus; no side-by-side squeezed columns. |
| Notices | Closing, closed, healthy/no notice, degraded, unavailable without snapshot, reconnecting/retained snapshot, and closed plus connection problem. Cover expanded/collapsed, non-Status submenu, network switching, and full closed screen/map peek. Assert one applicable compact notice and correct action. |
| Source status | Entry placement, keyboard operation, selected state, network-specific data, refresh/tabs, and removal from More. |
| Visual alignment | My Stations cards and controls align with global search; commute outer outline is gone; flat More/informational rows and retained impact-pill colors match the design. |
| Desktop legends | Compare before/after for TTC and GO/UP with expanded and collapsed sidebar, docked and overlay layouts. Verify single/multiple-digit alert bubbles, long regional labels, service-key spacing, attribution gap, click targets, and chooser overlap avoidance. |
| Accessibility | Full keyboard path through rail/search/Back/settings; visible focus; icon-only collapsed entries named; no focusable hidden pane; readable high contrast and reduced motion. |

Inspect TTC and GO/UP, supported light/dark/high-contrast themes, empty/loading/error/populated views, and short desktop height. Include 1440px desktop, 360px mobile preservation, 767/768px mobile boundary, and 1119/1120px docking boundary. At 768px the expanded panel is 528px; at 1440px it is 560px. Include scrollbar-present content and long labels/counts. Cards may reflow internally; page-level horizontal overflow is unacceptable. Preserve deliberate map panning and overlays.

Once stable, run frontend fast tests, typecheck, lint, and production build. This is broad shell/navigation work: run full smoke and E2E regression. Because shared shell/banner presentation changes, run the full visual suite and review differences before accepting baselines. Follow the testing guide's test-API build reuse procedure and run suites sharing mutable stubs serially. Report local browser/platform gaps honestly; reuse unchanged passing results after focused fixes.

## Completion report

Summarize implemented behavior, inspected viewport/network/theme states, checks and failures, and any remaining gaps. Update existing documentation only where it describes behavior replaced by this work. Application tests were not run for this planning-only handoff; its verification consists of code inspection and document/link review.
