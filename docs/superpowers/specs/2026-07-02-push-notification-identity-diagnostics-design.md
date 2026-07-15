# Push Notification Identity and Diagnostics Design

## Goal

Simplify LineWatchTO push notification identity so the backend can reason about a real TTC/source incident separately from the OS notification variant displayed to a device, and make diagnostics easier to use when one notification fan-outs to multiple Android/iOS subscriptions.

## Current Problem

The current backend is appropriately layered for account-level Web Push, per-device subscriptions, retries, service-worker acknowledgements, saved-commute notifications, line-wide subscriptions, and cleared lifecycle entries. The part that has become convoluted is identity.

`notificationKey` currently carries several meanings at once:

- the rendered browser display lifecycle key;
- the category and event type of the notification;
- the source alert identity when the source id is present;
- the correlation key for line stream observations and clearance decisions.

That coupling made a real incident changing type, such as a Line 5 TTC alert moving from suspension to delay while retaining the same source id, look like the old alert cleared and a new alert appeared. The recent fix added equivalence checks around this, but those checks parse and compare the display key instead of using a first-class incident identity.

Diagnostics are also accurate but hard to interpret. The existing endpoint returns recent delivery attempts as a flat list. One logical notification can appear many times because the same account can have Android Chrome, iOS Safari, old iOS PWA subscriptions, browser-restored subscriptions, and retry attempts. A flat list makes it too easy to miss whether Android Chrome was accepted, whether the service worker received the push, and whether display acknowledgement arrived.

## Non-Goals

- Do not redesign Web Push delivery as guaranteed delivery. Apple, FCM, browser, and OS policy remain best-effort surfaces.
- Do not add push notifications for global accessibility outages or surface notices.
- Do not change the requirement that push delivery depends on fresh dashboard-visible impacts.
- Do not remove active/cleared display tags or the current service-worker cleanup contract.
- Do not introduce a full lifecycle state machine in this slice. The identity refactor should make a later state-machine cleanup easier, but it is not required here.
- Do not auto-disable accepted-but-unacknowledged subscriptions. Accepted with no client acknowledgement is diagnostic evidence, not proof that a subscription is invalid.

## Recommended Approach

Use a balanced slice:

1. Add `sourceIncidentKey` as a first-class backend identity.
2. Keep `notificationKey` as the display/lifecycle variant key.
3. Group diagnostics by logical notification, with nested per-device delivery attempts.
4. Keep stale subscription cleanup conservative: disable on hard invalid push responses only, and expose no-ack devices in diagnostics.

This improves the model without breaking service-worker tags, Web Push topics, retained cleared notifications, or existing account preference semantics.

## Identity Model

### `sourceIncidentKey`

`sourceIncidentKey` identifies the underlying incident LineWatch believes it is tracking.

Examples:

```text
line-current|line-5|ttc-route-71001
line-planned|line-1|closure-2026-07-10-weekend
saved-commute-current|commute_1|outbound|ttc-route-71001
saved-commute-current|commute_1|outbound|segments:line-1-eglinton-davisville
```

For line-wide current alerts, it should normally be:

```text
line-current|{lineId}|{sourceId}
```

For saved-commute current impacts, it should preserve the commute and leg scope while using the source alert id when available. If no source id exists, it should fall back to the same stable impact component already used by `SavedCommutePushPlanner`, such as matched segments or stations.

`sourceIncidentKey` must not include event type. A source alert changing from suspension to delay remains the same source incident.

### `notificationKey`

`notificationKey` remains the display/lifecycle key used by:

- active and cleared service-worker tags;
- Web Push topics;
- `/api/account/push/latest`;
- `/api/account/push/active`;
- displayed acknowledgement lookup;
- retained cleared notification cleanup.

It can continue to include event type:

```text
line-current|line-5|delay|ttc-route-71001
saved-commute-current|commute_1|outbound|delay|ttc-route-71001
```

This preserves current OS notification behavior. If the event type changes, the display variant may change, but the backend can recognize that it is still the same source incident.

### `dedupeKey`

`dedupeKey` remains account and reminder scoped. It continues to prevent routine duplicate active sends for the same planned reminder or current alert variant.

## Backend Changes

### Candidate Shape

Add `sourceIncidentKey` to `PushNotificationCandidate`.

`LineSubscriptionPushPlanner` should produce:

```text
sourceIncidentKey = "{category}|{lineId}|{sourceId}"
notificationKey = "{category}|{lineId}|{eventType}|{sourceId}"
dedupeKey = "{accountId}|line|{lineId}|{eventType}|{reminderBucket}|{sourceId}"
```

`SavedCommutePushPlanner` should produce:

```text
sourceIncidentKey = "{category}|{commuteId}|{legId}|{stableImpactPart}"
notificationKey = "{category}|{commuteId}|{legId}|{eventType}|{stableImpactPart}"
dedupeKey = current existing value
```

The planner tests should assert both keys so the distinction is documented in executable form.

### Persistence

Add nullable-then-populated `source_incident_key` columns to:

- `push_notification_events`;
- `push_line_event_observations`;

Do not add `source_incident_key` to `push_notification_client_events` in this slice. Client events already attach to deliveries, and deliveries attach to notification events.

Backfill rules:

- For `push_notification_events`, derive `source_incident_key` from known columns where possible.
- Existing line-current events can parse the current `notification_key` format and drop the event-type segment.
- Existing saved-commute keys can parse the current `notification_key` and drop the event-type segment.
- For rows that do not match a known shape, fall back to the existing `notification_key` so data stays usable.
- For `push_line_event_observations`, use the same parsing rule and fall back to `notification_key`.

After backfill, both new columns should be not null for new rows.

### Entity Factories

`PushNotificationEventEntity.create(...)` stores `candidate.sourceIncidentKey()`.

`PushNotificationEventEntity.cleared(...)` copies `sourceIncidentKey` from the active event.

`PushNotificationEventEntity.clearedFromObservation(...)` copies `sourceIncidentKey` from the observation.

`PushLineEventObservationEntity.create(...)` and `refresh(...)` store the latest candidate display context while preserving the same source incident identity for matching.

### Line Observation Matching

`PushLineEventObservationService.observe(...)` should find active observations by account and `sourceIncidentKey`, not by `notificationKey`.

If a line-current event changes from suspension to delay but keeps the same source id:

- the existing observation is refreshed;
- no new observation is created;
- no false cleared notification is sent;
- the latest display context on the observation updates to the current variant.

The observation id should be based on `accountId + "|" + sourceIncidentKey`, not `notificationKey`.

### Clearance Logic

`PushNotificationDispatchService` should use explicit incident identity instead of parsing `notificationKey`.

For saved-commute current notifications:

- collect current `sourceIncidentKey` values for current saved-commute candidates;
- do not clear an active event when the same `sourceIncidentKey` is still present;
- preserve the existing category-family, scope, location, and source-time compatibility checks only as fallback for older rows without reliable source keys.

For line-current observations:

- collect current line `sourceIncidentKey` values;
- do not clear an active observation when the same `sourceIncidentKey` is still present;
- remove `sameLineCurrentSource(...)` parsing logic after tests prove `sourceIncidentKey` covers that case.

### Delivery and Retry

Do not change the retry policy in this slice:

- failed delivery retries after the existing delay;
- accepted-but-undisplayed active deliveries retry during the existing short retry window;
- displayed deliveries do not retry;
- hard invalid results disable the subscription.

This refactor should not increase notification volume.

### Subscription Cleanup

Keep cleanup conservative:

- hard invalid push responses continue to disable the subscription immediately;
- accepted deliveries with no `push_received` or display ack remain enabled;
- diagnostics should make those subscriptions easy to identify.

No stale-device scheduler is required in this slice. The only automatic cleanup behavior remains the existing hard-invalid push response path.

Post-implementation follow-up (2026-07-13): browser endpoint rotation now carries a random installation identifier shared by the page and service worker. Registering a different endpoint for the same account installation archives the prior endpoint while retaining its delivery history. Hard-invalid 404/410 results are explicitly saved from scheduled dispatch, and the migration archives enabled legacy subscriptions that already have a persisted `gone` delivery. Accepted-but-unacknowledged endpoints remain enabled.

Android hardening follow-up (2026-07-15): accepted active deliveries without current-attempt browser evidence now receive no more than two sparse retries, after 5 and 15 minutes, within the original 30-minute window. A current-attempt `push_received` event now means `showNotification()` resolved and stops retrying; `show_failed` remains retryable. The service worker performs the display call before network telemetry and then records receipt/display evidence concurrently. Diagnostics distinguish rotating endpoint hashes from browser installation prefixes and expose a VAPID public-key fingerprint so subscription churn can be separated from deployment key rotation.

## Diagnostics API

Change `/api/account/push/diagnostics` from a flat delivery list to grouped logical notifications.

Response shape:

```json
{
  "notifications": [
    {
      "id": "push_event_1",
      "title": "Line 5 Eglinton Delay",
      "tag": "line-current|line-5|delay|ttc-route-71001|active",
      "notificationKey": "line-current|line-5|delay|ttc-route-71001",
      "sourceIncidentKey": "line-current|line-5|ttc-route-71001",
      "notificationState": "ACTIVE",
      "category": "line-current",
      "eventType": "delay",
      "lineId": "line-5",
      "lineNumber": "5",
      "eventCreatedAt": "2026-07-02T03:17:00Z",
      "attempts": [
        {
          "id": "push_delivery_android",
          "deviceLabel": "Android Chrome",
          "userAgent": "Mozilla/5.0 Android Chrome",
          "endpointHashPrefix": "8f41c2a9d113",
          "subscriptionEnabled": true,
          "deliveryStatus": "accepted",
          "httpStatus": 202,
          "deliveryMessage": null,
          "lastAttemptAt": "2026-07-02T03:17:04Z",
          "displayedAt": null,
          "attemptCount": 1,
          "clientEvents": [
            {
              "stage": "push_received",
              "message": null,
              "occurredAt": "2026-07-02T03:17:07Z"
            }
          ]
        }
      ]
    }
  ],
  "deliveries": []
}
```

Keep the legacy `deliveries` array for one compatibility release. It should contain the same flat delivery rows as today, derived from the same attempt records used for `notifications`. The updated frontend should read `notifications`.

Backend grouping should:

- fetch the most recent 50 delivery attempts for the account;
- group them by event id first;
- include `notificationKey` and `sourceIncidentKey` in the group;
- sort groups by newest attempt time descending;
- sort attempts inside a group by newest attempt time descending;
- attach client events to each delivery attempt.

## Diagnostics Frontend

The diagnostics panel in More should become notification-first.

Top-level controls:

- device filter: `All devices`, then distinct device choices;
- refresh button;
- compact status count.

Device choices should include both label and endpoint hash prefix when duplicates exist:

```text
All devices
Android Chrome
iOS Safari - a21b77d0ee40
iOS Safari - c8830a6b19bb
```

If there is only one device with a label, the display can be just `Android Chrome` or `iOS Safari`. If multiple attempts share the same label, append `endpointHashPrefix` for each duplicate.

Each notification group should show:

- title and line badge;
- event type and state;
- created time;
- source incident key in compact diagnostic text;
- nested attempts matching the selected device filter.

Each attempt should show:

- device label and endpoint hash prefix;
- delivery status and HTTP status;
- attempt count and last attempt time;
- display acknowledgement state;
- last few client events.

Useful outcome labels:

- `Display reported`: `displayedAt` exists or a display acknowledgement client event exists.
- `Service worker reported display`: `showNotification()` resolved and `push_received` exists, but the signed display acknowledgement is incomplete.
- `Push service accepted; no browser report`: delivery status is accepted but no current-attempt client evidence exists.
- `Failed`: delivery status is failed.
- `Invalid subscription`: delivery status indicates an invalid endpoint or the subscription is disabled after a hard invalid response.

This lets a user answer:

- Did Android Chrome get an accepted delivery?
- Did Android Chrome's service worker report `push_received`?
- Did Android Chrome report display acknowledgement?
- Are there multiple old iOS Safari endpoints?

## Error Handling

- If diagnostics are unavailable, keep the current unavailable panel state.
- If a legacy backend returns only `deliveries`, the frontend may adapt them into one-attempt groups using the delivery id as the group id.
- Missing `sourceIncidentKey` should render as `Not recorded` rather than breaking the panel.
- Unknown device labels should fall back to `Unknown device` plus endpoint hash prefix.

## Testing Plan

Backend unit and repository tests:

- `LineSubscriptionPushPlannerTest` asserts `sourceIncidentKey` excludes event type while `notificationKey` includes event type.
- `SavedCommutePushPlannerTest` asserts saved-commute current keys preserve commute and leg scope.
- `PushNotificationEventEntity` behavior is covered through dispatch/service tests asserting persisted source incident keys.
- `PushLineEventObservationServiceTest` proves existing observations refresh by `sourceIncidentKey`.
- `PushNotificationDispatchServiceTest` proves a same-source Line 5 alert changing from suspension to delay does not send a false clearance.
- `PushNotificationDispatchServiceTest` proves accepted-but-no-ack subscriptions remain enabled.
- `PushNotificationServiceTest` proves diagnostics group Android and iOS delivery attempts under one logical notification and preserve endpoint hash prefixes.
- Migration string or schema tests cover `source_incident_key` columns, backfill, and indexes.

Frontend fixture tests:

- `account-data.test.mjs` covers grouped diagnostics parsing.
- `notification-settings-navigation.test.mjs` or a focused diagnostics test covers the device filter and grouped rendering source.
- Existing service-worker tests should not need behavioral changes unless the diagnostics types share code with pending notification tags.

Verification commands:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

If frontend diagnostics UI changes are substantial, also run:

```bash
npm --prefix frontend run build
```

## Documentation Updates

Update `README.md` to state:

- one logical notification can produce multiple per-device delivery attempts;
- accepted from Apple/FCM does not guarantee OS display;
- diagnostics group attempts by logical notification and allow Android/iOS endpoint filtering;
- `sourceIncidentKey` is an internal backend correlation key and does not change the unofficial/best-effort nature of notifications.

No claims should be made that push delivery is guaranteed or that stale subscriptions are automatically cleaned unless such behavior is implemented and verified.

## Rollout Notes

This can be deployed as a normal backend/frontend migration:

1. Add nullable columns and backfill in Flyway.
2. Write new rows with `sourceIncidentKey`.
3. Read diagnostics using the new grouped response.
4. Keep display tags and pending push behavior compatible.

Existing delivered notifications continue to use their original display tags. Existing rows without parseable source identity fall back to their `notificationKey`, which preserves current behavior rather than inventing a source incident.
