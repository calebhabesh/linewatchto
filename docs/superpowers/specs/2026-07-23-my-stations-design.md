# My Stations Design

Date: 2026-07-23  
Status: Implemented

## Purpose

Add an account-backed station watchlist for signed-in LineWatchTO users. A rider
can save stations they use often, scan station-specific conditions in one
place, and open the existing station detail panel without finding the station
on the map again.

My Stations complements Saved Commutes rather than replacing it:

- Saved Commutes answers whether a complete origin-to-destination rapid-transit
  route is affected and how matched impacts change its travel-time estimate.
- My Stations answers what is happening at specific places the rider cares
  about, including directly linked station impacts and accessibility outages.

The first release is an in-app watchlist. It does not add My Stations push
notifications, infer all line-segment alerts as station alerts, or claim live
arrivals when the station arrival response is not source-labeled live.

## Product Decisions

- Persist saved stations to the authenticated account, using stable station IDs.
- Use the Lucide `Bookmark` icon everywhere the feature appears.
- Use LineWatchTO sky blue for the saved state. Blue is appropriate for a
  personal/navigation action and avoids red, orange, and TTC line colors that
  already communicate service meaning. The unsaved state is a neutral outline;
  the saved state is a filled blue bookmark.
- Add My Stations beneath Saved Commutes in the desktop Account menu.
- Add both Saved Commutes and My Stations beneath the account actions in the
  mobile More sheet, in that order. The Saved Commutes row opens the existing
  Commutes bottom-nav destination; it does not create a duplicate panel.
- Keep Account-menu feature rows visible only while authenticated. Station-level
  bookmark actions remain discoverable while signed out and open the existing
  sign-in/create-account flow instead of pretending to save locally.
- Use an inline mini station picker from My Stations for `+ Add Station`.
  Do not redirect away to global search.
- Also add bookmark actions to station details and global station-search rows.
- Do not add push notifications in this slice.

## Why The Feature Is Not Redundant

A commute is a route with two endpoints, a computed path, directional matching,
timing heuristics, and notification rules. A saved station is a lightweight
place watch. It remains useful for:

- a transfer station used across several trips;
- a station near home, work, school, or an event;
- watching station-specific elevator/escalator outages;
- quickly reopening arrivals and platform accessibility details;
- stations that are not endpoints of a saved commute.

The feature would become redundant if My Stations only rendered station names.
Its list therefore needs a compact station health summary and a direct path to
station details.

## Navigation And Panel Behavior

Add `my-stations` to the shell's active-view model.

### Desktop Account Menu

For an authenticated account, order the relevant rows as:

1. Sign Out
2. Google link status/action when applicable
3. Saved Commutes
4. My Stations

The My Stations row uses the bookmark icon and may show a single count badge for
the total number saved. It should not show red/orange status counts in the
Account menu; the submenu is the place for service meaning.

### Mobile More Account Section

For an authenticated account, add:

1. Saved Commutes
2. My Stations

immediately after the Google link status/action. Saved Commutes calls the same
shell transition as the Commutes bottom-nav item. My Stations opens the new
mobile sheet. Closing or backing out follows the existing one-sheet-at-a-time
model.

Do not add My Stations to the five-item mobile bottom navigation. It is a useful
account shortcut, not a primary destination that should displace Map, Status,
Search, Commutes, or More.

### My Stations Panel Header

Use the existing alert-panel structure:

- Back action.
- Blue bookmark icon.
- `My Stations` title.
- Saved count badge.
- Close action.

On desktop, Back returns to the main menu. On mobile, Back returns to More.
Close returns to the map.

## My Stations List

### Controls

Use a two-row control block derived from `ImpactListToolbar` styling.

Top row:

- Search input with placeholder `Search saved stations...`.
- `+ Add Station` button.

Bottom row:

- Line filter: `All Lines`, then Lines 1, 2, 4, 5, and 6.
- Sort selector.

Sort options:

- `Needs Attention` (default): current directly linked station impacts first,
  then active accessibility outages, then clear stations; ties use name.
- `Name A-Z`.
- `Recently Saved`.
- `Oldest Saved`.
- `Line` using the lowest served-line sort order, then station name.

An interchange matches every served-line filter. Search and line filtering are
client-side over the authenticated user's saved list; do not send a request per
keystroke.

On narrow mobile widths, keep the top row intact with a flexible search field
and a compact `+ Add` visual label while retaining `Add Station` as the
accessible name. The bottom selectors divide the available width evenly and
keep 44px touch targets.

The controls remain visible when the list is empty, consistent with the alert
submenus. Disabled filters are acceptable until the first station is saved.

### Empty And Filtered States

- No saved rows: centered muted copy `No Saved Stations`, followed by an
  `+ Add Station` action.
- Saved rows exist but no filter/search match: `No Saved Stations Match` and a
  `Clear Filters` action.
- Account API failure: show a retryable `Could not load saved stations` state;
  do not replace account data with fixture-owned saved relationships.

### Station Rows

Each row shows:

- station display name;
- served-line badges;
- a short, source-honest state such as `No active station impacts`,
  `1 active station impact`, or `2 accessibility outages`;
- warning/accessibility badges already used by station search where applicable;
- a filled bookmark action to remove the station;
- a chevron or `Open` action for station details.

Selecting the main row closes My Stations and opens the existing station detail
panel/map selection. Removing a station does not require a confirmation dialog
because the operation is reversible. Show a short Undo toast that restores the
relationship with the same PUT operation.

Do not put full arrival boards or full alert cards in the watchlist for the
first release. That would make the panel expensive and visually duplicate the
station detail panel. The station detail remains the source for arrivals,
platform accessibility, directly linked impacts, and outage details.

## Add Station Mini Picker

Pressing `+ Add Station` changes the panel body to a picker while preserving the
panel header and Back behavior.

The picker should reuse the station search data and row presentation, with a
focused task-specific mode:

- Search field placeholder `Search all stations...`.
- Browse by Lines 1, 2, 4, 5, and 6 when the query is empty.
- Station rows retain line, impact, accessibility, and outage badges.
- Unsaved stations show `Add` plus an outline bookmark.
- Saved stations show `Saved` plus a filled blue bookmark and remain available
  to remove or leave unchanged.
- Adding is optimistic and keeps the picker open so several stations can be
  added in one visit.
- A persistent `Done` action returns to the filtered My Stations list.

This should share extracted station-result primitives with the global search,
not embed `StationSearchPanel` unchanged. The current global result is itself a
button, so adding a nested bookmark button would create invalid interactive
markup. Refactor the station result into a non-interactive row container with:

- one primary button that opens station details; and
- one sibling bookmark button.

Both actions need independent focus, accessible names, and 44px mobile targets.

## Station Detail Bookmark

Add a bookmark action immediately before the existing Close button in every
station detail panel.

The visual control is a fixed-width stack:

- 44px icon button;
- small `Save` label below when unsaved;
- small `Saved` label below when saved.

Keep the stack width stable so long station names and async state changes do not
shift the header. On mobile, allow the station name to wrap while the two header
actions remain fixed. The bookmark button's accessible name is either
`Save {station name} to My Stations` or `Remove {station name} from My
Stations`.

Signed-out behavior:

- Render the outline bookmark to preserve discoverability.
- Pressing it opens the existing account-choice dialog with concise context:
  `Sign in to save stations.`
- Do not persist a browser-only station and silently migrate it later.

Authenticated behavior:

- Optimistically fill/unfill the icon.
- Disable repeat activation while the request is pending.
- Revert and announce a concise error if the request fails.
- Keep the saved state synchronized with My Stations and global search.

## Global Search Integration

Add the same sibling bookmark action to every station result in both queried
results and browse-by-line results. Alert-category and alert-result rows are
unchanged.

Saving from search must not open station details or close search. Opening the
main station-result area retains the existing behavior. On mobile, saving must
not cause the keyboard to close or the result list to jump to the top.

The global saved-station ID set should be account state owned by
`LineWatchShell` or a focused account-station hook/context. Do not let the
station detail, global search, and My Stations panel each fetch independent
copies.

## Backend Data Model

Add an account-owned join table through Flyway:

```sql
create table saved_stations (
    account_id varchar(80) not null references accounts(id) on delete cascade,
    station_id varchar(80) not null references stations(id) on delete cascade,
    created_at timestamptz not null,
    primary key (account_id, station_id)
);

create index saved_stations_account_created_idx
    on saved_stations (account_id, created_at desc);
```

The composite primary key prevents duplicates without exposing a meaningless
saved-station ID. `created_at` supports recent/oldest sorting. The station
foreign key prevents saving unknown stations and automatically follows canonical
station display-name changes because only the stable ID is stored.

Do not store station names, alert state, arrival rows, or notification settings
in this table.

## Account API

Add authenticated endpoints:

```text
GET    /api/account/stations
PUT    /api/account/stations/{stationId}
DELETE /api/account/stations/{stationId}
```

`PUT` and `DELETE` are deliberately idempotent. Bookmark controls can safely
retry without creating duplicate rows or treating an already-removed station as
an error.

Representative list response:

```json
{
  "stations": [
    {
      "station": {
        "id": "sheppard-yonge",
        "name": "Sheppard-Yonge",
        "lineIds": ["line-1", "line-4"],
        "hasActiveImpact": false,
        "accessStatus": "normal",
        "accessOutageCounts": {
          "elevator": 0,
          "escalator": 0
        }
      },
      "savedAt": "2026-07-23T14:30:00Z"
    }
  ]
}
```

The station object should reuse the existing station-summary contract and its
freshness rules. Dynamic impact/outage flags must disappear when ingestion is
stale just as they do in `/api/stations`; a saved relationship itself remains.
Avoid one station-detail request per saved row.

`PUT` returns the saved entry and `201 Created` when newly inserted or `200 OK`
when it already exists. `DELETE` returns `204 No Content` whether or not the
relationship existed.

Backend validation and ownership rules:

- Require the existing authenticated account cookie.
- Validate station IDs with the existing 80-character station-ID cap.
- Return `404 unknown_station` when PUT targets an unmapped station.
- Never accept an account ID from the client.
- Use the existing account mutation origin/CSRF protections.
- Apply a conservative per-account mutation rate limit using the established
  account rate-limit approach; station saves should not share the stricter login
  failure bucket.

## Frontend State And API Adapter

Extend `account-data.ts` or add a focused `saved-station-data.ts` adapter with:

- `AccountSavedStation` and list response types;
- list, save, and remove methods;
- normalization of station summary fields;
- typed account/unavailable errors.

Load the list once after authentication is established. Clear it immediately on
sign-out or session invalidation. Share the resulting rows and pending station
IDs across:

- desktop Account menu count;
- mobile More navigation;
- My Stations panel;
- StationDetailPanel;
- StationSearchPanel.

When a save/remove succeeds, reconcile with the server response. When it fails,
rollback the optimistic state and present one localized error/toast. Avoid a
full dashboard reload.

## Freshness And Data Claims

The saved relationship is account data and does not expire. The content shown
beside it follows existing source rules:

- Current station impacts and accessibility outages appear only from fresh
  dashboard-visible ingestion records.
- Search/list summaries must not imply a station is clear when the backend is
  unavailable; use `Status unavailable`.
- Arrivals remain inside station detail and retain their existing source label:
  scheduled, live, mixed, unavailable, or demo.
- Do not describe My Stations as monitoring in the background or sending alerts.

## Notifications Decision

Do not add My Stations push notifications in the first release.

Reasons:

- Saved Commutes already provides route-aware current-impact and closure push
  rules.
- A station subscription can easily duplicate saved-commute and line-wide
  notifications.
- Station notifications need separate product decisions for direct station
  alerts versus passing segment impacts, accessibility outages, planned
  closures, quiet windows, deduplication, and restored events.
- A simple bookmark should not silently create notification consent.

If demand appears later, notifications should be a separate explicit per-station
setting, default off. The cleanest differentiated scope would be directly linked
station impacts and accessibility outages. It should reuse the existing push
lifecycle/deduplication infrastructure and define cross-stream duplicate
suppression before release.

## Accessibility And Interaction Requirements

- Every bookmark action exposes saved state through `aria-pressed`.
- Icon-only controls have complete station-specific accessible names.
- Filled versus outline state is not the only cue; visible `Save`/`Saved` text
  appears in station detail and picker rows.
- Search-result primary and bookmark actions have a predictable keyboard order.
- Focus returns to `+ Add Station` when leaving the mini picker and to the
  invoking menu row when closing the panel where practical.
- Empty, loading, saving, error, and undo messages use appropriate live regions
  without announcing the whole list after each mutation.
- High-contrast mode gives the outline bookmark a visible border and does not
  rely on blue alone.
- Reduced-motion mode disables panel transitions and toast movement.

## Privacy And Documentation

My Stations is account-associated preference data. On implementation:

- Update the Privacy & Acknowledgements account/saved-data copy to mention saved
  station IDs and deletion on removal/account deletion as applicable.
- Update README implemented features and account API tables.
- Update AGENTS.md and GEMINI.md together with accurate current-reality and
  guardrail language.
- Never describe the watchlist as an official TTC feature or a guaranteed/live
  monitoring service.

## Testing Strategy

### Backend

- Flyway migration validates the composite key, foreign keys, and cascade
  behavior.
- Repository/service tests cover list ordering, idempotent save, idempotent
  delete, duplicate prevention, unknown station, and account isolation.
- Controller tests cover authentication, response codes, and account ownership.
- Service tests prove stale ingestion suppresses dynamic station summary state
  without deleting the saved relationship.

### Frontend

- Adapter tests cover list/save/remove contracts and error normalization.
- Pure list tests cover text search, interchange line filtering, and every sort
  option.
- Source/component tests cover Account/More placement, shared bookmark icon,
  station-detail Save/Saved labels, empty states, and signed-out auth prompting.
- Interaction tests cover optimistic success, rollback on failure, and Undo.
- Search tests verify the sibling bookmark action does not open the station or
  close the search panel.
- Mobile tests verify 44px targets, no long-name overlap, keyboard stability,
  and More-to-Commutes/My-Stations navigation.
- Playwright smoke tests cover saving from global search, state synchronization
  in station detail and My Stations, removal/undo, and persistence after reload.

## Verification

This is a cross-stack account feature. Run and read:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

## Suggested Implementation Order

1. Add the Flyway table, entity/repository/service/controller, and backend tests.
2. Add the typed frontend adapter and shared authenticated saved-station state.
3. Add the My Stations panel, filters, sorting, empty states, and mini picker.
4. Add the desktop Account and mobile More navigation entries, including the
   mobile Saved Commutes shortcut.
5. Add station-detail bookmark behavior.
6. Refactor global station results into primary and sibling bookmark actions.
7. Add interaction/smoke coverage and privacy/documentation updates.
8. Run the cross-stack verification suite.

## Acceptance Criteria

- Signed-in users can save and remove a station from station detail, global
  search, and the My Stations mini picker.
- Saved state stays synchronized across all three surfaces without a page
  reload and persists after reload/sign-in on another device.
- Desktop Account shows My Stations beneath Saved Commutes.
- Mobile More shows Saved Commutes and then My Stations beneath authenticated
  account actions.
- My Stations provides search, line filter, sort, `+ Add Station`, a mini picker,
  compact station health rows, and `No Saved Stations` empty copy.
- Signed-out bookmark activation opens account auth and stores nothing locally.
- Dynamic station state obeys existing ingestion freshness rules.
- The feature sends no push notification and makes no background-monitoring or
  live-data claim.
- Relevant cross-stack verification passes or exact environmental failures are
  reported.
