# Transit domain invariants

Read only the section affected by the task. These are behavior constraints;
feature requirements belong in the task/spec and implementation claims need code
and test evidence. Background inventory: [feature reference](feature-reference.md).

## Sources, freshness, and offline reads

- TTC and regional alert ingestion, arrivals, surface connections, train markers, schedules, and supplemental collections have independent enablement/freshness gates. Fresh alerts do not establish live arrivals or train markers.
- Preserve complete fixture fallback and source labels. Source timing must distinguish Started (`activePeriod.start`) from Updated (TTC `lastUpdated`) where published.
- Failed supplemental regional collections do not fail the entire poll or deactivate last-good rows; stale retained records still cannot drive fresh service claims.
- Offline public TTC and regional snapshots are separate, last-successful, and limited to seven days. Preserve timestamps and saved notices, mark current status unknown, suppress arrivals/markers/current account impact checks, and refresh on reconnect. The service worker never caches account pages or API responses.
- Public source use and website monitoring must meet [source launch gates](source-licensing-launch-gates.md). Station-page detection stages review candidates; it never automatically publishes or deactivates rider notices.

## Alerts, maps, and notices

- Ordinary delays and explicit Reduced Speed Zones are distinct. Schematic Diagram placements use reviewed topology and authored SVG geometry; Geographic map placements project the same logical topology and active impacts onto published GTFS track geometry and station coordinates, not inferred physical tracking. Estimated train markers are conservative schematic placements in Diagram mode and are omitted from Geographic map mode.
- Preserve direction-aware segment matching and single-station rings. Station-only regional impacts must not become corridor-wide overlays.
- TTC nightly closures remain canonical planned events and project current impacts only during effective parent/child windows. Exact parent-period IDs link standalone active children; show one current map impact with access to the related planned closure.
- An explicit TTC `ENDED EARLY` title status completes that closure or its exactly linked occurrence. Omit it from current impacts and planned listings, preserve later occurrences and source history, and retain completion evidence after the child leaves the feed. `ENDING EARLY` and service that "will end early" do not establish completion.
- Accessibility outages, surface notices, and reviewed station-page notices do not drive service status, segment overlays, commute matching, reliability incidents, or push. Station-page notices are station-detail-only. My Stations does not send push.
- TTC GTFS-RT service-alert supplementation is bus/streetcar-only; it does not drive rapid-transit map/status/commute/push paths.
- Explicit GO timetable announcements are corridor-tagged, deduplicated Service Notices. They do not imply a station span or drive current delays, overlays, commute impacts, reliability incidents, or push.
- Regional accessibility records omit restoration notices and unmapped/bus-only facilities; do not infer complete facility coverage, stable asset identity, platform matching, or guaranteed restoration.

## Arrivals and estimated train markers

- TTC live arrivals require the live provider, fresh Subway Trip Updates, and stop mapping through the active static GTFS import. Missing/stale directions or lines fall back to source-labeled schedules; no active schedule means unavailable, not invented service.
- GO/UP live arrivals require enabled regional arrivals, a backend-only key, and fresh mapped provider rows. Static schedules are published timetable times, not guaranteed departures. Distinguish no scheduled service from unavailable data.
- GO coach counts require exact trip-number matches to fresh in-service train records. UP does not invent coach counts.
- TTC surface connections join through published static-GTFS `parent_station`, never proximity. Regional surface connections expose GO Bus only. Surface reads do not add routes, vehicles, or overlays to maps; bay/platform appears only if published.
- Estimated train markers are conservative schematic placements on reviewed adjacent links. TTC markers are suppressed during closed subway hours despite fresh Trip Updates. Regional markers require their own enabled/fresh keyed provider; UP also requires a matching direction-consistent TripUpdates trip. Omit ambiguous/contradictory records.

## Regional trip changes

- Operational GO exceptions/TripUpdates become public trip changes only with exactly one matching active static-GTFS trip and mapped stops. Unmatched operational rows remain internal.
- Fresh structured rider-alert cancellations may be shown unmatched with source labels; they must not invent times or coverage. Merge duplicate rider/exception/TripUpdates signals.
- Only schedule-backed supported changes annotate arrivals; only exact schedule-backed cancellations can match My Commutes. Do not imply equivalent UP trip-change coverage or reproduction of website notice prose.
- Cancellations stay outside status, overlays, delay counts, reliability incidents/duration, and commute travel-time estimates. Separate coverage-labeled cancellation analytics and filtered cancellation pushes are allowed. Expiry never means service restoration.

## My Commutes and push

- Preserve account ownership, full-path and direction-aware matching, independent outbound/return legs, and Toronto-time days/windows. Route edits preserve notification rules while recalculating paths/impacts.
- TTC timing uses active schedule median segment weights, then seeded travel times, then constant topology weights. Regional timing remains low-confidence topology planning. No cross-network routing, walking-transfer timing, accessibility-personalized matching, alternate-route recommendation, email delivery, or movement-based prediction is implied.
- Delay/RSZ extra-time ranges are bounded heuristics; suspensions/closures are unreliable, not fake detour durations. Cancellations do not alter travel-time estimates.
- Device push enablement differs from account preferences. Delivery requires permission, VAPID configuration, enabled push, relevant fresh network data, and matching stream/event/route rules.
- Commute cancellation pushes additionally require exact schedule matching, at least two ordered path stops in matching direction, the scheduled trip inside the selected leg schedule, and current time inside its notification window.
- Enabling/editing route rules silently baselines active impacts. Impacts beginning outside a window may notify once when the natural window opens. Planned/restored commute pushes respect the selected leg's open window; restored also requires its toggle and a prior active commute delivery.
- Preserve distinct update re-notification, unchanged-snapshot deduplication, separate active/restored lifecycle entries, high transport urgency, and non-silent persistent display requests. Browser policy can still remove notifications.
- Planned-closure follow-up policy is shared by commute and line streams (Smart, Within 24 Hours, Day Of, Announcements Only), emitting one applicable timing candidate per evaluation.

## Reliability and public claims

- Count service-impact intervals only where verified polling, GTFS-derived daily service spans, and applicable closure windows overlap. Distinguish unique impact time from additive incident-hours and polling coverage from schedule-date coverage; confidence uses the weaker coverage.
- Do not claim active analytics/telemetry without configured credentials and observed data, or implemented geometry/caching/capabilities without code and passing verification. Update README claims when behavior changes.
