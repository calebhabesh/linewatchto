# Metrolinx alert normalization evaluation

This is a local synthetic evaluation of the deterministic implementation in
`2026-09-18-metrolinx-alert-normalization.md`. It does not use retained provider
payloads and is not a production rollout report. The September UP and October
Barrie wording below are minimal synthetic examples of the reported cases.

| Case | Previous interpretation | Current interpretation |
| --- | --- | --- |
| UP September 19–20 closure plus September 21 timetable clause | Multiple dates could defeat text-window extraction; the GTFS notice-visibility period could then look like an active closure | September 19–20 is one date-only closure window; the September 21 timetable clause is a linked Service Notice with no overlay |
| “Starting late-evening tonight” | No separately represented early start | A linked advisory states the publication date and unknown hour; no early closure overlay or push |
| Barrie October 3–4, Union–Downsview Park closed while Aurora/Allandale trains continue to Downsview Park | First/last mentioned stations could extend the closed span into continuing service | Only Union–Downsview Park segments are mapped; positive-service clauses are excluded from scope |
| Two structured periods separated by a gap | Earliest start and latest end could bridge the gap | Distinct impact rows; the gap has no current closure |
| No trustworthy timing or scope | Missing start could become current, or uncertain record could disappear from status | Source-labeled advisory with empty affected segments; line status avoids an all-clear |

Date-only windows use America/Toronto midnight inclusive to the next local
midnight exclusive. Their duration follows daylight-saving changes. This is a
calendar-day interpretation, not an assertion about an unpublished start hour.
An explicit structured overnight period keeps its actual instants. A local
publication time in a DST gap or repeated hour is rejected as an ambiguous
relative-date anchor.

Dashboard reads project stored windows at the current clock time. The regional
cache expires by the next window boundary. Freshness is checked per retained
normalized row as well as for the required regional poll. Advisories are
excluded from map overlays, commute matching, push candidates and active
reliability snapshots. Regional restored push is suppressed because a window
ending or a notice disappearing does not verify restoration.

Rollout state: code and migration are local only; nothing was deployed. The
existing Metrolinx ingestion enable switch is the safe rollback: disabling it
suppresses fresh regional claims while retaining static catalog data. The
reported production October payload was unavailable, so its exact wording and
any independent frontend overlap-badge problem remain unverified. A temporary
local PostgreSQL 18 instance applied all 82 Flyway migrations, started the
backend with JPA validation, and accepted an advisory row whose reliability
snapshot was inactive. The temporary database and container were removed.

Validation: `mvn -f backend/pom.xml test` passed (1,067 tests);
focused dashboard and scenario tests passed again after the final status-copy
change. The tests cover synthetic September and October clauses, disjoint
periods, read-time transitions, a Toronto DST boundary, uncertain advisories,
source revision and supplemental failure, incomplete-coverage status, and
suppression of advisory pushes.
