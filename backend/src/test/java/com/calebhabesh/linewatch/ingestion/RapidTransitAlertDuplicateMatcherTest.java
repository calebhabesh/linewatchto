package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class RapidTransitAlertDuplicateMatcherTest {
    private final RapidTransitAlertDuplicateMatcher matcher =
        new RapidTransitAlertDuplicateMatcher();

    @Test
    void matchesCrossSourceIncidentWithReversedBounds() {
        NormalizedRouteAlert gtfsRt = alert(
            "gtfsrt-70483",
            "GTFS-RT",
            "line-2",
            AlertImpactKind.SUSPENSION,
            "Line 2: No service between Jane and Islington",
            "jane",
            "islington",
            List.of("jane", "old-mill", "islington"),
            "2026-06-19T16:18:00Z",
            null
        );
        NormalizedRouteAlert live = alert(
            "70490",
            "Live",
            "line-2",
            AlertImpactKind.SUSPENSION,
            "No subway service between Islington and Jane",
            "islington",
            "jane",
            List.of("islington", "old-mill", "jane"),
            "2026-06-19T16:25:00Z",
            null
        );

        assertThat(matcher.isGtfsRtDuplicateOfLive(gtfsRt, live)).isTrue();
    }

    @Test
    void matchesEqualResolvedStationSetsWhenBoundsAreUnavailable() {
        NormalizedRouteAlert gtfsRt = alert(
            "gtfsrt-stations",
            "GTFS-RT",
            "line-2",
            AlertImpactKind.DELAY,
            "Line 2 delays",
            null,
            null,
            List.of("jane", "old-mill", "islington"),
            "2026-06-19T16:18:00Z",
            null
        );
        NormalizedRouteAlert live = alert(
            "live-stations",
            "Live",
            "line-2",
            AlertImpactKind.DELAY,
            "Subway delay",
            null,
            null,
            List.of("islington", "jane", "old-mill"),
            "2026-06-19T16:20:00Z",
            null
        );

        assertThat(matcher.isGtfsRtDuplicateOfLive(gtfsRt, live)).isTrue();
    }

    @Test
    void matchesNormalizedTitleWhenStructuredScopeIsUnavailable() {
        NormalizedRouteAlert gtfsRt = alert(
            "gtfsrt-title",
            "GTFS-RT",
            "line-2",
            AlertImpactKind.SUSPENSION,
            "No service at Old Mill Station!",
            null,
            null,
            List.of(),
            "2026-06-19T16:18:00Z",
            null
        );
        NormalizedRouteAlert live = alert(
            "live-title",
            "Live",
            "line-2",
            AlertImpactKind.SUSPENSION,
            "no service at old mill station",
            null,
            null,
            List.of(),
            "2026-06-19T16:30:00Z",
            null
        );

        assertThat(matcher.isGtfsRtDuplicateOfLive(gtfsRt, live)).isTrue();
    }

    @Test
    void matchesOverlappingPeriodsEvenWhenStartsAreMoreThanAnHourApart() {
        NormalizedRouteAlert gtfsRt = alert(
            "gtfsrt-overlap",
            "GTFS-RT",
            "line-2",
            AlertImpactKind.PLANNED_CLOSURE,
            "Closure",
            "jane",
            "islington",
            List.of("jane", "islington"),
            "2026-06-20T04:00:00Z",
            "2026-06-20T10:00:00Z"
        );
        NormalizedRouteAlert live = alert(
            "live-overlap",
            "Planned",
            "line-2",
            AlertImpactKind.PLANNED_CLOSURE,
            "Closure",
            "jane",
            "islington",
            List.of("jane", "islington"),
            "2026-06-20T06:00:00Z",
            "2026-06-20T09:00:00Z"
        );

        assertThat(matcher.isGtfsRtDuplicateOfLive(gtfsRt, live)).isTrue();
    }

    @Test
    void acceptsMissingTimingFromOneSourceWhenScopeMatches() {
        NormalizedRouteAlert gtfsRt = alert(
            "gtfsrt-no-time",
            "GTFS-RT",
            "line-2",
            AlertImpactKind.SUSPENSION,
            "No service",
            "jane",
            "islington",
            List.of("jane", "islington"),
            null,
            null
        );
        NormalizedRouteAlert live = alert(
            "live-time",
            "Live",
            "line-2",
            AlertImpactKind.SUSPENSION,
            "No service",
            "jane",
            "islington",
            List.of("jane", "islington"),
            "2026-06-19T16:18:00Z",
            null
        );

        assertThat(matcher.isGtfsRtDuplicateOfLive(gtfsRt, live)).isTrue();
    }

    @Test
    void rejectsDifferentLineImpactScopeOrDistantClosedPeriod() {
        NormalizedRouteAlert gtfsRt = alert(
            "gtfsrt-base",
            "GTFS-RT",
            "line-2",
            AlertImpactKind.SUSPENSION,
            "No service",
            "jane",
            "islington",
            List.of("jane", "islington"),
            "2026-06-19T16:00:00Z",
            "2026-06-19T17:00:00Z"
        );

        assertThat(matcher.isGtfsRtDuplicateOfLive(
            gtfsRt,
            alert(
                "different-line", "Live", "line-1", AlertImpactKind.SUSPENSION,
                "No service", "jane", "islington", List.of("jane", "islington"),
                "2026-06-19T16:00:00Z", "2026-06-19T17:00:00Z"
            )
        )).isFalse();
        assertThat(matcher.isGtfsRtDuplicateOfLive(
            gtfsRt,
            alert(
                "different-impact", "Live", "line-2", AlertImpactKind.DELAY,
                "No service", "jane", "islington", List.of("jane", "islington"),
                "2026-06-19T16:00:00Z", "2026-06-19T17:00:00Z"
            )
        )).isFalse();
        assertThat(matcher.isGtfsRtDuplicateOfLive(
            gtfsRt,
            alert(
                "different-scope", "Live", "line-2", AlertImpactKind.SUSPENSION,
                "Different title", "kipling", "ossington", List.of("kipling", "ossington"),
                "2026-06-19T16:00:00Z", "2026-06-19T17:00:00Z"
            )
        )).isFalse();
        assertThat(matcher.isGtfsRtDuplicateOfLive(
            gtfsRt,
            alert(
                "distant-time", "Live", "line-2", AlertImpactKind.SUSPENSION,
                "No service", "jane", "islington", List.of("jane", "islington"),
                "2026-06-20T16:00:00Z", "2026-06-20T17:00:00Z"
            )
        )).isFalse();
    }

    @Test
    void neverMergesRecordsFromTheSameSourceType() {
        NormalizedRouteAlert gtfsRt = alert(
            "gtfsrt-one",
            "GTFS-RT",
            "line-2",
            AlertImpactKind.SUSPENSION,
            "No service",
            "jane",
            "islington",
            List.of("jane", "islington"),
            "2026-06-19T16:18:00Z",
            null
        );
        NormalizedRouteAlert secondGtfsRt = alert(
            "gtfsrt-two",
            "GTFS-RT",
            "line-2",
            AlertImpactKind.SUSPENSION,
            "No service",
            "jane",
            "islington",
            List.of("jane", "islington"),
            "2026-06-19T16:18:00Z",
            null
        );
        NormalizedRouteAlert live = alert(
            "live-one",
            "Live",
            "line-2",
            AlertImpactKind.SUSPENSION,
            "No service",
            "jane",
            "islington",
            List.of("jane", "islington"),
            "2026-06-19T16:18:00Z",
            null
        );

        assertThat(matcher.isGtfsRtDuplicateOfLive(gtfsRt, secondGtfsRt)).isFalse();
        assertThat(matcher.isGtfsRtDuplicateOfLive(live, live)).isFalse();
    }

    private NormalizedRouteAlert alert(
        String sourceId,
        String sourceType,
        String lineId,
        AlertImpactKind impactKind,
        String title,
        String startStationId,
        String endStationId,
        List<String> stationIds,
        String startsAt,
        String endsAt
    ) {
        OffsetDateTime start = startsAt == null ? null : OffsetDateTime.parse(startsAt);
        OffsetDateTime end = endsAt == null ? null : OffsetDateTime.parse(endsAt);
        return new NormalizedRouteAlert(
            "ttc-route-" + sourceId,
            sourceId,
            lineId,
            impactKind == AlertImpactKind.PLANNED_CLOSURE
                ? "planned-closure"
                : "active-alert",
            impactKind == AlertImpactKind.SUSPENSION ? "suspension" : "delay",
            title,
            "",
            sourceType,
            impactKind == AlertImpactKind.SUSPENSION ? "NO_SERVICE" : "SIGNIFICANT_DELAYS",
            "",
            AlertDirection.UNKNOWN,
            null,
            null,
            null,
            impactKind,
            null,
            null,
            null,
            null,
            null,
            startStationId,
            endStationId,
            start,
            end,
            start,
            null,
            null,
            null,
            "{}",
            stationIds,
            List.of(new NormalizedAlertPeriod("parent", start, end, 0)),
            sourceId + "-fingerprint"
        );
    }
}
