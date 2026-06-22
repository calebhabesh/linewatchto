# Mobile Push Notification Content Design

Date: 2026-06-22

## Goal

Make LineWatch TO Web Push notifications immediately understandable in the Android notification shade by putting the line, official line name, event type, lifecycle state, location, and relevant event time into a consistent format.

This work improves the notification content and mobile presentation for the push categories that already exist:

- saved-commute current impacts;
- saved-commute planned closures;
- opt-in line-wide current impacts;
- opt-in line-wide planned closures;
- saved-commute and line-wide service-restored updates.

It does not add push notifications for global accessibility outages or surface notices. It also does not make delivery guaranteed or change the requirement for fresh dashboard-visible impacts, an enabled browser subscription, configured VAPID keys, and enabled push delivery.

## Current Problem

The current implementation builds notification strings independently in `SavedCommutePushPlanner` and `LineSubscriptionPushPlanner`. Clearance copy is then reconstructed in `PushNotificationEventEntity` by parsing the previously rendered body.

This produces several problems:

- titles such as `Line alert cleared` do not identify the line or original event;
- line names are omitted;
- title capitalization varies between notification types;
- active notifications and clearances use different sentence structures;
- the alert start or clearance time is not visible in the body;
- clearance generation has no structured location, subject, or source-event timestamp;
- saved-commute and line-wide planners can drift into different formats;
- Android receives a monochrome badge but no full notification icon;
- a stale or already-reconciled event can produce an unnecessary generic fallback notification.

## Approved Notification Contract

### Active notification

```text
⚠️ Line 2 Bloor-Danforth Suspension
Broadview to Victoria Park.
🕗 Jun 21, 7:19 PM
```

### Cleared notification

```text
✅ Line 2 Bloor-Danforth Suspension Cleared
Service between Broadview and Victoria Park has been restored.
🕗 Jun 21, 8:04 PM
```

The title carries the complete event identity. The body must not repeat `Line {N} {Line Name} {Event Type}` because that wastes the limited visible notification area.

The clock line does not include `Started`, `Cleared`, `Updated`, or `Detected`. The title and notification lifecycle already communicate which time is being shown.

## Title Rules

All notifications for supported rapid-transit lines use one of these templates:

```text
⚠️ Line {N} {Line Name} {Event Type}
✅ Line {N} {Line Name} {Event Type} Cleared
```

All words in the controlled title are Title Case. Source-provided titles are never copied into the notification title.

Supported line identities are:

| Line ID | Notification identity |
| --- | --- |
| `line-1` | `Line 1 Yonge-University` |
| `line-2` | `Line 2 Bloor-Danforth` |
| `line-4` | `Line 4 Sheppard` |
| `line-5` | `Line 5 Eglinton` |
| `line-6` | `Line 6 Finch West` |

Supported event labels are:

| Internal event type | Notification label |
| --- | --- |
| `suspension` | `Suspension` |
| `delay` | `Delay` |
| `reduced-speed-zone` | `Reduced Speed Zone` |
| `planned-closure` | `Planned Closure` |
| unknown or legacy value | `Service Alert` |

The generic service-worker fallback, when it is genuinely needed, uses:

```text
⚠️ LineWatch TO Service Alert
Open LineWatch TO to view the latest service update.
```

It has no clock line because no trustworthy event timestamp is available.

## Body Composition

The body is assembled from structured fields in this order:

1. Location summary.
2. Optional operational detail.
3. Optional saved-commute context.
4. Clock line.

Each logical item is separated by `\n`. The formatter removes repeated whitespace, avoids duplicate punctuation, and omits blank items.

### Location

When a location is available, normalize it into a complete sentence:

```text
Broadview to Victoria Park.
```

When no location is available:

```text
Service is affected on this line.
```

For clearance copy:

```text
Service between Broadview and Victoria Park has been restored.
```

When the location cannot be expressed safely with `between`, use:

```text
Service affecting Main Street Station has been restored.
```

The implementation should use `between` only for a location containing a recognizable station range delimiter such as ` to ` or ` between ... and ...`. It must not invent endpoints.

### Operational detail

Only concise, actionable details should be included:

- display direction when present and not already contained in the location;
- `Shuttle buses are running.` when the alert explicitly reports shuttle service;
- planned reminder context:
  - `Starts within 24 hours.` for the 24-hour reminder bucket;
  - `Starts today.` for the morning-of reminder bucket.

Do not copy an entire TTC source description into the push body. Source descriptions can be long, repetitive, or already represented by the event type and location. The notification deep link remains the route to full dashboard detail.

### Saved-commute context

Saved-commute notifications use the same event title as line-wide notifications. Commute context belongs in the body:

```text
Affects Morning Commute (Outbound).
```

For a return leg:

```text
Affects Evening Route (Return).
```

Clearance copy uses:

```text
No longer affects Morning Commute (Outbound).
```

User-authored commute labels retain their original capitalization. Only the controlled words `Affects`, `No longer affects`, `Outbound`, and `Return` are formatted by LineWatch.

## Timestamp Rules

The clock line format is:

```text
🕗 MMM d, h:mm a
```

Example:

```text
🕗 Jun 21, 7:19 PM
```

Formatting requirements:

- timezone: `America/Toronto`;
- locale: English;
- abbreviated month name;
- unpadded day;
- 12-hour clock;
- uppercase `AM` or `PM`;
- no timezone suffix;
- no `Started` or `Cleared` label.

Timestamp selection:

| Notification lifecycle | Timestamp |
| --- | --- |
| current suspension, delay, or Reduced Speed Zone | source `startedAt` |
| planned closure, including reminders | applicable closure start (`eventStartAt`, `nextWindowStart`, or active window start according to the existing planner decision) |
| clearance | the dispatch service clock when LineWatch detects that the active event no longer matches |

If the applicable active-event source timestamp is absent, omit the entire clock line. Do not substitute `updatedAt`, ingestion time, or notification creation time because those would be presented as though they were the alert start.

The existing `PendingPushNotification.timestamp` remains the notification event creation time used by Android for notification ordering and shade age. It is separate from the timestamp rendered inside the body.

## Architecture

### Shared line catalog

Create a small `PushLineCatalog` in the push package. It owns the supported line ID, number, and display name mappings.

Both `PushNotificationPreferenceService` and notification formatting use this catalog. This removes the current duplicated line metadata and ensures notification titles and preference labels cannot disagree.

### Structured notification facts

Expand `PushNotificationCandidate` with structured content facts rather than requiring downstream code to parse rendered strings:

- line number;
- notification subject, such as `Line 2 Bloor-Danforth Suspension`;
- event location;
- optional operational detail;
- optional saved-commute scope label;
- source event timestamp.

The existing account, commute, leg, line, category, event type, reminder bucket, notification key, dedupe key, URL, title, and body fields remain available where they are part of delivery and dedupe behavior.

The two planners populate the facts from their existing DTOs:

- `LineSubscriptionPushPlanner` uses dashboard alert DTO fields;
- `SavedCommutePushPlanner` uses `MatchedImpactResponse` and the saved commute label.

### Central formatter

Create `PushNotificationFormatter` as the only component that produces user-visible push titles and bodies.

It exposes behavior equivalent to:

```java
FormattedPushNotification formatActive(PushNotificationFacts facts)
FormattedPushNotification formatCleared(PushNotificationEventEntity activeEvent, Instant clearedAt)
```

The formatter owns:

- controlled event labels;
- emoji selection;
- title construction;
- Toronto timestamp formatting;
- location punctuation;
- planned reminder wording;
- saved-commute context;
- clearance wording;
- safe unknown-event and missing-location fallbacks.

The formatter does not own dedupe keys, notification tags, preference filtering, delivery, or URL selection.

### Persisted lifecycle context

Add a Flyway migration after `V27` to persist enough structured context for an accurate clearance:

- `notification_subject`;
- `event_location`;
- `scope_label`;
- `source_event_at`.

Change `push_notification_events.body` from `varchar(240)` to `text`. The new format contains multiple lines and must not fail merely because a legitimate commute label or location is longer than the previous limit.

Backfill existing rows conservatively:

- derive a controlled notification subject from `line_id` and `event_type` where possible;
- otherwise use `Service Alert`;
- leave location and scope nullable when they cannot be recovered reliably;
- leave `source_event_at` nullable rather than substituting an inaccurate time.

`PushNotificationEventEntity.create(...)` stores rendered content and structured lifecycle context. `PushNotificationEventEntity.cleared(...)` delegates to `PushNotificationFormatter` and copies the original notification key so the cleared notification replaces the active one.

### Dispatch clock

Clearance time comes from the injected `Clock` already used by `PushNotificationDispatchService`. The formatter receives that `Instant`; it must not call `Instant.now()` internally.

This keeps tests deterministic and makes the exact meaning of the clearance time explicit: it is when LineWatch observed that the previously active dashboard-visible impact was no longer present.

## Service Worker And Android Presentation

Continue using:

- a stable `tag` for active/cleared replacement;
- `silent: true` for clearances;
- `renotify: false`;
- the monochrome notification badge;
- the existing deep-link URL.

Add:

```javascript
icon: "/assets/linewatch/pwa/app-icon-192.png"
```

The full icon improves expanded Android notification identity. The monochrome `notification-badge-96.png` remains the status-bar badge.

Change fallback behavior:

- API/network failure may show the generic LineWatch TO fallback;
- no pending notification must show nothing;
- an active notification whose tag is no longer active after reconciliation must show nothing;
- a stale active notification must never be replaced by a generic fallback notification.

Increase the Web Push wake-message TTL from 300 seconds to 3,600 seconds. Delayed active events remain protected by active-tag reconciliation. Clearances remain valid same-tag replacements. This gives mobile push services more time to deliver during temporary device sleep or connectivity loss without presenting an event that the backend no longer considers active.

The service worker cannot control every manufacturer-specific Android layout. Acceptance is based on the title, body, icon, badge, replacement behavior, and tap target passed to `showNotification`.

## Data Flow

1. A planner receives a fresh dashboard-visible impact.
2. The planner creates structured notification facts and stable lifecycle keys.
3. `PushNotificationFormatter` renders the active title and body.
4. The dispatch service applies account preferences and dedupe checks.
5. `PushNotificationEventEntity` persists the rendered content plus lifecycle context.
6. An empty Web Push request wakes the service worker.
7. The service worker fetches `/api/account/push/latest`, reconciles active tags, and calls `showNotification`.
8. If the impact later disappears, the dispatch service creates a same-key clearance using persisted context and the current injected clock.
9. Android silently replaces the active notification with the precise cleared notification.

## Error Handling

- Unknown line IDs use the available line number without inventing a line name. If neither is available, use the controlled subject `TTC Service Alert`.
- Unknown event types use `Service Alert`.
- Missing active timestamps omit the clock line.
- Missing locations use controlled generic location copy.
- Missing commute labels omit saved-commute context rather than displaying an empty sentence.
- Invalid or excessively long whitespace is normalized before persistence.
- The controlled supported-line titles remain within the existing `varchar(120)` title limit. User-authored commute labels never appear in the title.
- Notification formatting failures must be caught before event persistence; an invalid candidate must not create an undeliverable event row.
- Service-worker reconciliation failure remains best-effort and must not close a valid new notification.

## Testing

### Backend unit tests

Add focused formatter tests for:

- every supported line identity;
- every supported event label;
- active caution and cleared check-mark headers;
- exact Title Case;
- exact `Jun 21, 7:19 PM` formatting;
- Toronto daylight-saving conversion in summer and winter;
- omission of the clock line when active start time is absent;
- clearance using the supplied clearance time;
- range and station-only clearance wording;
- direction and shuttle details;
- planned reminder text;
- saved-commute outbound and return context;
- unknown line and event fallbacks;
- whitespace and punctuation normalization.

Update planner tests to verify that:

- line-wide and saved-commute candidates produce the same canonical event title;
- each candidate carries the correct source event time;
- planned reminders use the closure start;
- user-authored commute-label capitalization is preserved.

Update entity and dispatch tests to verify that:

- lifecycle context is persisted;
- a clearance retains the original notification key;
- the title becomes the canonical checked `... Cleared` title;
- the body uses the fixed dispatch clock;
- clearance delivery remains quiet at the service-worker boundary.

Update service tests to verify that Android ordering still uses event creation time rather than source start time.

### Frontend service-worker tests

Extend `frontend/tests/pwa.test.mjs` to verify:

- `showNotification` receives the exact backend title and multiline body unchanged;
- `icon` and `badge` are both set;
- cleared notifications are silent;
- no pending notification produces no fallback;
- a stale active tag produces no fallback;
- API failure still produces the controlled Title Case fallback;
- notification clicks retain the existing deep link.

### Verification

Run:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

Run the notification-focused smoke/manual path with configured VAPID keys and a fresh synthetic alert scenario. Verify on an Android device or emulator that:

- the expanded notification shows the LineWatch icon;
- active and cleared notifications use the approved titles;
- the body clock line is visible;
- the cleared event replaces the active event;
- tapping opens the matching dashboard panel;
- the data is identified as synthetic scenario data, not live TTC service.

## Documentation

Update `README.md`, `AGENTS.md`, and `GEMINI.md` only where the implemented behavior changes their current notification descriptions.

Document:

- the canonical notification format;
- Toronto timestamp semantics;
- same-tag silent clearance replacement;
- the fact that active timestamps are omitted when TTC does not provide a start time;
- the existing configuration and freshness limitations.

Do not claim Android appearance is identical across devices, that push delivery is guaranteed, or that unsupported dashboard categories send notifications.

## Acceptance Criteria

- Every supported-line active event title starts with `⚠️` and uses `Line {N} {Line Name} {Event Type}`.
- Every supported-line clearance title starts with `✅`, retains the original line and event identity, and ends with `Cleared`.
- Controlled notification titles are Title Case.
- Active bodies end with the Toronto-formatted source start time when it exists.
- Clearance bodies end with the Toronto-formatted LineWatch clearance-detection time.
- Clock lines contain only the clock emoji and formatted date/time.
- Missing active start times do not produce misleading replacement timestamps.
- Saved-commute context appears in the body without replacing event identity in the title.
- Active and cleared notifications use the same stable tag.
- Clearances remain silent.
- Android receives both the LineWatch icon and monochrome badge.
- Stale or empty pending events do not generate generic fallback noise.
- Existing push preference, dedupe, freshness, and deep-link behavior remains intact.
