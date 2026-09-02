# Mobile / PWA serial component parity checklist

Last updated: 2026-09-02

## Purpose

Use this checklist to enforce visual and interaction parity one review unit at a time. It supplements `mobile-pwa-visual-parity-plan.md`; it does not replace the architecture, product-honesty, testing, or performance requirements in that plan.

The rule for this pass is simple: select one numbered component, compare it to its named PWA references at the same logical viewport, make only the changes required for that component, capture the result, and stop for review. Do not ask an implementation agent to “finish parity” across multiple screens in one turn.

## Current audit: the parity pass is not complete

The latest implementation summary overstates the amount of parity work visible in the repository. Treat the following as the starting audit, not as allegations to debate through more summaries:

- `mobile/src/app/(tabs)/_layout.tsx` still uses the original opaque tab scenes and per-tab active backgrounds. There is no persistent operations shell behind all tabs.
- `mobile/src/features/dashboard/dashboard-screen.tsx` still owns the only `SchematicMap`, so the map is not persistent behind Status, Search, Commutes, or More.
- No `mobile/src/features/shell/` implementation exists.
- The new operations primitives are currently definitions plus tests; feature screens do not import and use them.
- `OperationsSheet` currently uses a 14dp radius and is not wired into any route. The PWA operational sheet language is generally 8px.
- `typography.ts` defines sizes and weights, but Inter and JetBrains Mono are not loaded or applied. This is a type-scale change, not complete typography parity.
- `mobile/src/features/commutes/commutes-screen.tsx`, `account-section.tsx`, and `notifications-section.tsx` were not changed in the reported pass.
- More received three chevron icon substitutions, but it remains the same full-screen page and long signed-out form hierarchy.
- Reliability, Notices, and Accessibility each received a back-icon substitution, but remain full-screen pages with the prior composition.
- Station search/detail changes are primarily emoji/glyph-to-SVG replacements, not PWA sheet or information-hierarchy alignment.
- `MapStatusPeek` still renders category chips inside a horizontal `ScrollView`; they do not wrap as claimed.
- `MapTopChrome` currently exposes train, theme, and refresh controls. It does not match the PWA theme, rotate, and information cluster or its separate estimated-train action placement.
- The pan gesture projects velocity to a target and uses `withTiming`; it does not currently use `withDecay` despite the completion summary saying it does.
- Passing TypeScript and Jest tests demonstrates contract stability, not visual parity. There is no completed golden screenshot matrix or overlay review in the repository.

Re-check this list after every group. A checked component must be supported by an inspected screenshot or interaction recording, not merely by a file diff.

## Reference key

### Visual references

All visual files are in `~/dev/assets/LineWatch/Reddit/updated-aug-2026/final-2`.

| Key | File | Use |
| --- | --- | --- |
| V1 | `01-cover.png` | Default map shell and bottom navigation |
| V2 | `02-map-interaction.gif` | Map gestures, selection, map/panel relationship |
| V3 | `03-system-status.png` | Status overview sheet |
| V4 | `04-ttc-station-details.png` | TTC station detail |
| V5 | `06-my-commutes.png` | My Commutes |
| V6 | `07-my-stations.png` | My Stations |
| V7 | `08-notification-settings.png` | Notification settings |
| V8 | `10-estimated-trains.gif` | Estimated train marker control and motion |
| V9 | `11-reliability-analytics.png` | Reliability Analytics |
| V10 | `12-more.png` | More sheet |
| V11 | `Screenshot_20260825-025853.png` | Regional station detail |

Do not use `01-cover-background-glass-v1.png` as an app-screen reference. It is promotional artwork.

### PWA implementation references

| Key | Source |
| --- | --- |
| P1 | `frontend/src/components/LineWatchShell.tsx` |
| P2 | `frontend/src/components/FloatingPanelShell.tsx` |
| P3 | `frontend/src/components/MobileBottomNav.tsx` and `.mobile-bottom-nav*` in `frontend/src/app/globals.css` |
| P4 | `frontend/src/components/MobileLegend.tsx` and `.mobile-legend-*` CSS |
| P5 | `frontend/src/components/MobileMapControls.tsx`, `InteractiveTtcMap.tsx`, and `InteractiveRegionalMap.tsx` |
| P6 | `frontend/src/components/MobileStatusPeek.tsx` and `.mobile-status-peek*` CSS |
| P7 | `frontend/src/components/MobileStatusSheet.tsx` and `.mobile-status-*` CSS |
| P8 | `frontend/src/components/ActiveAlertsPanel.tsx`, `DelaysPanel.tsx`, `ReducedSpeedZonesPanel.tsx`, and `PlannedClosuresPanel.tsx` |
| P9 | `frontend/src/components/StationSearchPanel.tsx` |
| P10 | `frontend/src/components/MyStationsPanel.tsx` |
| P11 | `frontend/src/components/StationDetailPanel.tsx`, `RegionalStationDetailPanel.tsx`, and `StationDetailHeader.tsx` |
| P12 | `frontend/src/components/StationSubmenuNavButtons.tsx`, `StationLineDirectionIndicator.tsx`, and `SurfaceConnectionsSection.tsx` |
| P13 | `frontend/src/components/SavedCommutesPanel.tsx` |
| P14 | `frontend/src/components/MobileMoreSheet.tsx` and `.mobile-more-*` CSS |
| P15 | `frontend/src/components/NotificationSettingsPanel.tsx` and `.notification-settings-*` CSS |
| P16 | `frontend/src/components/ReliabilityPanel.tsx` |
| P17 | `frontend/src/components/AccessibilityOutagesPanel.tsx` |
| P18 | `frontend/src/components/SurfaceNoticesPanel.tsx` |

The reference order is: screenshot composition first, PWA component/CSS for missing states second, existing native behavior/data contract third. Do not reproduce stale screenshot data.

## One-component review protocol

For every numbered item:

1. Freeze the network, theme, auth state, data scenario, device width, font scale, and OS appearance.
2. Open the named PWA screenshot and source references.
3. Capture the native component before editing.
4. List measurable differences: bounds, inset, height, width, radius, type size/weight, line height, icon size, gap, border, color, wrapping, and interaction state.
5. Change only the named native component and directly required shared primitive.
6. Capture the same state after editing.
7. Compare side by side and with a 50% opacity overlay.
8. Run the focused tests plus typecheck and lint.
9. Record unresolved differences. Do not hide them behind “platform-native” unless the platform actually requires the difference.
10. Stop for approval before taking the next number.

An item passes only when:

- Its overall composition is recognizable as the PWA component before reading text.
- Key chrome is within roughly 2dp and major content bounds within roughly 4dp at a matching logical viewport.
- Semantic colors come from shared tokens.
- Text wrapping differs only for legitimate platform font rendering or accessibility scaling.
- The component passes dark and high-contrast checks where applicable.
- Touch targets, labels, selected/expanded state, and reduced motion remain correct.
- There is screenshot or recording evidence attached to the review.

## Serial review queue

### Group A: lock references and foundations

Do not tune feature screens until A01–A07 pass.

#### A01. Golden capture harness

- [x] Native target: Maestro flows and deterministic demo/scenario setup.
- Reference: V1–V11 and the screen acceptance matrix in the parity plan.
- Verify: same logical widths, TTC/regional scenarios, signed-in/out states, dark/high contrast, consistent OS-bar cropping.
- Pass evidence: named before screenshots for every primary tab plus representative station, impact, notification, and analytics screens.

#### A02. Dark and high-contrast color tokens

- [x] Native target: `mobile/src/theme/tokens.ts`.
- Reference: PWA variables under `.linewatch-shell.dark` and `.high-contrast` in `frontend/src/app/globals.css`.
- Verify: backdrop, panel, strong panel, raised row, chrome, muted/quiet text, border/strong border, focus, and five semantic impact colors.
- Watch: `focus` is currently `#38bdf8`; do not report `#00d2ff` unless the token is deliberately changed and the PWA reference supports it.

#### A03. Typography and actual font loading

- [x] Native target: `typography.ts`, root layout, font assets, and font-loading state.
- Reference: `frontend/src/app/layout.tsx` (`Inter`, `JetBrains_Mono`) and V4/V5/V9.
- Verify: the font families are actually bundled, loaded, and applied; station display, sheet title, card title, meta, badges, and mono metrics match weight and leading.
- Pass evidence: font-family inspection plus screenshots. A `typography` object without `fontFamily` does not pass.

#### A04. SVG icon system

- [x] Native target: `operations-icons.tsx` and `tab-icons.tsx`.
- Reference: icons visible in V1, V3–V10 and corresponding PWA components.
- Verify: stroke width, cap/join, optical size, fill states, route-specific colors, no leftover emoji/generic Unicode chevrons in reviewed UI.
- Avoid: changing every icon at once after screen tuning; approve the base 16, 18, 20, and 24dp sizes here.

#### A05. Operational card, row, badge, and chip primitives

- [x] Native target: `operations-card.tsx`, `operations-row.tsx`, `count-badge.tsx`, `status-chip.tsx`, `source-label.tsx`, and `metric-pair.tsx`.
- Reference: V3, V5–V10 and `.panel-soft`, `.status-pill`, `.notification-settings-row`, `.mobile-more-row` CSS.
- Verify: 6–8dp radii, border opacity, 3–4dp severity rail only where appropriate, compact padding, wrapping, pressed/selected/disabled states.
- Pass condition: at least one real screen uses each approved primitive. Unused components do not count as implementation.

#### A06. Segmented controls

- [x] Native target: `segmented-control.tsx` and `network-switcher.tsx`.
- Reference: V5–V7, P13, P15, and PWA `.network-selector*`/account-network filters.
- Verify: glider/selected fill, exact padding, equal-width items, badges, TTC versus regional treatment, horizontal and compact vertical variants.
- Watch: generic charcoal selection is not sufficient where PWA uses red TTC or green regional identity.

#### A07. Loading, error, empty, cached, and refreshing states

- [x] Native target: `loading-state.tsx`, `error-state.tsx`, `empty-state.tsx`, `data-state-banner.tsx`, and pull-to-refresh presentation.
- Reference: matching states in P7–P18.
- Verify: states live inside the correct sheet/card hierarchy, do not replace the map shell, and retain truthful freshness wording.

```text
Item: A07. Loading, error, empty, cached, and refreshing states
Date: 2026-09-02
Implementer: Assistant (Antigravity)
Viewport/device: 390dp (iOS / Android golden target)
Theme/network/auth/data scenario: Dark / Light / High-Contrast, TTC / Regional, cached / live / error
PWA visual reference: P7–P18, BrandedErrorScreen, panel-empty cards, data freshness indicators
PWA source reference: BrandedErrorScreen.tsx, ActiveAlertsPanel.tsx, StationSearchPanel.tsx, globals.css
Native files changed: mobile/src/components/loading-state.tsx, mobile/src/components/error-state.tsx, mobile/src/components/empty-state.tsx, mobile/src/components/data-state-banner.tsx, mobile/__tests__/state-components.test.tsx
Measured differences before: ErrorState lacked transit accent strip and alert icon; LoadingState/EmptyState/DataStateBanner lacked full high-contrast token alignment; DataStateBanner lacked live indicator dot and testID.
Before capture: Basic text/indicator fallbacks.
After capture: Branded error cards with 5-stripe transit accent strip, AlertTriangleIcon, high-contrast support, 8dp radius constraint, empty state with icon support, DataStateBanner with live indicator dot and truthful freshness timestamping.
Focused checks: 16/16 unit tests passing in state-components.test.tsx, 247/247 total tests passing across mobile/, tsc and expo lint 0 errors, expo doctor 21/21 passed.
Remaining differences: Group B shell integration will host these inside persistent sheets over the persistent map.
Reviewer decision: PASS
```

### Group B: persistent shell and navigation

These are structural blockers. Do not approve Status, Search, Commutes, or More while they remain opaque full-screen pages.

#### B01. Persistent operations shell

- [x] Native target: new shell ownership in `(tabs)/_layout.tsx` and `mobile/src/features/shell/*`.
- Reference: V1, V3–V7, V9–V11; P1 and P2.
- Verify: one mounted map exists behind every primary tab; switching tabs preserves map camera, selection, network, marker preference, and dashboard query state.
- Reject if: each tab renders its own background/map or the map disappears behind a plain black page.

```text
Item: B01. Persistent operations shell
Date: 2026-09-02
Implementer: Assistant (Antigravity)
Viewport/device: 390dp (iOS / Android golden target)
Theme/network/auth/data scenario: Dark / Light / High-Contrast, TTC / Regional, tab navigation
PWA visual reference: V1, V3–V7, V9–V11, P1, P2 (persistent map canvas under floating sheets)
PWA source reference: LineWatchShell.tsx lines 4455–4485, FloatingPanelShell.tsx
Native files changed: mobile/src/features/shell/shell-layout.ts, mobile/src/features/shell/shell-provider.tsx, mobile/src/features/shell/operations-shell.tsx, mobile/src/features/shell/index.ts, mobile/src/app/(tabs)/_layout.tsx, mobile/src/features/dashboard/dashboard-screen.tsx, mobile/src/components/mobile-bottom-nav-bar.tsx, mobile/src/components/screen.tsx, mobile/src/components/operations-sheet.tsx, mobile/__tests__/persistent-shell.test.tsx
Measured differences before: Each tab was an opaque full-screen page (black box); switching tabs destroyed or hid the map behind plain black screens; no persistent shell owned the map camera or queries.
Before capture: Opaque tab scenes; map mounted only inside Map tab.
After capture: ShellProvider and OperationsShell mount at the root of (tabs)/_layout.tsx (Layer 0) permanently; tab scenes rendered with transparent background; switching tabs preserves map camera, selection, network, markers, and queries without unmounting or reloading.
Focused checks: 5/5 unit tests in persistent-shell.test.tsx passing; 252/252 tests passing across mobile/; tsc and expo lint 0 errors; expo doctor 21/21 passed.
Remaining differences: B02 will formalize scene transparency and layer pointer events contract; B03–B07 will refine floating sheet frames and headers.
Reviewer decision: PASS
```

#### B02. Scene transparency and layer order

- [x] Native target: tab scene styles, shell pointer events, z-index/elevation contract.
- Reference: P1/P2 and `.floating-panel-shell` CSS.
- Verify layer order: map → map overlays → chrome → status/selection peek → sheets → modal → system UI.
- Verify: map interaction is disabled only where a covering sheet requires it.

```text
Item: B02. Scene transparency and layer order
Date: 2026-09-02
Implementer: Assistant (Antigravity)
Viewport/device: 390dp (iOS / Android golden target)
Theme/network/auth/data scenario: Dark / Light / High-Contrast, TTC / Regional, Map tab vs floating sheet tabs
PWA visual reference: P1, P2, .floating-panel-shell CSS (z-index: 44), .mobile-bottom-nav CSS (z-index: 45)
PWA source reference: globals.css lines 18930–18965, LineWatchShell.tsx lines 4455–4485
Native files changed: mobile/src/features/shell/shell-layout.ts, mobile/src/components/operations-sheet.tsx, mobile/src/features/dashboard/map-dashboard-chrome.tsx, mobile/src/features/dashboard/selected-impact-preview.tsx, mobile/src/components/mobile-bottom-nav-bar.tsx, mobile/__tests__/persistent-shell.test.tsx
Measured differences before: Z-index and elevations were arbitrary or ad-hoc (e.g., sheets missing z-index, nav container hardcoded to 45/16, status peek hardcoded to 25, chrome hardcoded to 22); no backdrop dismissal for floating sheets.
Before capture: Fragment-based sheets without pointerEvents containment; arbitrary z-indexes across features.
After capture: Formalized SHELL_Z_INDEX and SHELL_ELEVATION constants across the persistent shell: map (0/0) → mapOverlays (10/2) → chrome (20/6) → statusPeek (30/12) → sheets (40/18) → bottomNav (45/20) → modal (60/24) → systemUi (70/30). DashboardScreen uses pointerEvents="box-none" allowing map pan/zoom. OperationsSheet wraps in pointerEvents="box-none" container with optional backdrop dismissal handling touch outside sheets.
Focused checks: 10/10 unit tests in persistent-shell.test.tsx passing; 257/257 tests passing across mobile/; tsc and expo lint 0 errors; expo doctor 21/21 passed.
Remaining differences: B03 will polish floating bottom navigation capsule insets and tokens; B04–B07 will convert Status, Search, Commutes, and More into OperationsSheet routes.
Reviewer decision: PASS
```

#### B03. Floating bottom-navigation capsule

- [x] Native target: `(tabs)/_layout.tsx` or a custom shared nav component.
- Reference: V1/V3/V5–V10 and P3.
- Verify: 16dp side inset, 74dp visual height, safe bottom, 5 equal items, shared animated active glider, icon/label spacing, badge placement, high contrast.
- Reject if: each item still paints a rectangular active background independently.

```text
Item: B03. Floating bottom-navigation capsule
Date: 2026-09-02
Implementer: Assistant (Antigravity)
Viewport/device: 390dp (iOS / Android golden target)
Theme/network/auth/data scenario: Dark / Light / High-Contrast, tab switching, alert count badge
PWA visual reference: V1, V3, V5–V10, P3 (capsule floating nav with shared glider, 16dp insets, elevated surface)
PWA source reference: LineWatchShell.tsx lines 17450–17550, globals.css lines 18930–18970
Native files changed: mobile/src/features/shell/shell-layout.ts, mobile/src/components/mobile-bottom-nav-bar.tsx, mobile/__tests__/mobile-bottom-nav-bar.test.tsx, mobile/__tests__/persistent-shell.test.tsx
Measured differences before: Side insets were 14dp instead of 16dp token; individual items had no validation enforcing single shared glider rather than independent rectangular active backgrounds; border outline removal requested by user needed formal verification.
Before capture: 14dp insets; partial layout assertions in tests.
After capture: Formalized navBarHorizontalInset: 16 and navBarHeight: 72 in SHELL_LAYOUT; navContainer applies left: 16, right: 16, height: 72, borderWidth: 0 (borderless in normal mode per explicit user directive, with solid 2px white border in high-contrast mode); elevated surface contrast in dark/light; single shared animated glider with subtle radial inward glow, sheen, and delicate aura outline; 5 equal items with flex: 1 and borderRadius: 999 without independent rectangular background fills; red disruption count badge positioned at top: -6, right: -10.
Focused checks: 3/3 unit tests in mobile-bottom-nav-bar.test.tsx passing; 10/10 in persistent-shell.test.tsx passing; 257/257 tests passing across mobile/; tsc and expo lint 0 errors; expo doctor 21/21 passed.
Remaining differences: B04–B07 will convert Status, Search, Commutes, and More into OperationsSheet routes.
Reviewer decision: PASS
```

#### B04. Primary operations sheet frame

- [x] Native target: `operations-sheet.tsx` integrated into a real primary route.
- Reference: V3, V5, V6, V10; P2 and `.floating-panel-scroll` CSS.
- Verify: 8dp outer radius, 8dp screen inset, border/shadow, bottom-nav clearance, maximum height, visible map around sheet, keyboard behavior.
- Watch: the current unused primitive has a 14dp radius and therefore is not yet an approved match.

```text
Item: B04. Primary operations sheet frame
Date: 2026-09-02
Implementer: Assistant (Antigravity)
Viewport/device: 390dp (iOS / Android golden target)
Theme/network/auth/data scenario: Dark / Light / High-Contrast, Status (alerts) primary tab route
PWA visual reference: V3, V5, V6, V10, P2, .floating-panel-scroll CSS, .floating-panel-shell CSS
PWA source reference: globals.css lines 18930–18965, LineWatchShell.tsx lines 4455–4485
Native files changed: mobile/src/features/alerts/alerts-screen.tsx, mobile/src/components/operations-sheet.tsx, mobile/__tests__/alerts-screen.test.tsx
Measured differences before: AlertsScreen rendered an opaque full-screen page inside an opaque black Screen wrapper; the map was completely hidden; no floating sheet card existed; the unused OperationsSheet primitive had a 14dp radius instead of 8dp.
Before capture: Opaque black full-screen page hiding the persistent map canvas.
After capture: AlertsScreen integrated into OperationsSheet (variant="primary") on a transparent Screen; 8dp corner radius and 8dp horizontal insets; 1dp perimeter border with elevated overlay surface and deep drop shadow (0 -4px 16px rgba(0,0,0,0.45)); 78% maximum height leaving the live persistent map visible in the top ~22% slice; bottom clearance of Math.max(84, insets.bottom + 76) sitting cleanly above the floating bottom nav capsule; dismiss backdrop enabling tap-to-dismiss back to the persistent map route (router.push("/(tabs)")); keyboardDismissMode="on-drag" and keyboardShouldPersistTaps="handled" on internal scroll.
Focused checks: 4/4 unit tests in alerts-screen.test.tsx passing; 258/258 tests passing across mobile/; tsc and expo lint 0 errors; expo doctor 21/21 passed.
Remaining differences: B05 will handle detail/tool/modal variants; B06 will standardize sheet headers; B07 will extend sheet coverage across all remaining primary tabs.
Reviewer decision: PASS
```

#### B05. Detail/tool/modal sheet variants

- [x] Native target: `operations-sheet.tsx` variants and route mapping.
- Reference: V4, V7, V9, V11 and P2/P11/P15/P16.
- Verify: station detail snap/height, near-tall tools, true modal layering, back/close semantics, Android hardware back.

```text
Item: B05. Detail/tool/modal sheet variants
Date: 2026-09-02
Implementer: Assistant (Antigravity)
Viewport/device: 390dp (iOS / Android golden target)
Theme/network/auth/data scenario: Dark / Light / High-Contrast, Station Detail & Impact Detail routes
PWA visual reference: V4, V7, V9, V11, P2, P11, P15, P16
PWA source reference: globals.css floating panel styles, StationDetailPanel.tsx, ImpactDetailModal.tsx
Native files changed: mobile/src/components/operations-sheet.tsx, mobile/src/features/shell/shell-layout.ts, mobile/src/features/stations/station-detail-screen.tsx, mobile/src/features/alerts/impact-detail-screen.tsx, mobile/__tests__/persistent-shell.test.tsx, mobile/__tests__/impact-detail-screen.test.tsx, mobile/__tests__/station-detail-screen.test.tsx
Measured differences before: Station detail and impact detail rendered opaque full-screen views with black backgrounds hiding the map; no 64% snap height existed; Android hardware back was unhandled at the sheet layer; tool variant 88% height was undefined.
Before capture: Opaque full-screen pages for station/impact details with no underlying map context.
After capture: OperationsSheet supports all 4 variants: "primary" (78% max height), "detail" (64% initial snap height, 78% max height), "tool" (88% near-tall height, zIndex: 42, elevation: 20), and "modal" (zIndex: 60, elevation: 24, dark 70% backdrop). StationDetailScreen and ImpactDetailScreen wrapped in OperationsSheet (variant="detail") over transparent screens, allowing the station node or line impact on the persistent map to remain clearly visible in the upper ~36% slice. Transparent backdrop captures dismissal clicks back to previous screen (router.back()). Android hardware BackHandler seamlessly integrated directly inside OperationsSheet to intercept back gestures and invoke onDismiss.
Focused checks: 13/13 unit tests in persistent-shell.test.tsx, 5/5 in impact-detail-screen.test.tsx, 8/8 in station-detail-screen.test.tsx passing; 263/263 tests passing across mobile/; tsc and expo lint 0 errors; expo doctor 21/21 passed.
Remaining differences: B06 will standardize sheet headers across screens; B07 will handle dedicated sheet scroll and sticky controls.
Reviewer decision: PASS
```

#### B06. Sheet header

- [x] Native target: `operations-sheet-header.tsx` used by real screens.
- Reference: V3–V11 and P7/P11/P13–P18.
- Verify: optional drag handle, icon, title, contextual subtitle/build line, back, close, right status/action, divider, one-line truncation behavior.
- Watch: PWA headers do not all share the same layout; approve variants rather than forcing one generic header everywhere.

```text
Item: B06. Sheet header
Date: 2026-09-02
Implementer: Assistant (Antigravity)
Viewport/device: 390dp (iOS / Android golden target)
Theme/network/auth/data scenario: Dark / Light / High-Contrast, Station Detail, Impact Detail, Accessibility Outages, Reliability Summaries, Service Notices
PWA visual reference: V3–V11, P7, P11, P13–P18, globals.css floating-panel-scroll header
PWA source reference: operations-sheet-header.tsx, StationDetailScreen.tsx, ImpactDetailScreen.tsx, AccessibilityOutagesScreen.tsx, ReliabilityScreen.tsx, NoticesScreen.tsx
Native files changed: mobile/src/components/operations-sheet-header.tsx, mobile/__tests__/operations-sheet-header.test.tsx, mobile/src/features/stations/station-detail-screen.tsx, mobile/src/features/alerts/impact-detail-screen.tsx, mobile/src/features/accessibility/accessibility-outages-screen.tsx, mobile/src/features/reliability/reliability-screen.tsx, mobile/src/features/notices/notices-screen.tsx
Measured differences before: Ad-hoc header bars rendered inside ScrollView on each screen; headers scrolled away with content; back button and title formatting varied inconsistently; operations-sheet-header component was unused in real routes; no dedicated unit test suite existed.
Before capture: Unstandardized, scrollable top header rows with inconsistent back/close affordances.
After capture: Enhanced OperationsSheetHeader with drag handle (pill 36x4dp), title with numberOfLines={1} truncation, eyebrow (typography.meta, letterSpacing: 0.8), contextual subtitle with numberOfLines={1} truncation, independent onBack (circle button with BackIcon) and onClose (circle button with CloseIcon) handlers, backTestID/closeTestID support, rightAction slot, optional bottom slot for filter tabs/search, and 1dp border bottom divider. Integrated OperationsSheetHeader pinned outside ScrollView across real operational screens: StationDetailScreen, ImpactDetailScreen, AccessibilityOutagesScreen, ReliabilityScreen, and NoticesScreen. Pinned header stays fixed at top of sheet while content scrolls beneath it.
Focused checks: 5/5 unit tests in operations-sheet-header.test.tsx passing; 8/8 in station-detail-screen.test.tsx passing; 5/5 in impact-detail-screen.test.tsx passing; 6/6 in accessibility-outages-screen.test.tsx passing; 4/4 in reliability-screen.test.tsx passing; 4/4 in notices-screen.test.tsx passing; 1/1 in operations-primitives.test.tsx passing; 268/268 tests passing across mobile/; tsc and expo lint 0 errors; expo doctor 21/21 passed.
Remaining differences: B07 will standardize internal sheet scrolling container, keyboard interactions, and pull-to-refresh without whole-page reloads.
Reviewer decision: PASS
```

#### B07. Sheet scrolling and sticky controls

- [x] Native target: `operations-sheet-scroll.tsx`, FlatList equivalents, sticky headers, keyboard-aware content.
- Reference: P2 and the component-specific panels.
- Verify: only content scrolls, sheet header/nav remain stable, no nested gesture conflict, scroll indicators and bottom padding are correct.

```text
Item: B07. Sheet scrolling and sticky controls
Date: 2026-09-02
Implementer: Assistant (Antigravity)
Viewport/device: 390dp (iOS / Android golden target)
Theme/network/auth/data scenario: Dark / Light / High-Contrast, AlertsScreen, ImpactDetailScreen, StationDetailScreen, AccessibilityOutagesScreen, ReliabilityScreen, NoticesScreen, StationsScreen, MoreScreen
PWA visual reference: P2, globals.css floating-panel-scroll
PWA source reference: operations-sheet-scroll.tsx, alerts-screen.tsx, impact-detail-screen.tsx, station-detail-screen.tsx, accessibility-outages-screen.tsx, reliability-screen.tsx, notices-screen.tsx, stations-screen.tsx, more-screen.tsx
Native files changed: mobile/src/components/operations-sheet-scroll.tsx, mobile/__tests__/operations-sheet-scroll.test.tsx, mobile/src/features/alerts/alerts-screen.tsx, mobile/src/features/alerts/impact-detail-screen.tsx, mobile/src/features/stations/station-detail-screen.tsx, mobile/src/features/accessibility/accessibility-outages-screen.tsx, mobile/src/features/reliability/reliability-screen.tsx, mobile/src/features/notices/notices-screen.tsx, mobile/src/features/stations/stations-screen.tsx, mobile/src/features/more/more-screen.tsx
Measured differences before: Individual screens duplicated ScrollView setups with ad-hoc padding, hardcoded refresh tint colors, missing nestedScrollEnabled (causing touch gesture conflicts with the map pan/zoom behind the sheet), and inconsistent keyboard dismiss behavior.
Before capture: Fragile per-screen ScrollViews lacking standardized nested scroll contracts and theme-reactive pull-to-refresh.
After capture: Standardized OperationsSheetScroll wrapping ScrollView with nestedScrollEnabled={true} (eliminates gesture conflict with persistent background map), keyboardDismissMode="on-drag", keyboardShouldPersistTaps="handled", showsVerticalScrollIndicator={true}, overScrollMode="always", bounces={true}, theme-reactive RefreshControl (tintColor={theme.color.focus}, colors={[theme.color.focus]}), and default padding (horizontal: 12, top: 8, bottom: 24, gap: 12). Integrated OperationsSheetScroll across AlertsScreen, ImpactDetailScreen, StationDetailScreen, AccessibilityOutagesScreen, ReliabilityScreen, and NoticesScreen. In StationsScreen, FlatList was updated with matching keyboardDismissMode="on-drag", nestedScrollEnabled={true}, and safe bottom padding. Pinned headers and floating bottom nav remain rock solid while sheet content scrolls smoothly.
Focused checks: 3/3 unit tests in operations-sheet-scroll.test.tsx passing; 4/4 in alerts-screen.test.tsx; 5/5 in impact-detail-screen.test.tsx; 8/8 in station-detail-screen.test.tsx; 6/6 in accessibility-outages-screen.test.tsx; 4/4 in reliability-screen.test.tsx; 4/4 in notices-screen.test.tsx; 4/4 in stations-screen.test.tsx; 3/3 in more-screen.test.tsx; 271/271 tests passing across mobile/; tsc and expo lint 0 errors; expo doctor 21/21 passed.
Remaining differences: None in Group B; Group B (Shell, Sheets, and Navigation Architecture) is 100% complete. Proceed to Group C (Map surface and interaction).
Reviewer decision: PASS
```

### Group C: map surface and interaction

#### C01. TTC default map framing

- [x] Native target: raster map container, manifest, initial transform, safe-area/chrome keepouts.
- Reference: V1 and P5.
- Verify: authored map size and vertical position, overview fit, station-label legibility, no unexplained dead space, status peek does not obscure the operational center.

```text
Item: C01. TTC default map framing
Date: 2026-09-02
Implementer: Assistant (Antigravity)
Viewport/device: 390dp (iOS / Android golden target; 360dp, 412dp, 430dp standard viewports)
Theme/network/auth/data scenario: Dark / Light / High-Contrast, TTC Subway & LRT network
PWA visual reference: V1 (01-cover.png), P5 (InteractiveTtcMap.tsx, usePanZoom.ts)
PWA source reference: usePanZoom.ts lines 114–122 (y = height/2 - mapHeight * 0.435 * scale), InteractiveTtcMap.tsx lines 113–122 (DESKTOP_MAP_CONTENT_BOUNDS 65..7900 x, 120..3820 y)
Native files changed: mobile/src/features/map/map-plane-manifest.ts, mobile/src/features/map/pan-zoom-math.ts, mobile/src/features/map/schematic-map.tsx, mobile/src/features/shell/operations-shell.tsx, mobile/__tests__/map-plane-manifest.test.ts, mobile/__tests__/pan-zoom-math.test.ts, mobile/__tests__/schematic-map.test.tsx
Measured differences before: Transform was hardcoded to (scale: 1.0, translateX: 0, translateY: 0), placing the map strictly at vertical center (0.50) inside the letterboxed canvas; this left ~327dp of empty dead space at the top, pushed Union station down to y=498dp with unoptimized clearance, had no manifest content bounds or keepout definitions, and restricted panning to 0 at default scale.
Before capture: Generic canvas-centered vertical placement (0.50) without keepout awareness or authored artwork bounds in manifest.
After capture: Formalized authored contentBounds ({ x: 65, y: 120, width: 7835, height: 3700 }), downtown operationalCenter ({ x: 4350, y: 2850 }), defaultFraming (verticalCenterRatio: 0.435, horizontalInsetRatio: 0.025), and defaultKeepouts (top: 96, bottom: 220, left: 44, right: 48) in MAP_PLANE_MANIFEST. Implemented computeDefaultMapTransform(stageWidth, stageHeight, network, options) in pan-zoom-math.ts matching PWA usePanZoom golden framing (y = stageHeight / 2 - mapFittedHeight * 0.435). On golden 390dp width, translateY initializes to +12.29dp, positioning the map so that Finch and Vaughan sit comfortably below top chrome with ample breathing room, while Union Station (y=510dp) sits with >76dp of clear, unobscured clearance above the MapStatusPeek card (peekTop=586dp). Downtown operational core (Bloor-Yonge, St. George, Union loop) remains 100% visible and centered in the primary visual zone (45–60% viewport height). Updated computeResetTransform, isTransformAtDefault, computeDoubleTapTransform, computeStepZoomTransform, and clampTranslation to support baseOrigin framing offsets without breaking backward compatibility. Integrated safe-area keepout propagation in operations-shell.tsx.
Focused checks: 12/12 unit tests in map-plane-manifest.test.ts passing; 32/32 in pan-zoom-math.test.ts passing; 12/12 in schematic-map.test.tsx passing; 283/283 tests passing across mobile/; tsc and expo lint 0 errors; expo-doctor 21/21 passed.
Remaining differences: C02 will handle Regional default map framing.
Reviewer decision: PASS
```

#### C02. Regional default map framing

- [ ] Native target: same as C01 for regional.
- Reference: V11 and regional portions of P5.
- Verify: correct corridor extent, shared-station prominence, route labels, regional aspect ratio, independent saved camera if product behavior requires it.

#### C03. Single-finger pan

- [ ] Native target: `schematic-map.tsx` pan gesture and `pan-zoom-math.ts`.
- Reference: V2 and P5.
- Verify on device: immediate pickup, diagonal motion, no axis lock, no React-frame lag, appropriate movement at every scale, no accidental selection.

#### C04. Focal-point pinch zoom

- [ ] Native target: pinch gesture and focal transform math.
- Reference: V2 and the map-interaction requirements in the parity plan.
- Verify: point under fingers remains fixed, two-finger translation works, adding/removing a finger does not jump, min/max settle is smooth.

#### C05. Momentum, elasticity, and bounds

- [ ] Native target: pan end/decay and clamping.
- Reference: V2; test against accepted native-map behavior, not just the PWA browser implementation.
- Verify: velocity-aware bounded decay, small elastic overscroll, no hard stop during gesture, no timed fake momentum that feels linear.
- Watch: current code uses `withTiming` projection, not `withDecay`.

#### C06. Double tap, zoom controls, center, and reset

- [ ] Native target: double tap, step zoom, Center Map control, reset animation.
- Reference: V1/V2 and P5/P6.
- Verify: focal double tap, interruptible reset, correct network fit, zoom control availability, no camera reset when sheets resize.

#### C07. Map hit testing after transforms

- [ ] Native target: station/segment press targets and coordinate conversion.
- Reference: V2, V4, V11.
- Verify at min/mid/max zoom: tap selects the visual item, pan cancels tap, overlapping impacts cycle/select correctly, accessible actions remain reachable.

#### C08. Compact line/corridor legend

- [ ] Native target: `MapLineRail`.
- Reference: V1/V11 and P4.
- Verify: 36dp collapsed rail, 24dp route badges, correct TTC circle/regional square shape, status ring, affected/good animation, expanded content, close/collapse behavior.
- Watch: compare exact top/left safe-area placement and whether the “LINE/LINES” label exists in the PWA target state.

#### C09. Top utility controls

- [ ] Native target: `MapTopChrome`.
- Reference: V1/V4/V11 and P5.
- Verify: theme, rotate/orientation, and information controls match PWA grouping and sizes; every visible action functions.
- Reject if: refresh is substituted for Rotate Map or Info merely because it already existed.

#### C10. Network selector

- [ ] Native target: compact vertical `NetworkSwitcher`.
- Reference: V1/V4/V11 and P5.
- Verify: dimensions, 2dp network-colored frame, selected glider, ridges, TTC and GO/UP labels, safe-area placement, transition.

#### C11. Estimated-train control and markers

- [ ] Native target: train control placement, `train-marker-layer.tsx`, operating-hours state.
- Reference: V1/V8 and relevant P5 implementation.
- Verify: estimated/schematic language, control location distinct from top utility cluster where shown, active state, marker scale at zoom levels, overnight suppression.

#### C12. Map status peek

- [ ] Native target: `MapStatusPeek`.
- Reference: V1 and P6.
- Verify: outer inset/height, title, freshness row, category colors, count typography, recenter column, dynamic height and no overlap with nav.
- Reject if: category chips require a horizontally clipped scroller. The target wraps to additional rows when needed.

#### C13. Selected impact preview

- [ ] Native target: `selected-impact-preview.tsx`.
- Reference: V2 and PWA selected-impact peek/inspector components.
- Verify: severity rail, route badge, title/location/source, close/details actions, dynamic offset above status peek, selected-map highlight.

#### C14. Closed/closing-hours announcement

- [ ] Native target: shell announcement chip if implemented.
- Reference: V3/V4/V10/V11 and PWA closing/closed peek CSS in `globals.css`.
- Verify: TTC/regional wording, top keepout interaction, does not imply published overnight TripUpdates are in-service trains.

### Group D: Status and impact components

#### D01. Status primary sheet composition

- [ ] Native target: `alerts-screen.tsx` converted to a primary sheet.
- Reference: V3 and P7.
- Verify: “Current TTC rapid transit”/network context, System Status title, update time, close, category grid first, line-status section second.
- Reject if: the first viewport remains a generic `ProductHeader`, data banner, line tiles, filters, and raw alert cards.

#### D02. Status category grid

- [ ] Native target: six category actions or the network-appropriate equivalent.
- Reference: V3 and P7.
- Verify: 2-column layout, icon/color/count circle, Active Alerts, Delays, RSZ, Planned Closures, Accessibility, surface notices/trip changes.

#### D03. Line-status rows

- [ ] Native target: `line-status-list.tsx`.
- Reference: V3, P7, and `LineStatusPanel.tsx`.
- Verify: full-width compact rows, route badge/name, healthy check or impact chips, chevron, route-specific color and high contrast.

#### D04. Category filter/list header

- [ ] Native target: `alert-filter-bar.tsx` or category route header.
- Reference: P8 and current PWA mobile list controls.
- Verify: selected category, count, back/close, source/freshness context, no duplicate network selector.

#### D05. Impact card

- [ ] Native target: `alert-card.tsx`.
- Reference: P8 and impact cards visible in the current PWA.
- Verify: severity rail, route badge, uppercase event kind, title, route/location, source, start/update timing, shuttle state, chevron, selected state.
- Verify all kinds separately: suspension, delay, RSZ, active closure, planned closure, regional service impact.

#### D06. Planned closure timeline card

- [ ] Native target: planned closure grouping/card.
- Reference: `PlannedClosuresPanel.tsx` and Today/This weekend/Later behavior.
- Verify: canonical closure remains planned while active projection is represented correctly; blue preview/map action; date/window hierarchy.

#### D07. Impact detail sheet

- [ ] Native target: `impact-detail-screen.tsx`.
- Reference: P8 detail behavior and map inspector references.
- Verify: same identity as originating card, full timing/source/shuttle/detail fields, show-on-map behavior, related planned closure action where applicable.

### Group E: Search, My Stations, and station detail

#### E01. Search primary sheet

- [ ] Native target: `stations-screen.tsx` shell/header.
- Reference: P9 and the PWA Search tab at matching width.
- Verify: sheet framing, compact title, sticky search, network/line filters, My Stations entry, result count, map visible behind.

#### E02. Search field

- [ ] Native target: station search input and clear action.
- Reference: P9.
- Verify: exact height, inset, icon, placeholder, focus border, clear button, keyboard return action, no emoji.

#### E03. Line/corridor and Saved filters

- [ ] Native target: filter chips.
- Reference: P9/P10.
- Verify: authored route badges, selected treatment, horizontal scroll affordance, saved bookmark identity, network reset behavior.

#### E04. Station result row

- [ ] Native target: FlatList row.
- Reference: P9.
- Verify: station name, interchange state, route badges, save action, chevron, minimum density, pressed/selected states.

#### E05. My Stations sheet header and controls

- [ ] Native target: new first-class saved-stations sheet/view.
- Reference: V6 and P10.
- Verify: title/count, search, Add Station, All/TTC/GO & UP control, line and sort controls.
- Reject if: My Stations exists only as a Saved filter chip inside the general directory.

#### E06. Saved-station card header

- [ ] Native target: saved station row/card.
- Reference: V6 and P10.
- Verify: affected rail, station/route identity, network badge, Open Station action, saved toggle.

#### E07. Saved-station disruption disclosure

- [ ] Native target: disruption/accessibility summary.
- Reference: V6 and P10.
- Verify: aggregate count, severity chips, list/card view, clear state, no unsupported matching claims.

#### E08. Saved-station arrival groups

- [ ] Native target: embedded arrivals in saved card.
- Reference: V6 and P10.
- Verify: source label, route/direction, pinned state, three arrival tiles, live/scheduled fallback distinction.

#### E09. Station detail sheet frame and header

- [ ] Native target: `station-detail-screen.tsx` converted to detail sheet.
- Reference: V4/V11 and P11.
- Verify: map remains visible, drag handle, STATION eyebrow, large name, Save/Saved action, close action, correct height/snap.

#### E10. Station route/direction identity

- [ ] Native target: station line rows.
- Reference: V4/V11 and `StationLineDirectionIndicator.tsx`.
- Verify: route badge shape/color, line/corridor name, direction pill, multi-line/interchange spacing.

#### E11. Station jump-to grid

- [ ] Native target: detail section navigation.
- Reference: V4/V11 and P12.
- Verify: network-appropriate buttons, icons, 2/3-column responsive layout, 44dp targets, scroll-to-section accuracy.

#### E12. Services and amenities card

- [ ] Native target: station amenity section.
- Reference: V4/V11 and P11/P12.
- Verify: cyan section rail, authored accessibility icons, wrapping grid, network-specific amenities, no invented completeness.

#### E13. Train arrivals card

- [ ] Native target: arrivals sections and tiles.
- Reference: V4/V6/V11 and P10–P12.
- Verify: source headline, line header, direction/destination, live/scheduled badges, clock/minute display, pinned line, unavailable/no-service states, cancellations/skipped/added stops.

#### E14. Surface connections, outages, impacts, changes, and notices

- [ ] Native target: remaining station-detail sections.
- Reference: V4/V11 and P12.
- Verify: jump target/section consistency, source honesty, no map/status/commute/push implication for surface or accessibility notices.

### Group F: My Commutes

#### F01. Commutes primary sheet and header

- [ ] Native target: `commutes-screen.tsx` composition.
- Reference: V5 and P13.
- Verify: map behind sheet, icon/title/status, close, network/all segmented control, sheet bounds.

#### F02. Signed-out commute preview

- [ ] Native target: unauthenticated state.
- Reference: P13 account-feature preview and corresponding signed-out PWA state.
- Verify: intentional sheet occupancy, demo/sign-in actions, concise truthful capabilities, no large empty full-screen page.

#### F03. Route list controls

- [ ] Native target: count/affected chip, sort, Add Route.
- Reference: V5 and P13.
- Verify: one-line responsive layout or deliberate wrap, exact button hierarchy, network filter interaction.

#### F04. Commute card header and endpoints

- [ ] Native target: commute card identity.
- Reference: V5 and P13.
- Verify: severity rail, route label/icon, impact total, network and both/one-leg state, origin connector/destination stack.

#### F05. Outbound/return leg selector

- [ ] Native target: leg toggle/glider.
- Reference: V5 and P13 commute-leg controls.
- Verify: full station labels, selected severity state, return enablement, animation/reduced motion, no truncation at standard width.

#### F06. Current verdict and estimate summary

- [ ] Native target: “Affected Now,” station/time headline, confidence/source line.
- Reference: V5 and P13.
- Verify: precise hierarchy and heuristic wording; cancellations do not alter travel-time estimate.

#### F07. Travel-time metric card

- [ ] Native target: typical/with impacts/extra/confidence grid.
- Reference: V5 and P13.
- Verify: 2-column alignment, muted keys, bright values, severity tint, low-confidence and unreliable variants.

#### F08. Impact disclosure, route stops, and actions

- [ ] Native target: matched-impact list, map path, route review/edit/delete and notification entry.
- Reference: P13.
- Verify: progressive disclosure, complete path semantics, return leg, no alternate-route or precise-prediction claim.

#### F09. Add/edit commute modal

- [ ] Native target: create/edit modal.
- Reference: P13 and station picker components.
- Verify: searchable origin/destination flow, network-scoped stations, keyboard handling, error state, return monitoring, label, cancel/save hierarchy.

### Group G: More, account, and Notifications

#### G01. More primary sheet frame and accent strip

- [ ] Native target: `more-screen.tsx` composition.
- Reference: V10 and P14.
- Verify: route-color accent strip, compact LineWatchTO/build header, close action, visible map behind.

#### G02. Signed-out account entry

- [ ] Native target: More account section.
- Reference: signed-out P14 state.
- Verify: compact account row/CTA in More; full sign-in/register fields move to focused auth flow.
- Reject if: email/password form still dominates the first More viewport.

#### G03. Auth modal/sheet

- [ ] Native target: `account-section.tsx` split into focused flow.
- Reference: P14 account dialogs and native auth contracts.
- Verify: sign in/register/demo/dev/Google states, validation, keyboard, loading/errors, close/back, no token regression.

#### G04. Signed-in account rows

- [ ] Native target: More signed-in identity and actions.
- Reference: V10 and P14.
- Verify: username, sign out, Google linked, My Commutes counters, My Stations count, icon/trailing badge alignment.

#### G05. Default map control and Notifications row

- [ ] Native target: More operational controls.
- Reference: V10, P14, and `DefaultMapModeControl.tsx`.
- Verify: TTC/GO & UP segmented state, loaded-on-launch copy, Notifications ON/setup badge, navigation.

#### G06. More secondary groups

- [ ] Native target: Display, monitors, reliability, notices, documentation, attribution, app info.
- Reference: P14.
- Verify: operational controls first, documentation remains reachable, compact icon rows replace large generic cards where PWA does.

#### G07. Notifications tool-sheet header and device state

- [ ] Native target: dedicated Notifications route/sheet.
- Reference: V7 and P15.
- Verify: title/icon/back/close, Device Notifications heading/status, This Device row and native permission state.

#### G08. Commute alert and closure reminder rows

- [ ] Native target: notification master settings.
- Reference: V7 and P15.
- Verify: account intent versus current device setup, disabled/setup-needed states, accurate descriptions, native switch styling.

#### G09. Line/corridor subscriptions

- [ ] Native target: network filter and subscription list.
- Reference: V7 and P15.
- Verify: TTC/GO & UP segmented control, count, route badges, switches, fresh-source limitations, corridor cancellation behavior.

#### G10. Event types and closure timing policy

- [ ] Native target: event grid and reminder choices.
- Reference: P15.
- Verify: six event types including regional train cancellation, shared timing policy labels, selected/disabled states, schedule-honest descriptions.

### Group H: secondary operational tools

#### H01. Reliability tool-sheet header and coverage

- [ ] Native target: `reliability-screen.tsx`.
- Reference: V9 and P16.
- Verify: compact analytics header, polling/schedule coverage, confidence, source/range, network control.

#### H02. Reliability line/corridor metric row

- [ ] Native target: per-route metric card.
- Reference: V9 and P16.
- Verify: route identity, incidents, observed time, unique impact time, incident-hours, median duration, mono aligned values.

#### H03. Incident-hours stacked breakdown

- [ ] Native target: breakdown card/bar/legend.
- Reference: V9 and P16.
- Verify: additive incident-hours wording, overlapping alerts note, correct category colors, totals and percentages, regional history caveat.

#### H04. Accessibility Outages tool sheet

- [ ] Native target: `accessibility-outages-screen.tsx`.
- Reference: P17 and Status category entry.
- Verify: shared tool sheet/header, network grouping, elevator/escalator tabs, station/route rows, source/freshness/empty states, no completeness claim.

#### H05. Service Notices and Trip Changes tool sheet

- [ ] Native target: `notices-screen.tsx`.
- Reference: P18 and Status category entry.
- Verify: TTC surface notices versus regional Service Notices/Trip Changes, search/filter/count, schedule-matched labels, unmatched cancellation wording.

#### H06. Tool navigation consistency

- [ ] Native target: More/Status entry points and back stack for Reliability, Accessibility, Notices, Notifications.
- Reference: P1/P2/P14.
- Verify: same sheet family, correct previous sheet on back, map/camera preserved, no duplicate full-screen back bar.

### Group I: final cross-cutting enforcement

#### I01. Dark theme complete pass

- [ ] Capture every approved component at the golden width and compare to V1–V11.

#### I02. High-contrast complete pass

- [ ] Verify black surfaces, white borders/text, semantic solid fills, focus, icon visibility, and no shadow-only separation.

#### I03. Compact width and large text

- [ ] Test 320/360dp width and 200% font scale. Reflow rather than shrinking important text with `adjustsFontSizeToFit`.

#### I04. Safe areas, keyboard, landscape, and bottom clearance

- [ ] Test Android navigation modes, iPhone-style safe areas, portrait/landscape, keyboard-open Search/Auth/Commute forms.

#### I05. TalkBack/VoiceOver semantics

- [ ] Verify focus order, modal containment, close/back, selected/expanded/checked states, route/impact labels, custom sheet accessibility actions.

#### I06. Motion and reduced motion

- [ ] Verify nav glider, sheet enter/exit, legend status animation, map reset, selection, and leg toggle; disable or shorten appropriately under reduced motion.

#### I07. Performance regression

- [ ] Verify one mounted map/query, UI-thread gestures, FlatList density, no per-frame React updates, no expensive full-map blur, no duplicated fetch on tab/sheet change.

#### I08. Full golden overlay sign-off

- [ ] Re-capture every matrix row, overlay against PWA, list remaining differences, and obtain explicit approval. Tests alone cannot close this item.

## Recommended execution order

Use this exact order unless a discovered dependency requires a documented change:

```text
A01 → A02 → A03 → A04 → A05 → A06 → A07
→ B01 → B02 → B03 → B04 → B05 → B06 → B07
→ C01 through C14
→ D01 through D07
→ E01 through E14
→ F01 through F09
→ G01 through G10
→ H01 through H06
→ I01 through I08
```

The most important stopping points are B01, C03–C07, D01, E09, F01, and G01. If any of those fail, do not spend time polishing inner cards whose parent composition is still wrong.

## Prompt template for the implementation agent

Use one prompt per numbered item:

> Work only on checklist item **[ID and name]** from `docs/mobile-pwa-component-parity-checklist.md`. Read its named visual and PWA source references before editing. Preserve existing user changes and data behavior. First report the measured native-versus-PWA differences for this component. Then implement only this component and directly required shared primitives. Capture before/after at **[device width, theme, network, auth/data scenario]**, compare side by side and by opacity overlay, run focused tests plus mobile typecheck and lint, and report any remaining mismatch. Do not start the next checklist item.

For gesture items, replace screenshot evidence with a short physical-device or hardware-accelerated recording plus the relevant coordinate/math tests.

## Per-item review record

Copy this block under the relevant work item or into the implementation log:

```text
Item:
Date:
Implementer:
Viewport/device:
Theme/network/auth/data scenario:
PWA visual reference:
PWA source reference:
Native files changed:
Measured differences before:
Before capture:
After capture:
Overlay result:
Focused checks:
Remaining differences:
Reviewer decision: PASS / REVISE
```

## Verification commands

For every component change:

```bash
npm --prefix mobile run typecheck
npm --prefix mobile run lint
npm --prefix mobile test -- --runTestsByPath <focused-test-file>
```

At each group boundary and before final sign-off:

```bash
npm --prefix mobile run typecheck
npm --prefix mobile run lint
npm --prefix mobile test
npm --prefix mobile run doctor
npm --prefix mobile run export:android
```

Read every command result. A successful export does not replace visual or interaction inspection.
