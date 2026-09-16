# Current Service sidebar implementation brief

Status: design decisions confirmed by the user on September 16, 2026. Ready for Gemini 3.7 Flash implementation. This handoff specifies the current task; where older sidebar handoffs differ, use this one. No application changes were made while preparing this document.

## Outcome

Make the desktop sidebar immediately useful on page load, using the mobile map pull-up sheet's information hierarchy and visual treatment. Show imminent/current incidents, preserve access to every line menu, and remove the redundant Line Status section. Apply the same principles to TTC and GO/UP, using each network's actual capabilities. Carry line navigation and wording/count corrections into the mobile web sheet without changing its gestures or overall layout.

Read the [root guide](../../AGENTS.md) and [frontend guide](../../frontend/AGENTS.md) before implementation. Preserve the [domain invariants](../domain-invariants.md), particularly independent source freshness, closures, notices, and regional trip changes. This is frontend presentation/navigation work, not an ingestion or native-app redesign.

## Approved layout

Desktop content order, beneath the existing app header and search:

```text
Search Stations and Alerts…              [fixed header]

Current Service                         [LIVE]

ALERTS & NOTICES
[ Active Alerts     0 ] [ Delays             0 ]
[ Reduced Speed Zones ] [ Planned Closures     ]
[ Accessibility                              > ]
[ Surface Notices                            > ]
[ Announcements                              > ]

Current alerts, delays & closures starting within 24h
Subway & Light Rail                      [count]
  [line badge/menu]  Incident type
                     Location / station span
                     Direction, published timing
  …other qualifying incidents…
  [clickable badges for lines without qualifying incidents]
  No other imminent alerts

Streetcar / Bus Alerts                   [0–3+]
  Up to three current notice summaries
  View all [with remaining count where applicable]
```

Counts, titles, badges, and entries in this schematic are illustrative, not fixture content to hardcode. Regional mode uses its existing rail/corridor and Service Notices labels, Trip Changes category instead of Reduced Speed Zones, and supported secondary entries. Do not introduce TTC-only Announcements or streetcar labels into GO/UP.

- Rename the current desktop **System Status** heading to **Current Service** (the request called it System Service; System Status is the actual current string).
- Put Current Service left and the source-status pill right on one row. Use the mobile recessed Live pill's entire design, including jewel, typography, theme variants, muted states, and reduced-motion behavior.
- Remove the outer grey summary container. Remove the search-header bottom divider in all themes. Separate header, categories, links, and incident sections with logical spacing, not extra decorative containers.
- Keep search fixed above one scrolling sidebar content region. No nested incident-list scrolling, floating panel, drag handle, or desktop sheet height controls inside the sidebar.
- Keep all three TTC secondary entries immediately after the four category buttons: Accessibility, Surface Notices, Announcements. The surface preview below the rail section is additional; it does not replace the Surface Notices entry.
- Remove the separate Line Status section completely.
- Preserve access to source timing/data diagnostics formerly exposed in the summary; reuse the existing diagnostics destination through an accessible status control or compact adjacent action without restoring the grey card.

## Categories, incident scope, and counts

The category buttons are catalogue entry points. The incident section is a narrower, time-filtered overview. Keep that distinction explicit.

- Reuse the mobile category capsule design: icon, circular count, full label, tint, border, zero-count treatment, and interaction/theme states. Preserve full text **Reduced Speed Zones** and **Planned Closures**.
- Category counts retain their existing collection scope. Planned Closures includes all scheduled closures, even those beyond 24 hours. Reduced Speed Zones remains available with its full count and detail destination.
- Put **Current alerts, delays & closures starting within 24h** immediately above the incident overview. Section counts describe the rendered qualifying collection, not the catalogue totals. Preserve existing total-impact semantics if an existing total remains; do not present that total as the number of imminent incidents.
- Incident rows include active alerts, deduplicated current delays, and published closure windows underway or starting within the next 24 hours. No individual Reduced Speed Zone rows and no distant planned closures.
- Reuse `currentServiceSummary` rather than independently recreating filtering. Preserve linked active/planned closure deduplication, explicit valid window requirements, source labels, Toronto-time formatting, and stable ordering.
- Preserve existing row detail navigation and meaningful information: incident type, location, direction when available, published timing, and shuttle indication when applicable. Do not duplicate an incident merely to expose a line menu.
- Regional trip changes retain their existing dedicated category and coverage. Do not convert cancellations into delays, rail service-status incidents, or active-alert totals.

## Every line remains reachable

- Affected lines retain their incident-group badges; turn the line identity into an explicit line-menu control, separate from incident-detail controls.
- Lines with no qualifying overview incident appear as compact clickable badges below the incident list, not full named Line Status rows. Wrap badges naturally for the larger regional network.
- Every selected-network line/corridor must remain reachable, including RSZ-only lines and lines whose only closure is beyond 24 hours. Reuse `onOpenCategory("line-impacts", line.id)` / the shell's existing line-menu destination.
- Each badge needs an accessible name including the full line/corridor name and menu purpose, keyboard support, visible focus, and a usable target size. Preserve authored line colors and badges. Avoid nested buttons.
- Do not infer normal service from absence of overview rows. Use **No other imminent alerts** for the remaining-line group when incidents exist, or **No imminent alerts** when none qualify. In particular, RSZ-only lines must not be described as Normal service. Accessible text must follow the same rule.
- Preserve explicit closed-hours information and existing source-honest unavailable/snapshot states. In stale/offline states, keep navigation available but do not show current-service reassurance. Snapshot rows remain Last reported, not current.
- Make these line controls and wording corrections in the mobile web sheet as well.

## Surface preview and freshness

- Below the rail section, show at most **three** current notices and an action to the existing full list. Keep existing notice detail navigation.
- Use `currentSurfaceNotices` and the selected network's notice collection. Preserve current filtering and ordering; do not invent dates for notices without them.
- Use a heading badge of 0, 1, 2, 3, or 3+ according to current notice availability; accessible copy reports the actual preview count. The remaining count is total current notices minus displayed notices. Keep View all available for the full catalogue.
- The current implementation displays up to six but labels the header as three; change desktop and mobile to the agreed three-row preview and synchronize visual/accessibility counts.
- Gate the preview on its own source freshness. Fresh rail alerts do not establish fresh surface/service notices. Preserve separate loading, unavailable, and empty states and snapshot suppression.
- Live styling is conditional, not a promise to force green. Preserve fixture, cached, stale, offline, and unknown labels and the existing relevant provider/freshness checks. Network switching must never retain another network's counts, line controls, or notices.

## Width and startup behavior

- The desktop content panel may grow from the existing 380px compact width to **400px**, excluding the navigation rail. Prefer the existing 380px if full labels fit comfortably; 400px is the approved upper target, not a mandate to shrink text.
- Use two category columns when full labels fit; fall back to one column at constrained widths. Do not truncate Reduced Speed Zones or reduce type below the established mobile category size to force two columns.
- Keep width stable across changing counts/loading states. Preserve existing dock/overlay map-space guarantees. If the compact width changes, update its shared layout metrics/budget rather than adding a conflicting CSS-only width.
- Expand the desktop sidebar on **every fresh page load**, including when legacy local storage says collapsed. During the current mounted page session, the user can collapse/reopen it normally. Polling and network switching must not continually force it open.
- Stop restoring/saving durable collapse preference for this behavior. Ignore/remove only the obsolete collapse key as appropriate; preserve unrelated preferences. Avoid a hydration flash from collapsed to expanded.

## Implementation map

| Owner | Work |
| --- | --- |
| `frontend/src/components/DesktopStatusOverview.tsx` | Replace grey summary/Line Status structure with approved layout; preserve category/secondary navigation and diagnostics. |
| `frontend/src/components/MobileStatusPeek.tsx` | Actual pictured mobile sheet wrapper; source for Live pill and category controls. Share presentation where practical. |
| `frontend/src/components/CurrentServicePanel.tsx` | Shared incident rendering, line-menu controls, honest reassurance, three-notice preview. Keep sheet-only behavior out of sidebar rendering. |
| `frontend/src/components/LineWatchShell.tsx` | Selected-network data, freshness, navigation callbacks, desktop startup, mobile/desktop composition. |
| `frontend/src/app/current-service.ts` | Existing summary/filter seam. Reuse; change only if required by approved behavior and covered by meaningful tests. |
| `frontend/src/app/desktop-sidebar-state.ts` | Collapse persistence and shared width/dock calculations. |
| `frontend/src/styles/shell/desktop-chrome.css` | Header divider, desktop summary shell, spacing and sidebar sizing. Check theme overrides. |
| `frontend/src/styles/shell/current-service.css` | Current-service rows and full recessed Live pill styling, currently scoped to mobile/container contexts. |
| `frontend/src/styles/shell/mobile-chrome.css` | Category capsules and their theme/interaction variants. |

`MobileStatusSheet.tsx` is a different status destination, not the pull-up sheet in the reference. Do not use it as the visual source accidentally. Extract small shared presentational pieces or a clear embedded variant when needed; avoid copying an entire draggable panel into the sidebar. Preserve existing mobile gestures and sizing. Keep CSS in its owning modules, not new overrides in `globals.css`.

## Implementation sequence

The desktop map additions below are part of this handoff and must be implemented alongside the sidebar so that final camera fitting uses the final sidebar, legend, and control dimensions.

1. Confirm current owners and selected-network props; preserve unrelated work. Add/update regression cases for startup and incident/navigation semantics before changing those paths.
2. Reuse/extract the Live pill and category presentation with theme and source states intact. Add the embedded incident presentation and line-menu callbacks.
3. Compose the desktop structure, preserve secondary entries, remove obsolete card/Line Status/divider, and apply responsive sizing and session-only collapse behavior.
4. Carry the agreed line controls, honest labels, and three-row notice preview into mobile. Verify both networks before finalizing styles.
5. Run final checks once stable; review screenshots and obsolete assertions intentionally rather than preserving superseded UI to satisfy tests.

## Acceptance and validation

- A fresh desktop load opens the sidebar even with the old collapsed preference. Collapse/reopen works until reload. Polling and switching networks preserve the user's current session choice.
- Active alerts/current delays display once; closure windows exactly at the 24-hour boundary qualify; later/expired/invalid windows do not. Linked in-effect closures appear once. RSZ detail rows never appear in the overview, but their category remains accessible.
- All lines open their own menus in desktop and mobile, including unaffected, RSZ-only, and distant-closure-only lines. Incident controls still open incident details. No false Normal service labels appear in visible or accessible text.
- Category counts retain catalogue scope. Rail overview counts and surface 3+ / remaining counts match their own displayed collections.
- TTC and GO/UP have appropriate headings, controls, and independent source states. Test fresh, stale/unavailable, fixture, and cached data plus empty and busy incident states.
- Full labels fit at 1440px desktop and 360px phone. Inspect both sides of changed layout breakpoints, both map modes, light/dark/high-contrast states, focus and reduced motion. No page-level horizontal overflow; map panning and deliberate internal scrolling remain usable.
- Existing focused coverage includes `frontend/tests/desktop-sidebar-state.test.mjs`, `frontend/tests/current-service.test.mjs`, `frontend/tests/smoke/current-service.spec.ts`, and `frontend/tests/smoke/mobile-service-sheet.spec.ts`. Replace obsolete collapse-persistence/divider assertions; prefer behavior tests to new implementation-string tests.
- Read [testing](../testing.md). Once stable, run frontend `test:fast`, `typecheck`, and `lint`. This task changes rendering, shell navigation, and network parity: also build and run smoke/E2E per the frontend guide, reusing a correctly configured build and running shared-stub suites serially. If shared design-system styles change globally, run the required full visual suite; review differences before updating baselines.
- Report what was checked, failures, and material gaps. Do not run backend/native suites for this frontend-only work. This planning handoff itself requires only diff/link review.

## Added scope: desktop map framing, legends, and control parity

User addition after the initial handoff: replace the stale default map framing with geometric centering, slightly increase its default zoom, shrink both legends, and align GO/UP controls with TTC. These changes concern desktop map presentation; preserve mobile camera fitting and control gestures.

### Default camera and Center action

- Center the actual network drawing horizontally and vertically in the visible map viewport to the right of the sidebar. Use the drawing's content bounds, excluding empty authored SVG margins, rather than a station, landmark, legacy reference point, or hardcoded camera translation. Station anchors remain necessary for overlays and interaction; this request removes camera reference points only.
- Compute the visible rectangle from current layout geometry. In docked mode, the map container already excludes the sidebar: do not subtract its width again. In overlay mode, subtract the actual sidebar occlusion. With the sidebar collapsed, use the newly available space.
- Initial desktop load and the Center action must use the same new fit. A previously saved desktop camera must not restore the stale initial location over this default. Keep deliberate pan/zoom during the current session; polling must not snap the camera back. Preserve explicit station/incident focus navigation and mobile persistence behavior.
- Make the default fit a little closer than the current desktop view by reducing excess fit padding. Start with approximately 5% more scale as a visual tuning target, not an unconditional multiplier. Clamp to fit the drawing and labels within the visible map region; no content should extend beneath the sidebar or beyond the available width at default fit.
- Keep the drawing's center at the center of that visible rectangle. Account for control/legend collisions by limiting scale and reducing legend footprint, not by returning to landmark-based offsets. If the extra zoom cannot fit safely at a constrained size, fit and readability take precedence.
- Use final rendered legend/control bounds when testing collisions. The regional screenshot shows its lower routes/labels touching the legend; shrinking the legend alone is insufficient if the camera still overlaps it.
- Apply the same framing principle in both map modes using each map's own bounds/aspect ratio. Recalculate untouched default framing when the sidebar/layout changes; do not reset a user-adjusted camera on every resize or update. Intentional manual panning/zooming may go beyond the initial fit.

### Smaller desktop legends

- Reduce legend footprint in both TTC and GO/UP, particularly the regional two-column legend. Start at roughly 85% of the current visual size, then tune against the actual viewport. This is an implementation starting point, not a fixed acceptance percentage.
- Reduce type, badges, swatches, row spacing, and column gaps together while keeping names, counts, service symbols, and regional Limited Service / Regular Service keys readable. Preserve route colors, accessible names, focus, and usable click targets wherever legend entries are interactive.
- Keep legends at the bottom-right of the map viewport, independent of camera zoom. Prefer real layout sizing over a cosmetic transform that leaves incorrect measurement/hit regions. Camera collision calculations must use the final visible footprint.
- At default fit and after Center, neither legend may cover routes, station labels, or other controls. Preserve attribution readability. Do not modify authored map geometry or delete legend information to achieve this.

### Matching desktop controls

- Use TTC as the shared desktop layout: the horizontal Center / zoom-out / slider / zoom-percentage / zoom-in console at the top-center of the visible map viewport; Train Markers and theme toggle at the top-right.
- Move GO/UP's console to that same position and orientation, with matching spacing, dimensions, alignment, and stacking. Both modes use the same layout rules and respond consistently to sidebar expansion/collapse and width changes.
- Preserve network-specific marker availability, counts, source gating, and camera actions. Layout parity does not imply equal provider capabilities.
- Keep the top-center console clear of the right-hand controls at narrower desktop sizes using existing responsive behavior. Do not let its centering use the full browser width when the sidebar occupies part of it.

### Additional owners and verification

Inspect `frontend/src/components/InteractiveTtcMap.tsx` and `InteractiveRegionalMap.tsx`, their camera/fit hooks and imported helpers, `frontend/src/app/map-viewport-preference.ts`, and the persistence hook before changing initial-camera behavior. Both map components currently measure legend occlusion; update the actual fit owner rather than applying a second compensating transform.

Legend owners are `frontend/src/components/NetworkMapLegends.tsx` and `frontend/src/styles/map/map-legends.css`. Controls are rendered by the map components with styles in `frontend/src/styles/shell/map-controls.css`; inspect `responsive-density.css` overrides as well. Reuse the existing sidebar geometry helpers in `desktop-sidebar-state.ts` where appropriate.

Read the [map asset contract](../ttc-map-asset-contract.md) before touching map geometry/assets. This work should be achievable through camera/layout changes. Preserve overlay anchoring, station hit targets, raster/SVG alignment, and authored IDs; regenerate raster assets only if source assets actually change.

Add meaningful fit/persistence regression coverage for visible-rectangle centering, no double subtraction of docked sidebar width, overlay occlusion, legacy saved cameras, and Center returning to the same default. Inspect both networks at 1440px desktop and a constrained desktop width, with sidebar expanded/collapsed and around changed breakpoints. Verify legend clearance, the modest zoom increase where space permits, identical control placement, manual pan/zoom retention, and station-focus navigation. Recheck 360px mobile to confirm its camera/control behavior remains intact. Include these changes in the final build, smoke/E2E, and applicable visual checks already required above.
