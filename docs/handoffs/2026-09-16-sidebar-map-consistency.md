# Sidebar and map consistency: Gemini 3.7 Flash handoff

Status: all six design recommendations confirmed by the user on September 16, 2026. Ready for implementation; routine implementation requires no further design approval. This document changes no application code.

## Outcome and precedence

Center the desktop map artwork in the workspace beside the sidebar, make sidebar navigation stable, standardize content insets, and make Current Service larger and easier to scan. Implement in the three sessions below. Each session has a completion boundary and can run in a separate model context.

This brief supersedes conflicting presentation decisions in [Current Service](2026-09-16-current-service-sidebar.md) and the older desktop handoffs. In particular, replace the consolidated remaining-line badges/reassurance with individual status rows. Keep incidents first. Preserve existing category counts, incident qualification, navigation destinations, width profiles, source boundaries, and account behavior unless explicitly changed here. Keep the current overall section order; this is not another information-architecture redesign.

Scope: both TTC and GO/UP, desktop sidebar and responsive web mobile sheet, for shared content spacing, service readability, and navigation polish. The camera correction is desktop-only. Preserve mobile sheet gestures, snap positions, safe areas, camera behavior, and network-specific capabilities. Native Expo, backend, ingestion, authored map assets, deployment, and commits are outside this task.

Read [root guidance](../../AGENTS.md) and [frontend guidance](../../frontend/AGENTS.md). Before changing service labels, read the sources/alerts sections of [domain invariants](../domain-invariants.md) and [source gates](../source-licensing-launch-gates.md). Before camera geometry changes, read the [map contract](../ttc-map-asset-contract.md). Read [testing](../testing.md) before browser suites. Prior handoff completion ledgers are historical claims, not validation of this pass.

## Approved design

| Decision | Agreed behavior |
| --- | --- |
| Map reference frame | Initial/reset views center visible artwork in the full available workspace beside the sidebar. Handle chrome clearance through fit scale, independently of the target center. |
| Manual camera | Preserve user-adjusted map-space focus and zoom through submenu/layout changes. Polling never resets exploration. |
| Service density | Increase readability and show individual remaining-line rows; accept vertical scrolling and Alerts & Notices moving below the fold. |
| Navigation motion | Short, subtle directional slide and fade, reversed on Back; immediate switching under reduced motion. One animation owner per transition. |
| Shared presentation | Apply spacing/motion improvements to both networks and both web layouts, retaining each network's content and mobile interactions. |
| Line status | Green check + **Normal Service** only with fresh supporting status. Otherwise show accurate per-line state. Incidents remain first; remaining lines follow in stable existing network order. |

Reference images showed: a mobile rail incident with a thin vertical divider between the line badge and copy; desktop incidents missing that rail divider and using undersized text; and TTC's individually listed normal lines with route badges, dividers, green checks and status text. Reuse these structural details in the existing LineWatchTO theme. Do not copy TTC's white card or restore a separate Line Status section.

## Session 1 — Correct desktop map framing

### Inspect and reproduce

Code inspection found these mechanisms; no runtime cause has yet been verified:

- `InteractiveTtcMap.tsx`, `measureDesktopInsets`: the bottom-right legend reserves a full-width bottom band. `panZoomMath.ts` centers within the supplied top/bottom insets, so a larger bottom inset moves the drawing upward by half the inset difference. The arithmetic can be correct while the chosen reference frame is wrong.
- `styles/shell/responsive-density.css`: the 768–1099px desktop range retains `.desktop-map-control-rail { top: 176px !important; }`, overriding the newer 20px rule in `map-controls.css`. Verify eligibility/cascade before removing this legacy rule.
- TTC's initial top-inset measurement uses document coordinates and old capsule fallbacks; its mounted measurement uses map-root coordinates. Check for first-paint jumps and disagreement between measurements.
- `InteractiveRegionalMap.tsx` has separate inset/fit measurements. Check both networks.
- `desktop-sidebar-state.ts` already distinguishes docked geometry from overlay occlusion; `usePanZoom.ts` includes overlay clearance and saved-camera restoration. Inspect the current initialization policy before changing it.

Capture before/after geometry after initial load and Center: map-root rectangle, actual sidebar overlap, toolbar/legend rectangles, supplied insets, visible artwork bounds, transform, target center, and whether the camera is user-adjusted/restored. Use existing authored content bounds; SVG canvas whitespace is not the visual content boundary.

### Implement the frame contract

Use one map-root coordinate system. Define available workspace U as the actual map viewport after excluding sidebar overlay occlusion. A docked sidebar already reduces the viewport; subtract no additional sidebar width. A collapsed sidebar contributes no content occlusion. Apply only symmetric outer fit padding so it cannot bias the center.

For authored visible-art bounds B and scale s, the camera translation must place `center(B)` at `center(U)`. The conceptual relationship is `translation = center(U) - s * center(B)`; adapt it to the existing transform convention rather than introducing a second CSS translation.

Keep toolbar/legend collision rectangles separate from U. Reduce scale around the same center until artwork and labels fit and clear visible chrome. A corner legend must not redefine the whole map's bottom boundary. Prefer existing collision/bounds helpers; a conservative centered fit is acceptable if it remains useful and readable. Retain the previous modest-zoom intent where clearance allows it, rather than forcing a percentage increase or clipping routes.

Initial desktop fit and Center use the same geometry. Preserve the existing intended policy that legacy saved desktop camera coordinates cannot override the new default on fresh load. Keep deliberate current-session navigation, per-network state, mobile persistence, and explicit station/incident focusing. For an untouched overview, reconcile once after final layout geometry settles. For a manually adjusted view, preserve its map-space focus at the new workspace center and retain zoom. Avoid multiple resize/refit loops and cumulative drift.

### Completion

- Both networks, expanded/collapsed sidebar, compact/medium/wide destinations, docked/overlay modes: after Center, transformed artwork center is within approximately 2 CSS px of workspace center, with balanced opposite gaps.
- Routes/labels remain visible and clear of legends/controls at default fit. Verify 1440×900, a constrained desktop, and 1099/1100px around the legacy rule; inspect other affected breakpoint neighbors.
- Repeated sidebar changes preserve explored focus and zoom without drift. Selection and View on map still reveal targets; transient overlay collapse retains details and the user's durable preferences.
- Add focused geometry/camera regression coverage, including initial/reset parity, no double subtraction, and manual-camera preservation. Inspect 360px mobile to confirm camera behavior is unchanged.

## Session 2 — Unify sidebar layout and navigation motion

### Repair ownership

Code findings to confirm against the current tree:

- `LineWatchShell.tsx`, `handleSubmenuBack`: sets Back direction immediately, then delays replacement by 380ms on desktop. The embedded keyed wrapper receives direction but not `data-going-back`; the outgoing content can play an entrance animation before the new content plays another.
- `MyStationsPanel.tsx` and `SavedCommutesPanel.tsx`: keyed internal bodies also animate and mark initial list mount as Back, compounding parent motion.
- `styles/utilities/motion.css`: overlapping fade/scale, directional entrance, floating exit and account-body rules need scoped consolidation.
- `renderDesktopSidebarContent` returns Search, Status and More directly, while other panels use a keyed embedded wrapper. Normalize presentation ownership without remounting Search on keystrokes or dropping drafts.

Separate embedded destination navigation, local list/editor navigation, and actual mobile sheet dismissal. Desktop Back should commit the destination once and animate its incoming content once, without inheriting a floating dismissal timer. Forward uses the opposite direction. A local editor can own its transition when the parent is stable; a shell transition must not also animate that child's initial mount.

Start at 160–200ms with approximately 8–12px horizontal movement and opacity, then tune in the browser. Keep container/header dimensions stable; avoid scale, overshoot, animated height and repeated entrance effects. Preserve existing immediate width/profile changes; do not introduce a competing width animation. Reduced motion switches immediately, including removal of timer-based delays.

Cancel obsolete callbacks when newer navigation, network switching, unmounting or a dismissal supersedes them. Rapid Back/root switching must end at the latest intended destination. Preserve query, filters, scroll, drafts, browser-history semantics, and focus restoration. Hidden/outgoing content must not retain interactive focus targets.

### Establish a shared inset contract

Define sidebar presentation tokens for horizontal gutter, block spacing and header/body spacing. Use one padding owner for each layer. Start with a 16px content gutter and 12–16px vertical spacing, tuning for the existing profiles; these are targets, not new fixed panel widths.

| Layer | Contract |
| --- | --- |
| Shell / panel outer box | Fill allocated width; allow flex children to shrink with appropriate minimum sizes. Preserve the stable network header. |
| Panel title and fixed controls | Align to the shared gutter. Keep their intended fixed/sticky placement. |
| Scroll body | One primary vertical scroller per destination; owns its content gutter and top/bottom inset. |
| Cards and lists | Fill inner available width, with intentional card-internal padding and wrapping. |
| Mobile sheet | Consume shared spacing where applicable while retaining handle, safe-area, bottom clearance and gesture ownership. |

Current inconsistency spans `desktop-chrome.css` (sidebar body and embedded adapters), `floating-panels.css` (shared header), `station-search.css` (10px content gutters plus list-right padding), `my-stations.css` (16px controls), commute branch markup, and `responsive-density.css` overrides. Correct the owning rules; adding outer panel padding indiscriminately would double existing gutters. Avoid broad override piles in `globals.css`.

Inventory every reachable sidebar destination and its header/body/scroller ownership. Cover Status, Search/results, More, My Stations/add/detail, My Commutes/list/create/edit, station detail, line menus, impact categories/details, settings/account and diagnostic/info destinations. Shared tokens do not require identical content density or widths. Preserve compact/medium/wide profiles and responsive reflow.

### Completion

- Review forward/Back recordings for Status → category, More → settings, Search → station, Stations → add/detail, and Commutes → create/edit, plus rapid interruption and network switching. No delayed replacement, double entrance, blank flash, focus loss or scroll jump.
- Search query/results and collection/editor state survive return navigation. Browser Back/Escape, collapse/reopen and mobile sheet dismissal retain their intended semantics.
- All inventoried destinations align their outer content to the same inset contract; cards/controls fit without clipping, accidental nested scrollbars or page-level horizontal overflow.
- Inspect 360px mobile, 1440px desktop, constrained desktop/overlay, and affected breakpoint neighbors. Check long names, empty/loading/error/account-gated states, 200% zoom, keyboard focus and reduced motion.
- Add behavioral regression coverage for one-step Back, interrupted-navigation cancellation and meaningful state restoration. Tests should not merely assert animation CSS strings.

## Session 3 — Service rows, visual polish and final validation

### Render each remaining line

Keep current qualifying incident groups first and preserve incident-detail controls. Replace the remaining-line badge cluster and “No other imminent alerts” with one row per remaining selected-network line. Each row has authored route identity, a vertical divider, a status icon and readable status text. The row/line identity opens that line's existing menu with a full accessible name; avoid nested buttons. Existing affected line groups remain reachable without duplicating their incidents into a second status section.

Share the status presentation decision between `DesktopStatusOverview.tsx` and `CurrentServicePanel.tsx`, using the current service/data seams. Absence from the overview is insufficient proof of normality: desktop `remainingLines`, mobile `clearLines`, and even helper `unaffected` have differing exclusions today.

| State | Presentation rule |
| --- | --- |
| Fresh, explicitly normal operational state; no relevant current impact or RSZ | Green check and **Normal Service**. |
| RSZ-only line | Accurate **Reduced Speed Zones** label and corresponding semantic icon/color; keep detailed RSZ entries in their existing destination. |
| Closed, ready/not running, delayed or other non-normal operational state | Existing accurate state wording; never substitute Normal Service just because no overview incident exists. |
| Stale, offline, unavailable or unknown | Current status unknown/unavailable with existing source/last-reported context and navigation retained. |
| Fixture/demo or cached snapshot | Explicit source-labeled presentation; no fresh green Normal Service reassurance. |
| Only a future closure beyond the overview window | Keep closure accessible through the line menu; present current status only if independently supported. |

Use relevant enabled providers and fresh successful source data, preserving independent rail/surface/regional boundaries. GO/UP rows retain corridor identity and supported operational/trip-change semantics; a fresh rail feed alone does not establish fresh trip-change data. Do not derive a reassurance from stale required inputs. Preserve active/planned deduplication, the 24-hour closure window, category totals, three-row surface preview, and separate surface freshness.

### Apply readable sizing and dividers

- Reuse the mobile rail divider treatment on desktop incident groups and remaining-line rows: approximately 2px, existing strong-border token, inset slightly at top/bottom, with sufficient copy separation. Preserve/add consistent surface-notice dividers without breaking multi-route badge columns. Dividers are decorative, not accessible content.
- Start Current Service entry title/body at 14px, secondary direction/time at 12–13px, impact icons at 16px and rail badges at 24–28px. Apply a coherent scale to rail and surface entries on both layouts; retain usable interaction targets and established semantic colors. Allow long copy to wrap rather than shrinking it to fit.
- Give **Current alerts, delays & closures starting within 24h** equal visible space above and below. Use one owning layout rule, initially approximately 12px each side, accounting for adjacent wrapper gaps so margins do not accidentally add together.
- Keep headings, counts and badges aligned in dark/light/high contrast. Accept vertical scrolling; do not compress the new rows to pull Alerts & Notices back above the fold.

### Completion and final checks

Add meaningful status-classifier tests for normal, impacted, RSZ-only, closed/ready, stale/offline/unavailable, fixture/snapshot, imminent/future closures and independent network sources. Check both renderers use the same decision and every line menu remains reachable. Replace obsolete consolidated-summary assertions intentionally; avoid retaining false reassurance just to satisfy an old test.

Inspect service rows at 360px and 1440px, both networks, representative dark/light/high-contrast states, long incidents, multi-route notices and multi-digit counts. Confirm enlarged entries, rail/surface dividers, equal subtitle gaps, wrapping and scrolling with reviewed screenshots.

During all sessions use focused checks. Once the combined work is stable, run frontend fast tests, typecheck, lint, production build, full smoke and E2E per the frontend guide. Run the full visual suite if shared design-system/global styles changed; otherwise review the affected visual scenarios. Reuse only a matching configured build, run suites sharing mutable fixtures serially, and review image differences before updating baselines. Report environment limitations and untested cases. No backend/native suites are needed for this frontend scope.

## Session ledger and delivery

Update this table at each session boundary. Record changed files, revision/build configuration, actual checks, screenshot/recording paths, remaining defects and the exact next action. Session boundaries do not require additional user approval. Reuse unchanged passing results; rerun checks invalidated by later changes.

| Session | Status | Evidence / next action |
| --- | --- | --- |
| 1. Desktop camera | Completed | `computeDesktopMapFrame` in `panZoomMath.ts` verified across TTC & GO/UP; legacy control rail override removed; unit tests passed (`pan-zoom-behavior.test.mjs`, `narrow-desktop-layout.test.mjs`, `regional-network.test.mjs`, `css-architecture-guardrails.test.mjs`). |
| 2. Sidebar layout/motion | Completed | Desktop 380ms Back delay eliminated in `LineWatchShell.tsx`; embedded panels (`MyStationsPanel.tsx`, `SavedCommutesPanel.tsx`, `AccessibilityOutagesPanel.tsx`) use state-driven direction to prevent false mount transitions; motion styles tuned to 180ms ±10px in `motion.css`; content gutter standardized to 16px in `station-search.css`; tests passed (`unified-search-ui.test.mjs`, `mobile-nav-motion.test.mjs`). |
| 3. Service/final checks | Completed | `getLineStatusPresentation` implemented in `current-service.ts` for truthful status qualification (normal service, RSZ, closures, stale/offline); individual status rows and vertical rail dividers rendered in `DesktopStatusOverview.tsx` and `CurrentServicePanel.tsx`; typography and spacing scaled in `desktop-chrome.css` and `current-service.css`; full validation passed (`test:fast`, `typecheck`, `lint`, `build`). |

Final implementation report: link representative before/after evidence, describe corrected behavior, list actual validation and material gaps, and identify any unfinished session. Planning evidence is code inspection only; no runtime reproduction, application changes or application tests were performed while preparing this brief.
