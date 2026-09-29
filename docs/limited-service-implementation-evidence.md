# Alert categories and limited-service implementation evidence

The application uses **Suspensions · Delays · Planned Advisories · Reduced Speed Zones**. Specific limited-service descriptions remain **Limited service** and **Planned limited service**. True closure descriptions remain accurate event-specific wording.

## Representation and compatibility

- `AlertImpactKind.LIMITED_SERVICE` persists as `limited-service` in the existing `impact_kind` column. The existing `type` distinguishes scheduled advisories from standalone current impacts; stored occurrence periods continue to own timing. Flyway V84 extends the existing impact-kind constraint; existing rows and applied migrations remain unchanged.
- Planned and delay DTOs expose `serviceEffect`; delay DTOs also carry their canonical parent ID and current end time. Commute matches preserve the effect and parent ID. Frontend category/effect helpers and backend category labels provide the display boundary.
- Existing `planned-closure`, `plannedClosures`, `alerts`, `closures`, source namespaces, API collections, saved preference keys, subscription IDs, and notification event types remain compatible. Legacy DTO constructors and optional frontend fields preserve old payloads and offline snapshots. A legacy planned record without effect information retains its recorded closure semantics; the UI never re-parses its rendered title to invent an effect.
- Classification is already part of the normalization fingerprint. Refresh upserts the corrected effect under the same source ID, records an ordinary update snapshot, and uses the existing successful-ingestion cache eviction. Notification occurrence identity and planned-event filters remain stable when a current event moves from the suspension list to Delays. Existing update/restored policies and independent network freshness gates remain in force.
- Historical snapshots preserve the evidence and classification recorded at that time. New correction snapshots carry the corrected effect. No bulk rewrite claims knowledge of unverified historical structured effects; retained events that never refresh keep their historical classification. Delivered notification history similarly retains its original copy.

## Completed surfaces

Navigation rails and mobile category actions; overview chips and Current Service; card/list headings and advisory timing fields; TTC/regional station details, saved stations and commutes; map selectors, Diagram and Geographic overlays, overlap labels and inspectors; search labels and old aliases; history and reliability labels; notification settings, line/commute planners and formatter; guidance and maintained product/domain documentation.

Current limited service projects one delay impact with access to planned details. Exact child IDs supply occurrence-specific evidence; child completion does not end later nights. Single-station projections stay local. Station impact actions select the current bucket and keep planned details reachable; a genuine active closure now opens its current Suspension child from a station panel. Limited service has unknown additional commute time rather than a numeric delay heuristic. Scheduled reliability accounting uses stored occurrence windows and avoids counting the linked child again; breakdowns group limited service under Delays. Reliability uses the latest correction within a recorded lifecycle, and exact linked child evidence can override only its own occurrence. History keeps the specific effect label within the existing Delays filter.

## Conservative source handling

Synthetic records cover the reported Vaughan–Finch West wording and generic “Closure - Planned Track Work” cause. The reported live record's raw structured effect has not been verified through a running operator diagnostic endpoint. Supported compatible structured values include missing effect, delay codes, `LIMITED_SERVICE`, `REDUCED_SERVICE`, and `UNKNOWN_EFFECT`. Contradictory `NO_SERVICE`, `NO_EFFECT`, detour, and explicit RSZ evidence stay unmatched. Negated, restored, ambiguous, and unsupported future statements do not establish a current impact; explicit ENDED EARLY records retain completion evidence without a current impact. Generic track-work causes or schedules alone no longer establish suspension.

The synthetic `limited-service-active-window` scenario was authored in the catalog and regenerated. Raw provider payloads were not added. TTC surface/accessibility notices and regional cancellations, timetable Service Notices, and provider freshness exclusions remain independent.

## Validation

- Backend: `mvn -f backend/pom.xml test` passed, 1,201 tests with PostgreSQL/Flyway persistence coverage.
- Frontend: `test:fast`, `test:scripts:all`, `typecheck`, and the production `build` passed. `lint` passed with 0 errors and 17 hook-dependency warnings. The script checks include 23 Node tests and 29 release, 8 staging, and 7 AWS lab shell cases.
- Browser: the limited-service suite passed 10 desktop/mobile cases across light/dark themes, diagram/geographic maps, and station-only current/planned markers. The mobile service sheet passed 18 cases, the offline snapshot suite passed 4, and the desktop lifecycle gate passed 13 with 3 mobile-only skips. Focused dashboard checks passed for alert history, a true planned closure, TTC and regional station navigation, station accessibility details, station search, category filtering, notification deep links, map overlay ordering, regional commute notification exclusions, and mobile notification settings.
- Screenshots were inspected at 1440px desktop and 360px mobile in both themes and map modes. The mobile Planned Advisories heading wraps without clipping; the current limited-service marker is orange and its planned preview is blue. Browser artifacts remain under `/tmp`, and no screenshot baselines were accepted automatically.

The reported live record's raw structured effect is still unverified. Deployment and publication are outside this change.
