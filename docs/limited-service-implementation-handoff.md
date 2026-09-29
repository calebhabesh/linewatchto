# Alert categories and limited service — Sol High implementation handoff

Status: implementation complete; validation and compatibility evidence is recorded in [the implementation evidence](limited-service-implementation-evidence.md). This replaces the earlier instruction to retain all category names. Implement the classification correction and application-wide naming refactor together. No application code was changed while preparing this plan.

## 1. Product contract

Reuse the current navigation structure with these names everywhere categories are presented:

| Existing category | New category | Meaning |
| --- | --- | --- |
| Active Alerts | **Suspensions** | No service on the affected segment, station, or direction |
| Delays | **Delays** | Service operates with delays or restrictions, including limited service |
| Planned Closures | **Planned Advisories** | Supported scheduled service restrictions, including suspensions and limited service |
| Reduced Speed Zones | **Reduced Speed Zones** | Explicit RSZ notices; unchanged |

These are broad display buckets, not a one-to-one copy of provider alert types. Preserve a specific service effect within each bucket: a limited-service card says **Limited service**, not just Delay. Its planned card says **Planned limited service**; its related action says **View planned advisory**. A genuine closure can still say **Planned closure** as an individual event description. Category headings, counts, filters, and generic actions use the broader names.

Use singular **Suspension** / **Planned Advisory** for counts where appropriate, with ordinary sentence casing in prose. Generic reminder/follow-up headings become **Planned Advisory Reminders** / **Planned Advisory Follow-ups**. Generic timing fields use **Advisory dates**, **Advisory hours**, and **Current window**; event-specific closure details may retain accurate closure wording. Keep headers compact without shrinking text or introducing cryptic abbreviations.

During its effective window, limited service belongs in Delays and uses orange delay styling on both maps. Planned previews retain blue styling. Suspensions retain red styling. Keep the planned advisory accessible while active, but show one current impact per occurrence. Outside an effective window, show the planned advisory without a current delay/suspension impact.

Limited service alone does not establish delay minutes, reduced frequency, single tracking, shuttle service, or complete shutdown. Preserve provider cause as clearly labelled source detail without treating a generic closure cause as proof of suspension.

## 2. Model boundaries and extensibility

Separate three concepts in classification and presentation:

- **Service effect:** what is happening to riders, such as suspension, delay, limited service, or explicit RSZ.
- **Timing:** scheduled, currently effective, ended, and recurring occurrence windows.
- **Display bucket:** the existing navigation group to which the event belongs.

Choose the smallest durable representation that carries these distinctions from normalization through persistence/API projection to all consumers. A subtype or effect field is acceptable; a new submenu is not required. Do not infer effect later by re-parsing rendered labels. Centralize category labels and effect-to-bucket mapping at the relevant backend/frontend boundaries, following existing patterns rather than creating a generic rules engine.

New provider codes should map into supported semantic effects and existing buckets when evidence permits. Unknown or contradictory effects must preserve source wording and use the existing safe unclassified/non-impact handling; they must not default to suspension or automatically create a bucket. Inspect that fallback and document any gap. This task adds limited-service support, not speculative support for every possible provider event.

The broader Planned Advisories name does not authorize routing all notices into service-impact pipelines. Preserve existing exclusions for accessibility, surface notices, reviewed station notices, regional timetable announcements, and cancellation-specific paths. Keep TTC and GO/UP freshness, eligibility, and capabilities independent.

## 3. Reproduction and confirmed failure paths

Reported Line 1 notices cover Vaughan Metropolitan Centre–Finch West, both directions:

- Parent: “There will be limited nightly service starting 11 p.m., between Vaughan and Finch West stations on Monday, September 28 to Thursday, October 1, due to planned track work.” The screenshot shows nightly hours 11 PM–2 AM.
- Active child: “There is limited subway service between Vaughan and Finch West stations due to planned track work.”
- Both display provider cause “Closure - Planned Track Work.” Raw structured effect values have not been verified. Inspect through approved local tooling if available; do not commit raw provider payloads. Use synthetic records for regression coverage and state any remaining source uncertainty.

Inspection found that [TtcAlertNormalizer](../backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizer.java) checks planned closure first, treats schedule/track-work clues as closure evidence, and includes cause text in suspension matching. [TtcClosureProjector](../backend/src/main/java/com/calebhabesh/linewatch/alert/TtcClosureProjector.java) hardcodes suspension in `activeSegmentImpacts()`. Both classification and projection need correction.

Explicit limited-service descriptions take precedence over the generic “Closure - Planned Track Work” cause. Restrict this override to established wording; preserve true no-service notices. Distinguish current statements from negation, restoration, and future wording. Do not silently extend the agreed cause-text override to every structured effect conflict: inspect the source record, encode a justified precedence rule, and test contradictory records conservatively.

## 4. Implementation sequence

### A. Establish scope and compatibility

Read root and affected scoped AGENTS guides, [domain invariants](domain-invariants.md), and [source launch gates](source-licensing-launch-gates.md). Before browser work, read [testing](testing.md). When editing generated alert scenarios, follow the [operations guide](operations-guide.md) scenario workflow and regenerate from the owning catalog.

Inspect `git status` and existing diffs before editing. At handoff creation there were unrelated Current Service, IncidentTiming, theme, stylesheet, and test changes. Integrate around those changes without reverting them.

Inventory category strings, effect switches, enums, DTOs, persisted values, filters, preference keys, route/query identifiers, browser storage, and fixtures. Separate user-visible names from compatibility identifiers. Internal keys such as `planned-closure`, `plannedClosures`, `alerts`, and `closures` may remain where changing them adds migration risk; their continued presence is not an incomplete display rename. Rename internal abstractions that now falsely assume every planned event is a closure when useful, updating all consumers atomically.

Completion: record the selected representation and compatibility strategy in the implementation PR, including how legacy records lacking a new field are handled.

### B. Normalize and persist the service effect

Trace `TtcAlertNormalizer`, `AlertImpactKind`, `NormalizedRouteAlert`, `AlertEntity`, feed application/store/upsert logic, fingerprints, and active-period reconciliation. Add explicit limited-service recognition and carry it without losing scheduled parent/child identity. Inspect `TtcSubwayClosureParser` and supplementary source merging for any path that would reintroduce closure semantics.

Preserve source IDs and namespaces. Ensure an already-stored event can be corrected on refresh even if its raw source text is unchanged; account for deduplication/fingerprint short circuits and cache eviction. Define how retained/history records receive accurate presentation without fabricating past evidence. Use a new Flyway migration if schema/data changes are necessary; never edit applied migrations.

Completion: normalized parent and child retain limited-service effect after storage/readback, existing true closures still normalize correctly, and correction of an existing record is covered.

### C. Project windows, current impacts, and status

Update `TtcClosureProjector`, `AlertDashboardService`, `TtcDashboardReadModel`, map impact projections, and `StatusDashboardService`. Preserve exact parent-period linkage, direction and segment/station boundaries, Toronto-time overnight and recurring windows, explicit ENDED EARLY behavior, and future occurrences. A parent alone in an effective window must project the correct effect; a linked active child must not duplicate it. A child may carry more specific occurrence evidence without incorrectly rewriting all later occurrences.

Update frontend contracts/adapters (`dashboard-contract.ts`, `linewatch-data.ts`, regional adapters), `current-service.ts`, `map-alert-selector.ts`, and overlay selectors. Scheduled timing must no longer imply suspension. Bucket counts must agree with visible lists and map selection. Preserve selection and parent/detail links as an occurrence activates or ends.

Completion: the same limited-service event is consistently a delay-bucket impact across API, Current Service, station views, line status, and both map modes.

### D. Refactor names across the application

Use this inventory as a starting point, then search the whole repository for remaining rendered category names, including singular/lowercase variants, accessibility strings, and backend-generated labels:

| Surface | Known owners / required coverage |
| --- | --- |
| Navigation and overview | `DesktopNavRail`, `LineWatchShell`, `LineImpactsPanel`, `CurrentServicePanel`, `DesktopStatusOverview`, `MobileStatusSheet`, `MobileStatusPeek`, `MobileLegend` |
| Category lists and cards | Active-alert panel owner, `PlannedClosuresPanel`, delay panel owner, `ImpactCardFields`, `CompactImpactListItem`, empty/loading/error states, counts, filter menus, tooltips, date/hour labels |
| Stations and saved views | `StationDetailPanel`, `RegionalStationDetailPanel`, `MyStationsPanel`, `SavedCommuteCard`; station submenu headings and per-line labels |
| Maps and detail selection | `MobileImpactInspector`, `RotatedMapSelectionCard`, `MapOverlapChooser`, `impact-overlap-refs`, `InteractiveTtcMap`, regional/geographic overlays, legends, preview controls, selection announcements |
| Search and history | `alert-search.ts`, `alert-history-filters`, history controls and `AlertHistoryService`; retain useful old search aliases while displaying new names |
| Reliability | `ReliabilityPanel`, backend `ReliabilityService`, summaries, chart legends, tooltips, fixture labels |
| Notifications | `NotificationSettingsPanel`, `commute-notification-edit-model.ts`, backend `PushNotificationFormatter`, line/commute planners, supported preference descriptions, notification history and service-worker display handling |
| Guidance and fallback content | `SiteGuideDropdown`, current README/feature reference, transit guide pages, onboarding/help/metadata where applicable, demo fixtures, API stubs and scenario catalogs |

Audit TTC and GO/UP consumers of shared labels. Keep regional-only cancellations and Service Notices in their existing supported flows. Preserve generic “active alerts” prose where it genuinely refers to all active notices rather than the renamed suspension category. Preserve original source text and legitimate closure-specific descriptions. Avoid a blind repository-wide replacement.

Completion: all category surfaces use Suspensions, Delays, Planned Advisories, and Reduced Speed Zones consistently, including assistive text; every remaining old category phrase has a deliberate source-specific, historical, or compatibility reason.

### E. Protect downstream meaning and saved state

Inspect commute matching/travel-time estimates, push candidate selection and formatter fallbacks, reliability intervals/history, and line status. Limited service must not become a shutdown, nor gain numeric delay minutes solely because it shares the Delays bucket. Existing actual-delay heuristics remain supported for their established inputs.

Preserve notification preference values and subscription IDs. Existing planned-event preferences apply to supported planned limited service through the same lifecycle; do not reset preferences, create duplicate notifications, or emit restored notifications solely because a label changed. Keep stable event identities, active/restored lifecycle entries, follow-up policies, update deduplication, and freshness gates. If effect corrections trigger an update, use existing update rules rather than presenting a new incident.

Keep history/reliability classification accurate: planned scheduling does not itself mean suspension or continuous disruption across the whole parent date range. Update backend-generated display labels as well as frontend fallbacks. Account for legacy cached dashboard/offline data when introducing fields; maintain independent freshness and offline unknown-status semantics. Never cache account/API responses in the service worker.

Completion: focused consumer tests prove the changed effect survives downstream without breaking persistence, preferences, notification identity, or interval accounting.

## 5. Regression matrix

Use production behavior tests at the owning layer, not source-string assertions standing in for routing/classification.

| Case | Required result |
| --- | --- |
| Limited-service parent with generic closure cause | Planned Advisories entry, explicit limited-service effect, accurate dates/hours |
| Parent alone inside nightly window | One orange current impact under Delays; planned details remain reachable |
| Parent plus exactly linked active child | One current impact; correct active-card label and planned-advisory link |
| Before start, midnight, exact end, between nights, later occurrence | Correct Toronto-time activity; no all-day or between-window impact |
| ENDED EARLY child vs ENDING EARLY text | Only actual completion ends the applicable occurrence; later occurrences survive |
| Genuine no-service parent/child | Suspensions/red current impact and accurate closure-specific card wording |
| Ordinary delay and explicit RSZ | Existing behavior, distinct RSZ bucket and supported actual-delay estimates preserved |
| Negated, restored, ambiguous or contradictory limited-service wording | No unsupported downgrade or fabricated service effect; documented conservative handling |
| Refresh of previously misclassified stored event | Effect corrects despite unchanged raw text where applicable; no duplicate IDs/history/push |
| Station-only or one-direction impact | Scope remains local and direction-aware across maps, station views and commutes |
| Preferences, active/restored notifications, history/reliability | New display names, stable saved selections/identity, correct effect and effective intervals |
| Legacy DTO/snapshot without new field, fixture/demo, stale/offline | Safe compatibility, honest source labels and no new live claims |
| TTC and GO/UP | Shared category names match; network-specific exclusions and freshness stay intact |

Inspect desktop at 1440px and compact mobile at 360px, light/dark themes, both map modes, station submenus, overview chips, linked active/planned cards, and notification settings. Verify wrapping, stable control dimensions, keyboard/focus and screen-reader names. “Planned Advisories” may wrap using existing layout conventions; it must not cause clipping or horizontal page overflow.

## 6. Final checks and completion evidence

Run targeted backend and frontend regressions while implementing. Once stable, run the affected guides’ final checks once:

- `mvn -f backend/pom.xml test`, including affected persistence/ingestion/contract coverage.
- `npm --prefix frontend run test:fast`, `typecheck`, and `lint` (same prefix for each).
- Frontend build plus relevant shell and integrated browser scenarios for naming, station navigation, active/planned linking, and both map projections; select commands from the testing guide and reuse only a matching build.
- Affected offline/lifecycle coverage when contracts, snapshots, preferences or notification state change. Use focused visual verification; review any baseline changes instead of automatically accepting them.

Perform a final repository-wide terminology audit. Classify residual old strings rather than requiring literal zero matches: applied migrations, source text, old search aliases, compatibility keys and historical plans are legitimate exceptions. Update maintained product documentation and affected domain guidance to reflect the new category/effect distinction; preserve historical records.

Deliver a PR/handoff summary with the chosen model representation, completed surface inventory, compatibility/migration behavior, regression evidence, browser views inspected, and material gaps. Completion requires both the limited-service correction and consistent application-wide category naming. Deployment and publication are outside this implementation handoff.
