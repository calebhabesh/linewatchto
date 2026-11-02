# H — Notification delivery and diagnostics

Owner request, 2026-10-31: Android (Pixel 6a, installed from Chrome) misses
most notifications that the iPhone (installed from Safari) shows; the
Notification Diagnostics panel did not explain why. Scan delivery and
diagnostics, then plan how to make delivery as reliable as the platforms
allow and make diagnostics answer the owner's question directly.

Read first: the My Commutes and push section of
[domain invariants](../domain-invariants.md), and the push paragraphs of the
[feature reference](../feature-reference.md).

## Findings (production, 2026-10-31)

Read-only queries against the production database, owner account only. Times
are Toronto local unless marked UTC.

**Android loses its subscription; it is rarely Doze.** From 2026-10-20 13:30,
when the current iPhone endpoint was registered, the server sent 493
notifications to the iPhone (414 with a display report). The same events
reached Android as follows:

| Android outcome for the same event | Events | Share |
| --- | ---: | ---: |
| Not attempted: no enabled Android endpoint existed | 372 | 75% |
| Not attempted: endpoint enabled after the event became eligible | 10 | 2% |
| Sent to an endpoint Google had already dropped (410) | 12 | 2% |
| Accepted by Google, no display report | 20 | 4% |
| Displayed (service worker reported) | 79 | 16% |

While an endpoint was alive, 79 of 99 accepted pushes were reported displayed.
In about half of the remaining 20, the accepted push was the last one before a
410. The phone had probably already replaced its subscription, so those were
lost to rotation too, not to power management.

**Endpoints die within hours.** The account has had 220 Chrome (FCM) endpoints
since June: 42 under installation `ce9b4149` (Sep 23 to Oct 27) and 4 under
`64b30e46` (Oct 27 to 31). Each ended with `push-service-410`, usually within
hours and never later than about a day. Chrome replaces the subscription on
the device. The server learns the new endpoint only when the app is next
opened (`usePushNotificationSettings` refresh, reason `app-refresh`). Until
then every alert is either "not attempted" or sent to the dead endpoint. One
gap ran from Oct 29 06:05 to Oct 31 18:49 with no working Android endpoint.

Evidence for bd587945a7e4 (Oct 31):

- **18:49** registered.
- **20:45** refreshed on app open; same endpoint, so the browser still held it.
- **21:18** push accepted by Google; no display or client event.
- **21:21** next push: 410, endpoint disabled.
- **21:26** next app open: Chrome returned a different endpoint, with no
  `refresh-rejected` for the old one.

**Not inherent to Chrome on Android.** Another account's Android Chrome
endpoint (Chrome 153, registered Aug 26) has received 101 pushes, 0 × 410 and
73 displays, and still works with no app open since Sep 28.

**Cause not yet proven.** Ruled out:

- Production code unsubscribing: only `dev-reset.html` and the dev-mode branch
  of `PwaServiceWorkerRegistration` / `app-update.html` unregister.
- Deploy timing: the replacement windows checked against the five deploys of
  Oct 28 to 30 do not line up.
- The "Unrestricted" battery setting: it was set on Chrome throughout.

Leads:

- **Chrome channel.** The owner's endpoints report Chrome 154, 155 and 156
  within October. Three major versions in one month fits a Beta/Dev/Canary
  channel, not Stable. Unconfirmed.
- **App opens.** Several replacements happened within minutes of an app open
  (`ec121d995e80`: open 21:58 UTC, push displayed 21:57, next push 22:02
  dead). Others survived many opens (`efc5b722094e`: 14 refreshes).

**The recovery hook never ran.** `pushsubscriptionchange` in `sw.js` would
record `subscription-change`. Production has no such lifecycle record, ever.
Either Chrome never fires the event or the handler fails: its `catch {}`
swallows every error and records nothing.

**Two phones on one LineWatchTO account is not a problem.** Subscriptions
belong to a browser installation; the account allows 5 enabled devices and
fans each event out to all of them.

**Diagnostics.** `PushDeliveryDiagnosticsPanel.tsx` (455 lines) plus
`push-diagnostics-state.ts` and `PushDeliveryDiagnosticsService.java` show
endpoints, endpoint hashes, archived endpoints, VAPID key, per-event recipient
rows and client-event stages. They do not show the two facts that explain the
owner's losses: when each device was unreachable, and what share of alerts
each device missed. The panel shows rotation churn as many "Android Chrome"
endpoint chips, prints the "Device was enabled after…" reason twice per
recipient, and reports an alert lost to rotation as "Accepted by push service;
browser report unavailable".

## Goal

- **Done means:** an alert sent while a device is reachable is shown, and a
  device that silently lost its subscription comes back without waiting for
  the rider to open the app, wherever the browser allows it. Diagnostics tell
  the owner, per device, whether it is reachable now, what share of recent
  alerts it showed, and why any were missed, in plain words.
- **Platform limits stay honest.** Recovery uses only what browsers offer.
  Periodic Background Sync is Chromium-only, needs an installed app, and its
  timing is set by Chrome's site-engagement score, so it shortens a gap rather
  than closing it. User-facing copy must not promise more.

## Phases

### 1. Find the cause (owner check, then instrumentation)

- Owner: on the Pixel, open `chrome://version` in the browser that installed
  the app, and check Settings › Apps › LineWatchTO. If it is a Beta/Dev/Canary
  channel, reinstall the app from Chrome Stable. Then watch the endpoint
  lifetime for 48 hours in the new device view (or by query) before building
  more.
- Record device-side replacement directly. Keep the last saved endpoint hash
  in IndexedDB, which the service worker can read. When `getSubscription()`
  returns a different endpoint on app open, on service-worker wake or in
  `pushsubscriptionchange`, save it with reason `endpoint-replaced` and the
  old hash. This times each replacement instead of inferring it from the next
  410.
- Give each outcome of the app-open refresh (`createOrRefreshDeviceSubscription`)
  its own registration reason: today a re-save, a subscription the browser
  dropped (auto-restore subscribes anew) and a different endpoint from the
  browser are all saved as `app-refresh`. Use, for example, `refreshed`,
  `restored-missing` and `endpoint-replaced`. This refresh was added to repair
  stale registrations. The data shows it repairs losses, not causes them (only
  5 unsubscribe-and-replace runs against roughly 220 dead endpoints), so keep
  it; phase 2 adds checks that don't wait for an app open.
- Record the browser major version and display mode (standalone or tab) with
  each registration.
- Make `pushsubscriptionchange` observable: report each stage (fired, saved,
  failed with status) instead of `catch {}`.

### 2. Recover without an app open

- **Periodic Background Sync.** After device push is enabled in an installed
  app, register a `linewatch-subscription-check` tag (requested interval 12
  hours). The handler is the same check as phase 1: get or create the
  subscription with the current VAPID key, and save it if it changed. Feature-
  detect it; Safari has no such API and needs none.
- **Check on every push the worker receives.** If the subscription now differs
  from the saved one, save it then. This catches replacements on devices that
  still receive some pushes.
- **Catch up on reconnect.** When an installation registers a replacement
  endpoint after its previous one died (`push-service-410` or
  `endpoint-replaced`, not `user-enabled`), judge eligibility by when the
  installation was enabled, not the new endpoint. Then send the alerts that
  are still active and that the dead endpoint missed, under the same dedupe
  keys. This clears the "enabled after this notification became eligible"
  bucket. **Owner decision:** whether a catch-up push is wanted when the rider
  is in the app at that moment, or only a tray refresh.
- **Optional, owner decision:** when an installation goes unreachable (410
  with no replacement within N hours), notify the account's other reachable
  devices once: "Your Android device stopped receiving alerts. Open LineWatchTO
  on it to reconnect."

### 3. Diagnostics around devices, not endpoints

Replace the panel with an installation-centred view built on the existing
tables (`installation_id` has been recorded since July; older endpoints become
"Earlier devices").

- **Per device:** name (browser and platform), status (Reachable / Unreachable
  since X / Off), shown rate over 7 days (shown / sent while reachable / missed
  while unreachable), last shown alert, and replacements in 7 days.
- **Per alert:** one line per device, chosen from Shown at T / Sent, not
  confirmed / Missed, device unreachable / Not sent: reason. Drop endpoint
  hashes, the VAPID line, the archived toggle and endpoint chips from the main
  view, and keep them behind a "Technical details" disclosure.
- **Help card:** keep the Android battery steps as one line. The data shows
  subscription loss, not battery restriction, as the main cause.
- **Backend:** one diagnostics response shaped by installation, replacing the
  endpoint-and-recipient joins in `PushDeliveryDiagnosticsService`. Account
  ownership checks and hash-only identifiers stay.

### 4. Remove what the new model replaces

Retire the endpoint filter state in `push-diagnostics-state.ts`, duplicated
reason strings and diagnostics fields nothing reads. Update the feature
reference's push paragraph and README claims to match the delivered
behaviour.

## Constraints

- Root invariants: diagnostics are account-owned, show hash prefixes only, and
  never expose endpoints, keys or raw provider payloads. The service worker
  never caches account or API responses.
- Keep high urgency, TTL, topics, and the active/cleared lifecycle unchanged.
  Unchanged polling snapshots stay deduplicated, and catch-up must not
  re-notify an alert the device already showed.
- Route-rule baselining (domain invariants) is separate from device
  reconnection; catch-up applies only to the same installation's replacement
  endpoint.
- Flyway migrations for any schema change; no raw endpoint in new columns.

## Checks per phase

- **1–2:** backend unit and integration tests for replacement-endpoint
  eligibility and catch-up dedupe; frontend `test:fast` for the
  subscription-check logic (pure function shared by page and worker where
  practical). A production check: Android endpoint lifetime and the share of
  iPhone events also attempted on Android, re-run with the queries in
  Findings.
- **3:** component tests for the device and outcome model; a focused browser
  check of the panel at 360px and 1440px.
- **Each phase:** affected layer's final checks once (`mvn -f backend/pom.xml
  test`; `npm --prefix frontend run test:fast`, `typecheck`, `lint`).

## Progress

- 2026-10-31: audit and production findings above. Nothing implemented.
- 2026-10-31, owner answers: the Pixel runs Chrome Stable (`chrome://version`:
  156.0.8078.75, Official Build, standard Chrome app, Android 17), so the
  channel lead is ruled out; the three majors in October remain unexplained
  (watch `browser_major_version` per registration). Catch-up always pushes,
  including while the rider is in the app. No warning to other devices when one
  goes unreachable; diagnostics show it instead.
- 2026-10-31, phase 1 (instrumentation). V89 adds
  `push_subscriptions.browser_major_version`, `display_mode`,
  `installation_enabled_at`; lifecycle events gain `previous_endpoint_hash`,
  `browser_major_version`, `display_mode`, `detail` (endpoint hash now
  nullable for stage reports); deliveries gain `catch_up`. The device keeps the
  hash of the endpoint it last saved in IndexedDB (`linewatch-push` / `state` /
  `subscription`), shared by `public/push-subscription-check.js` (worker,
  `importScripts`) and its page twin `src/app/push-subscription-check.ts`
  (parity test `push-subscription-check.test.mjs`). App-open saves are
  `refreshed`, `restored-missing` or `endpoint-replaced` (with
  `previousEndpointHash`); `app-refresh` is gone. The server disables the
  previous endpoint as `endpoint-replaced`. `pushsubscriptionchange` reports
  `subscription-change-fired` / `-saved` / `-failed` (with status) to
  `POST /api/account/push/subscription/worker-stage` (allow-listed stages,
  60 per account-hour) instead of `catch {}`; the worker restores a dropped
  subscription only if this device had saved one (a rider's disable clears the
  stored hash). Page disables now say `user-disabled` or `vapid-key-changed`.
- 2026-10-31, phase 2 (recovery). The worker runs the same check on
  activation, after every push, and on Periodic Background Sync tag
  `linewatch-subscription-check` (registered at 12 h after a save, installed
  app with permission only; feature-detected), reporting `check-replaced`,
  `check-restored`, `check-failed`, `periodic-sync-fired`. Catch-up:
  a new endpoint continues its installation's enablement
  (`installation_enabled_at`) unless the rider enabled it or the previous
  endpoint was turned off by the rider; each evaluation sends a replacement
  registered in the last 24 h the latest still-active, uncleared event for each
  current allowed candidate that became eligible between the installation's
  enablement and the endpoint's, once per (event, endpoint), never when any
  endpoint of the installation already displayed it. Catch-up payloads carry
  `catchUp: true`; the worker replaces a tray entry with the same tag with
  `renotify: false` (still not silent). Replacements no longer count against
  the 5-device limit. Urgency, TTL, Topic and the active/cleared lifecycle
  are unchanged; cleared events are not caught up.
- 2026-10-31, phase 3 (diagnostics). `GET /api/account/push/diagnostics` now
  returns one installation-centred response (`PushDeliveryDiagnosticsService`):
  devices keyed by installation prefix (endpoints without one grouped as
  "Earlier Devices"), each reachable / unreachable since / off (from the latest
  endpoint's disable reason), 7-day shown / sent while reachable / missed while
  unreachable, last shown alert, replacements, browser major and display mode;
  per alert (40 most recent in 7 days) one outcome per device (shown, sent,
  missed, not sent with a reason, catch-up flag); technical details (VAPID
  fingerprint, hash prefixes, delivery status lines, the 7-day subscription
  history including worker stages). `GET /devices` and the endpoint/recipient
  diagnostic records are removed; the device test returns status only.
  `PushDeliveryDiagnosticsPanel` is rewritten on `push-diagnostics-state.ts`
  (plain wording only; marks This Device by endpoint hash prefix); the Android
  help card keeps its battery steps as one line. Browser check: the panel only
  renders in the mobile More sheet (below 768 px; the desktop More panel never
  carried it), so it was checked at 360 px and 767 px with a fixture
  response: no page overflow, no clipped elements, buttons wrap under the
  details on a phone.
- 2026-10-31, phase 4 (removals). Retired the endpoint filter / archived
  toggle state in `push-diagnostics-state.ts`, the duplicated recipient reason
  strings, `getPushDevices`, the device-health fields, the repository queries
  only they used, and their styles. Feature reference and the push invariants
  describe reconnection, catch-up and the device view; README makes no claim
  that changed.
- 2026-11-02, post-deploy check (V89 live 2026-11-01 05:27 UTC, about 19 h of
  data). Android: since 08:09 every alert sent to the iPhone was also sent to the
  Pixel, and the 7 sent since 13:36 UTC were all shown; one worker recovery
  (`check-restored`, `worker-wake: restored-missing`, 13:09 UTC) re-subscribed
  after Chrome dropped the subscription and caught up the one missed alert; the
  current endpoint has lived about 11.5 h with no 410. No
  `subscription-change-*` or `periodic-sync-fired` records yet. iPhone: after
  05:28 UTC 17 pushes were accepted by Apple with no display report until the
  app was opened at 00:39 UTC, when Safari handed back a new endpoint; a device
  that has not opened the app since the deploy has no stored hash, so its
  worker cannot notice this. On that open the old cached bundle saved the new
  endpoint (`app-refresh`, installation `c983a47a`, continuing the Oct 20
  enablement) and the new bundle re-saved it 5 s later under installation
  `be3cd6b5` (cause unknown; the installation id handling is unchanged since
  July). Catch-up then checked "already displayed" under `be3cd6b5` only and
  pushed 12 alerts back to Oct 22, 8 of which the old endpoint had shown; the
  owner saw them all at once. Fix: V90
  `push_subscriptions.continued_from_subscription_id`, set when a registration
  continues an enablement; catch-up also skips alerts shown on that chain of
  endpoints (`existsDisplayedForSubscriptions`). Regression tests in
  `PushNotificationDispatchServiceTest` and `PushNotificationServiceTest`.
- Open after deploy: re-run the Findings queries (Android endpoint lifetime,
  share of iPhone events also attempted on Android), and read the new
  `worker-stage` records to see whether Chrome fires `pushsubscriptionchange`
  and whether periodic sync runs on the Pixel.

