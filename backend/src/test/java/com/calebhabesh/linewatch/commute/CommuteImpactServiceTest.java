package com.calebhabesh.linewatch.commute;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CommuteImpactServiceTest {
    private final AlertDashboardService dashboardService = mock(AlertDashboardService.class);
    private final CommuteImpactService service = new CommuteImpactService(dashboardService);

    @Test
    void returnsClearImpactWhenNoDashboardImpactsMatchThePath() {
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of());
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        CommuteResponses.ImpactResponse impact = service.impactFor(path(
            List.of("finch", "north-york-centre", "sheppard-yonge"),
            List.of("line-1-finch-north-york-centre", "line-1-north-york-centre-sheppard-yonge")
        ));

        assertThat(impact.status()).isEqualTo("clear");
        assertThat(impact.severity()).isEqualTo("clear");
        assertThat(impact.statusLabel()).isEqualTo("Clear");
        assertThat(impact.detail()).isEqualTo("No active or planned LineWatch impacts match this route.");
        assertThat(impact.matchedImpacts()).isEmpty();
    }

    @Test
    void matchesActiveDelayByAffectedSegment() {
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of(new AlertDashboardService.DelayAlertDto(
            "delay_1",
            "line-1",
            "1",
            "Delays",
            "Eglinton to Davisville",
            "Southbound",
            "Trains are delayed.",
            List.of("line-1-eglinton-davisville"),
            OffsetDateTime.parse("2026-06-06T12:15:00-04:00"),
            OffsetDateTime.parse("2026-06-06T12:20:00-04:00"),
            "TTC Live Alert",
            "Mechanical issue"
        )));
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of());
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        CommuteResponses.ImpactResponse impact = service.impactFor(path(
            List.of("eglinton", "davisville", "st-clair"),
            List.of("line-1-eglinton-davisville", "line-1-davisville-st-clair")
        ));

        assertThat(impact.status()).isEqualTo("affected");
        assertThat(impact.severity()).isEqualTo("minor");
        assertThat(impact.statusLabel()).isEqualTo("Affected now");
        assertThat(impact.matchedImpacts()).singleElement().satisfies(match -> {
            assertThat(match.id()).isEqualTo("delay_1");
            assertThat(match.kind()).isEqualTo("delay");
            assertThat(match.status()).isEqualTo("current");
            assertThat(match.matchedSegmentIds()).containsExactly("line-1-eglinton-davisville");
            assertThat(match.matchedStationIds()).isEmpty();
        });
    }

    @Test
    void stationNodeImpactMatchesAnyStationOnTheComputedPath() {
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of());
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of(new AlertDashboardService.StationNodeImpact(
            "st-george",
            "suspension",
            "alert_station_1",
            "Emergency alarm at St George"
        )));

        CommuteResponses.ImpactResponse impact = service.impactFor(path(
            List.of("spadina", "st-george", "bay"),
            List.of("line-2-spadina-st-george", "line-2-st-george-bay")
        ));

        assertThat(impact.status()).isEqualTo("affected");
        assertThat(impact.severity()).isEqualTo("suspended");
        assertThat(impact.matchedImpacts()).singleElement().satisfies(match -> {
            assertThat(match.id()).isEqualTo("alert_station_1");
            assertThat(match.kind()).isEqualTo("suspension");
            assertThat(match.location()).isEqualTo("st-george");
            assertThat(match.matchedStationIds()).containsExactly("st-george");
        });
    }

    @Test
    void plannedClosureMatchesByPreviewSegmentWhenNoCurrentImpactMatches() {
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of(new AlertDashboardService.PlannedClosureDto(
            "closure_1",
            "line-2",
            "2",
            "Weekend closure",
            "Sat 11:00 PM - Sun 8:00 AM",
            "Kipling to Jane",
            "Eastbound & Westbound",
            "No subway service during track work.",
            OffsetDateTime.parse("2026-06-06T23:00:00-04:00"),
            OffsetDateTime.parse("2026-06-06T10:00:00-04:00"),
            List.of("line-2-kipling-islington", "line-2-islington-royal-york"),
            true,
            "TTC Service Advisory",
            "Track work",
            "Shuttle buses operate",
            false,
            "upcoming",
            false,
            null,
            null,
            null,
            OffsetDateTime.parse("2026-06-06T23:00:00-04:00"),
            OffsetDateTime.parse("2026-06-07T08:00:00-04:00"),
            "Sat 11:00 PM - Sun 8:00 AM"
        )));
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        CommuteResponses.ImpactResponse impact = service.impactFor(path(
            List.of("kipling", "islington", "royal-york"),
            List.of("line-2-kipling-islington", "line-2-islington-royal-york")
        ));

        assertThat(impact.status()).isEqualTo("planned");
        assertThat(impact.severity()).isEqualTo("planned");
        assertThat(impact.statusLabel()).isEqualTo("Planned impact");
        assertThat(impact.matchedImpacts()).singleElement().satisfies(match -> {
            assertThat(match.id()).isEqualTo("closure_1");
            assertThat(match.kind()).isEqualTo("planned-closure");
            assertThat(match.status()).isEqualTo("planned");
            assertThat(match.window()).isEqualTo("Sat 11:00 PM - Sun 8:00 AM");
        });
    }

    @Test
    void reducedSpeedZoneDoesNotMatchWhenRouteTravelsOppositeDirectionOnSegment() {
        String segmentId = "line-1-lawrence-west-glencairn";
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of(new AlertDashboardService.ReducedSpeedZoneDto(
            "rsz_1",
            "line-1",
            "1",
            "Reduced Speed Zone",
            "Glencairn to Lawrence West",
            "Northbound",
            "Trains are operating through a reduced speed zone.",
            OffsetDateTime.parse("2026-06-06T12:15:00-04:00"),
            OffsetDateTime.parse("2026-06-06T12:20:00-04:00"),
            List.of(segmentId),
            List.of("ttc-route-1"),
            List.of(),
            "TTC Live Alert",
            null,
            null,
            null,
            null,
            null,
            null,
            null
        )));
        when(dashboardService.activeSegmentImpacts()).thenReturn(Map.of(
            segmentId,
            List.of(new AlertDashboardService.SegmentImpact(
                "reduced-speed-zone",
                "rsz_1",
                "reverse",
                List.of("ttc-route-1")
            ))
        ));
        when(dashboardService.plannedClosures()).thenReturn(List.of());
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        CommuteResponses.ImpactResponse impact = service.impactFor(pathWithHop(
            List.of("lawrence-west", "glencairn"),
            segmentId,
            "forward"
        ));

        assertThat(impact.status()).isEqualTo("clear");
        assertThat(impact.severity()).isEqualTo("clear");
        assertThat(impact.matchedImpacts()).isEmpty();
    }

    @Test
    void reducedSpeedZoneMatchesWhenRouteTravelsSameDirectionOnSegment() {
        String segmentId = "line-1-lawrence-west-glencairn";
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of(new AlertDashboardService.ReducedSpeedZoneDto(
            "rsz_1",
            "line-1",
            "1",
            "Reduced Speed Zone",
            "Glencairn to Lawrence West",
            "Northbound",
            "Trains are operating through a reduced speed zone.",
            OffsetDateTime.parse("2026-06-06T12:15:00-04:00"),
            OffsetDateTime.parse("2026-06-06T12:20:00-04:00"),
            List.of(segmentId),
            List.of("ttc-route-1"),
            List.of(),
            "TTC Live Alert",
            null,
            null,
            null,
            null,
            null,
            null,
            null
        )));
        when(dashboardService.activeSegmentImpacts()).thenReturn(Map.of(
            segmentId,
            List.of(new AlertDashboardService.SegmentImpact(
                "reduced-speed-zone",
                "rsz_1",
                "reverse",
                List.of("ttc-route-1")
            ))
        ));
        when(dashboardService.plannedClosures()).thenReturn(List.of());
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        CommuteResponses.ImpactResponse impact = service.impactFor(pathWithHop(
            List.of("glencairn", "lawrence-west"),
            segmentId,
            "reverse"
        ));

        assertThat(impact.status()).isEqualTo("affected");
        assertThat(impact.severity()).isEqualTo("minor");
        assertThat(impact.matchedImpacts()).singleElement().satisfies(match -> {
            assertThat(match.id()).isEqualTo("rsz_1");
            assertThat(match.matchedSegmentIds()).containsExactly(segmentId);
        });
    }

    @Test
    void unavailablePathReturnsUnavailableImpactWithoutReadingDashboardImpacts() {
        CommuteResponses.ImpactResponse impact = service.impactFor(new CommuteResponses.PathResponse(
            "unavailable",
            List.of("finch", "islington"),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            0,
            "unavailable",
            "Route path unavailable"
        ));

        assertThat(impact.status()).isEqualTo("unavailable");
        assertThat(impact.severity()).isEqualTo("unavailable");
        assertThat(impact.statusLabel()).isEqualTo("Route unavailable");
        assertThat(impact.detail()).isEqualTo("LineWatch TO could not compute a rapid-transit path for this saved commute.");
        assertThat(impact.matchedImpacts()).isEmpty();
        verifyNoInteractions(dashboardService);
    }

    private CommuteResponses.PathResponse path(List<String> stationIds, List<String> segmentIds) {
        return new CommuteResponses.PathResponse(
            "available",
            stationIds,
            segmentIds,
            List.of(),
            List.of("line-1"),
            List.of(),
            300,
            "gtfs-scheduled-median",
            stationIds.size() + " stations on Line 1"
        );
    }

    private CommuteResponses.PathResponse pathWithHop(List<String> stationIds, String segmentId, String travelDirection) {
        return new CommuteResponses.PathResponse(
            "available",
            stationIds,
            List.of(segmentId),
            List.of(new CommuteResponses.PathSegmentHopResponse(
                segmentId,
                "line-1",
                stationIds.get(0),
                stationIds.get(1),
                travelDirection
            )),
            List.of("line-1"),
            List.of(),
            120,
            "topology-fallback",
            stationIds.size() + " stations on Line 1"
        );
    }
}
