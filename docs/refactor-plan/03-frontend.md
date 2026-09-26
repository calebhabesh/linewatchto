# Frontend TypeScript refactor chunks

Read the [index](README.md), [frontend guide](../../frontend/AGENTS.md), and
[verification](01-verification.md). This workstream owns application state and
data flow; renderer internals belong to [maps](04-maps.md). Keep these changes
separate from CSS appearance changes.

## F1 — Dashboard session lifecycle

**Evidence:** [LineWatchShell](../../frontend/src/components/LineWatchShell.tsx),
lines 350/365/411/435, owns snapshot freshness, connectivity, hydration,
polling/retry/save; lines 496/513 duplicate network polling effects. Runtime
flow is `page.tsx → LineWatchShell → dashboard clients/adapters → DataProvider`.

**Change:** extract `useDashboardSession` to own the existing request lifecycle,
network-keyed states, snapshot hydration, visibility/reconnect listeners, and
clock/freshness updates. Inputs should describe initial TTC data, selected
network, offline-shell mode and scenario configuration. Return display data and
the per-network state the shell actually needs. Keep existing
[dashboard-client](../../frontend/src/app/dashboard-client.ts),
[adapter](../../frontend/src/app/dashboard-adapter.ts),
[contract](../../frontend/src/app/dashboard-contract.ts), and
[snapshot](../../frontend/src/app/dashboard-snapshot.ts) helpers as the pure
seams. Replace the opaque `getDashboardRefresh(networkId, true)` argument with
a named option when updating callers.

**Acceptance:** preserve seven-day snapshots, two-minute verification,
independent network state, source labels, last-good retention, deferred
reliability, and regional scenario behavior. Characterize late response order,
including deferred reliability completion after network/account/navigation
changes, before deciding whether correction is needed. Verify hydration,
reconnect, tab hide/show, offline startup and failed refresh.

Introduce generation-based rejection only in a characterized corrective
subchunk when required. Switching networks does not by itself invalidate a
successful response for the other network's independent cached state.

Use `dashboard-client`, `dashboard-snapshot`, and `dashboard-data` fast tests;
add meaningful lifecycle coverage and run offline/dashboard/cross-network
browser flows. **Done:** the shell renders a session result without owning
polling timers/listeners or duplicating freshness decisions. Risk: high.

## F2 — Account transport and feature clients

**Evidence:** [account-data](../../frontend/src/app/account-data.ts), lines
20–646, mixes auth, commute, preference and push types; request transport begins
at 737, account reads at 808, commute operations at 915 and push at 1001.
[saved-station-data](../../frontend/src/app/saved-station-data.ts), line 28,
duplicates credentialed error/request handling.

**Change:** first extract shared account request/error transport used by both
files. Then split auth, commute contracts/rules/client, and push contracts/client
by existing callers. Each substep updates real consumers atomically. Preserve
an old export facade only when necessary, with a named removal chunk. Keep
operation-specific normalization/fallback in the feature client.

**Acceptance:** `credentials: include`, status/error codes, non-JSON/empty
successful responses, unavailable account service versus actual logout, legacy
commute legs and saved-station network defaults, preference normalization.
`account-data.ts:840` deliberately distinguishes outage from unauthenticated.
Use `account-data`, `saved-station-data`, `account-validation`, and affected
push preference/device tests. Preserve endpoint shapes and Server/Client imports.

**Done:** one account transport implementation, cohesive feature imports, no
duplicate compatibility facade left indefinitely. Risk: moderate. Avoid a
universal client or schema-library migration.

## F3 — Account session and dialog ownership

Depends on F2. **Evidence:** [LineWatchShell](../../frontend/src/components/LineWatchShell.tsx),
lines 656–717, owns form/session state; refresh/config at 1854/1885,
saved-station refresh at 2035, sign-out at 2557, dialogs at 6623.

Implement separately: (a) `useAccountSession` for session refresh/retry/logout
and user-generation ownership; (b) `AccountDialog` for form modes, validation
and submission. The dialog receives typed entry intents; OAuth/deep-link
interpretation stays coordinated with F4. Keep saved-station mutations within
their feature rather than collecting every account concern in the new hook.

**Acceptance:** login/logout during outstanding commute/station reads cannot
populate the next user's state; service outage retains the signed-in state as
currently intended; verification/reset links and Google link success/error
behave consistently. Preserve focus, dismissal, accessible names, and pending
submission behavior. Use `account-oauth-error`, `account-validation` and
`tests/smoke/account-view-transitions.spec.ts` plus relevant existing tests.

**Done:** both session and dialog have clear callers and the shell no longer
owns their internal state. Replace affected `account-ui-source` assertions
with behavior coverage in this chunk. Risk: high for account isolation.

## F4 — Navigation and selection transitions

Perform after session extractions. **Evidence:**
[LineWatchShell](../../frontend/src/components/LineWatchShell.tsx), line 1397,
resets parallel states on close; line 1422 handles submenu back, station return,
commute preview and animations; line 1526 handles browser back; line 1897 parses
deep links. [view-navigation](../../frontend/src/app/view-navigation.ts)
already supplies small history helpers.

**Change:** write a transition table first. Extract pure transitions for a
cohesive navigation state and typed events; a hook owns browser history and
transition timers. Return state/commands callers need. Keep layout choices in
desktop/mobile presentation. Avoid relocating every shell state into a giant
reducer or passing a large bag of setters to an extracted function.

Required rows: map → station → impact → back; search → station → back;
commute → preview → back; cross-network station selection; close versus
submenu back; browser Back and Escape; `panel`, `line`/`lineId`, `station`,
impact and OAuth URL parameters. Preserve selection/camera restoration,
account-entry intents, and history behavior.

**Acceptance:** table cases tested through production transitions plus integrated
browser flows. Use `view-navigation`, `commute-navigation-restoration`,
`account-oauth-error`, desktop/mobile shell and dashboard flows. Run the broad
shell gates from verification once stable. **Done:** one transition owner for
the extracted behavior and no competing shell resets. Risk: high interaction
sensitivity; split by a coherent transition family if necessary.

## F5 — Station request lifecycle, then presentation

**Evidence:** [MyStationsPanel](../../frontend/src/components/MyStationsPanel.tsx),
lines 1253/1287, polls on interval and visibility with an unmount flag; two
requests in the same mount can overlap. In contrast,
[RegionalStationDetailPanel](../../frontend/src/components/RegionalStationDetailPanel.tsx),
line 423, uses abort plus request IDs. Source badge policies also repeat across
that file (270), [StationDetailPanel](../../frontend/src/components/StationDetailPanel.tsx)
(296) and My Stations (231/251).

1. Use deferred responses to reproduce whether an older response can overwrite
   a newer one. Treat a confirmed race correction as a separate change from
   extraction. Give station reads explicit keys/generations and an in-flight,
   visibility and abort policy, reusing the existing guarded pattern. Keep
   per-network adapters and last-good/freshness policy explicit.
2. Once behavior is stable, extract identical source-label decisions and small
   arrival elements. Retain TTC/regional data differences; a single highly
   configurable station panel would add complexity.

The TTC `getStationDetail` adapter currently accepts fetcher/base-URL options
without forwarding an abort signal. Generation/in-flight control may suffice.
If cancellation is added, extend the adapter explicitly and distinguish an
intentional abort from its catch-all fixture fallback; cancellation must not
replace current data with demo data.

**Acceptance:** newest accepted response wins; old station/user results cannot
populate a new selection; unmount/hide/reconnect behavior is defined; HTTP
failure grace and source-labeled unavailable/scheduled fallback survive. Use
`station-data`, `station-arrivals`, `regional-arrivals`, `arrival-tile-source-indicator`,
`saved-station-data`, and relevant station/My Stations browser flows. Measure
request counts for N stations and visibility changes before claiming savings.

**Done:** request ownership is explicit and shared presentation has one rule
owner. Risk: moderate to high; race is a candidate, not a reproduced bug yet.

## F6 — Commute notification edit model and focused editors

Depends on F2; coordinate preview with F4. **Evidence:**
[SavedCommutesPanel](../../frontend/src/components/SavedCommutesPanel.tsx),
lines 573–712, embeds scoping/time/mask/validation rules; editor starts at 716,
panel at 980, rule saves at 1464. `account-data.ts:665` separately normalizes
stored rules for wire compatibility.

**Change:** extract the pure notification edit model and test it directly.
Then extract its editor. Separately move a cohesive route draft editor and
saved-commute card/list where that gives each a clear input/output. Preserve
wire normalization as a distinct responsibility from edit validation.

**Acceptance:** Toronto-time days/windows; independent outbound/return legs;
network-specific options; notification rules survive route edits; drafts and
map preview survive back navigation; source-labeled timing remains honest.
Use `ttc-commute-route-editing`, `regional-commutes`,
`commute-navigation-restoration`, `saved-commute-menu-counts`, and pure
schedule/mask/invalid-window tests. Browser: edit route → preview → back,
then save a notification rule.

**Done:** rules and editor behavior are understandable without reading the
whole list panel. Risk: moderate; no routing or notification feature changes.

## F7 — Residual modules and conditional dead-code cleanup

Complete after the related owners stabilize. Inventory runtime imports,
dynamic imports, package/config entry points, generator references, public
asset URLs and test-only utilities before classifying a candidate as unused.

- [station-data](../../frontend/src/app/station-data.ts) is large partly because
  lines 537–1857 contain explicit fixture seeds. Split contracts, static catalog,
  fixture construction and HTTP adapter only where navigation improves. Keep
  complete fallback; fixtures and reviewed data are not algorithmic bloat.
- [Stepper.jsx](../../frontend/src/components/Stepper.jsx) and
  [ElectricBorder.tsx](../../frontend/src/components/ElectricBorder.tsx) are
  forwarding-file candidates. Runtime searches point to `Stepper.tsx` and
  `ui/ElectricBorder`; confirm TypeScript/bundler resolution and all tracked
  callers before deleting either wrapper. Build verifies resolution after deletion.
- `background-preference.ts` has real shell/mobile consumers; its small size
  is not evidence it should disappear.
- Move dashboard contracts out of a React file only if it clarifies dependency
  direction. Split `DataContext` subscriptions only after profiler evidence.

**Done:** each candidate has a caller-based disposition, consumers/imports and
tests agree, and no compatibility wrapper remains without a purpose.

## Preserve existing useful structure

The service worker excludes API/account navigation from caching and preserves
active push registration; no rewrite is justified by this audit. Keep storage
versions, snapshot timestamps, installation identity, pending worker updates,
and legacy formats unless a migration is deliberately designed and verified.
There are only two Next route handlers (`healthz`, `version.json`); API traffic
is rewritten to Java. Do not invent an API-route consolidation project.
