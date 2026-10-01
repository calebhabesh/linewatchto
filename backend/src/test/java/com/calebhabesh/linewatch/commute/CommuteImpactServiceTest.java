package com.calebhabesh.linewatch.commute;

import tools.jackson.databind.json.JsonMapper;
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
    void limitedServiceMatchesDelayBucketButHasNoNumericTravelTimeEstimate() {
        when(dashboardService.delays()).thenReturn(List.of(new AlertDashboardService.DelayAlertDto(
            "limited", "line-1", "1", "Limited service", "Finch to Sheppard-Yonge", null,
            "There is limited subway service.", List.of("affected"), null, null, "TTC Live Alerts", null,
            "limited-service", "planned-parent", null, false, "Limited service")));
        when(dashboardService.activeSegmentImpacts()).thenReturn(Map.of("affected", List.of(
            new AlertDashboardService.SegmentImpact("delay", "limited", "bidirectional", List.of("limited")))));
        CommuteResponses.ImpactResponse impact = service.impactFor(path(List.of("finch", "sheppard-yonge"), List.of("affected")));
        assertThat(impact.matchedImpacts()).singleElement().satisfies(match -> {
            assertThat(match.kind()).isEqualTo("delay");
            assertThat(match.serviceEffect()).isEqualTo("limited-service");
            assertThat(match.relatedPlannedClosureId()).isEqualTo("planned-parent");
        });
        assertThat(impact.travelTimeEstimate().estimatedLowSeconds()).isNull();
        assertThat(impact.travelTimeEstimate().extraHighSeconds()).isNull();
        assertThat(impact.travelTimeEstimate().summary()).contains("additional travel time is unknown");
    }

    @Test
    void stationOnlyLimitedAdvisoryMatchesOnlyRoutesThroughThatStation() {
        AlertDashboardService.PlannedClosureDto advisory = new AlertDashboardService.PlannedClosureDto(
            "local", "line-1", "1", "Limited service at Finch", "Tonight", "Finch", "Both directions",
            "There will be limited service.", OffsetDateTime.parse("2026-09-29T03:00:00Z"), null,
            List.of(), false, "Synthetic fixture", null, null).withServiceEffect("limited-service")
            .withPreviewStationIds(List.of("finch"));
        when(dashboardService.plannedClosures()).thenReturn(List.of(advisory));
        assertThat(service.impactFor(path(List.of("finch", "north-york-centre"), List.of("unaffected"))).matchedImpacts())
            .singleElement().satisfies(match -> {
                assertThat(match.matchedStationIds()).containsExactly("finch");
                assertThat(match.matchedSegmentIds()).isEmpty();
                assertThat(match.serviceEffect()).isEqualTo("limited-service");
            });
        assertThat(service.impactFor(path(List.of("eglinton", "davisville"), List.of("unaffected"))).matchedImpacts()).isEmpty();
    }

    @Test
    void oneDirectionLimitedAdvisoryDoesNotMatchTheOppositeCommuteDirection() {
        AlertDashboardService.PlannedClosureDto advisory = new AlertDashboardService.PlannedClosureDto(
            "directional", "line-1", "1", "Limited service", "Tonight", "Eglinton to Davisville", "Southbound",
            "There will be limited service southbound.", null, null, List.of("affected"), false, "Synthetic fixture", null, null,
            false, "upcoming", false, null, null, null, OffsetDateTime.parse("2026-09-29T03:00:00Z"),
            OffsetDateTime.parse("2026-09-29T06:00:00Z"), "Tonight", null, null, "Limited service", "forward")
            .withServiceEffect("limited-service");
        when(dashboardService.plannedClosures()).thenReturn(List.of(advisory));
        assertThat(service.impactFor(pathWithHop(List.of("eglinton", "davisville"), "affected", "forward")).matchedImpacts()).hasSize(1);
        assertThat(service.impactFor(pathWithHop(List.of("davisville", "eglinton"), "affected", "reverse")).matchedImpacts()).isEmpty();
    }

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
        assertThat(impact.travelTimeEstimate()).satisfies(estimate -> {
            assertThat(estimate.status()).isEqualTo("standard");
            assertThat(estimate.baselineSeconds()).isEqualTo(300);
            assertThat(estimate.estimatedLowSeconds()).isEqualTo(300);
            assertThat(estimate.estimatedHighSeconds()).isEqualTo(300);
            assertThat(estimate.extraLowSeconds()).isZero();
            assertThat(estimate.extraHighSeconds()).isZero();
            assertThat(estimate.confidence()).isEqualTo("high");
            assertThat(estimate.summary()).isEqualTo("Typical commute: about 5 min. No extra time estimated.");
        });
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
            "TTC Live Alerts",
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
            assertThat(match.description()).isEqualTo("Trains are delayed.");
            assertThat(match.matchedSegmentIds()).containsExactly("line-1-eglinton-davisville");
            assertThat(match.matchedStationIds()).isEmpty();
        });
        assertThat(impact.travelTimeEstimate()).satisfies(estimate -> {
            assertThat(estimate.status()).isEqualTo("estimated");
            assertThat(estimate.baselineSeconds()).isEqualTo(300);
            assertThat(estimate.estimatedLowSeconds()).isEqualTo(480);
            assertThat(estimate.estimatedHighSeconds()).isEqualTo(900);
            assertThat(estimate.extraLowSeconds()).isEqualTo(180);
            assertThat(estimate.extraHighSeconds()).isEqualTo(600);
            assertThat(estimate.confidence()).isEqualTo("medium");
            assertThat(estimate.summary()).isEqualTo("Typical commute: about 5 min. With current impacts: about 8-15 min. Extra time: +3-10 min.");
        });
    }

    @Test
    void activeSuspensionMarksTravelTimeEstimateAsUnreliable() {
        when(dashboardService.activeAlerts()).thenReturn(List.of(new AlertDashboardService.ActiveAlertDto(
            "suspension_1",
            "line-1",
            "1",
            "No service",
            "suspension",
            "Eglinton to Davisville",
            "Southbound",
            "No subway service due to an emergency investigation.",
            OffsetDateTime.parse("2026-06-06T12:15:00-04:00"),
            OffsetDateTime.parse("2026-06-06T12:20:00-04:00"),
            List.of("line-1-eglinton-davisville"),
            true,
            "TTC Live Alerts",
            "Emergency",
            "Shuttle buses operate"
        )));
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of());
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        CommuteResponses.ImpactResponse impact = service.impactFor(path(
            List.of("eglinton", "davisville", "st-clair"),
            List.of("line-1-eglinton-davisville", "line-1-davisville-st-clair")
        ));

        assertThat(impact.status()).isEqualTo("affected");
        assertThat(impact.severity()).isEqualTo("suspended");
        assertThat(impact.travelTimeEstimate()).satisfies(estimate -> {
            assertThat(estimate.status()).isEqualTo("unreliable");
            assertThat(estimate.baselineSeconds()).isEqualTo(300);
            assertThat(estimate.estimatedLowSeconds()).isNull();
            assertThat(estimate.estimatedHighSeconds()).isNull();
            assertThat(estimate.extraLowSeconds()).isNull();
            assertThat(estimate.extraHighSeconds()).isNull();
            assertThat(estimate.confidence()).isEqualTo("low");
            assertThat(estimate.summary()).isEqualTo("Typical commute: about 5 min. Major disruption on this route; travel time is not reliable.");
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
            "Emergency alarm at St George",
            "TTC GTFS-RT"
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
            assertThat(match.source()).isEqualTo("TTC GTFS-RT");
            assertThat(match.matchedStationIds()).containsExactly("st-george");
        });
    }

    @Test
    void plannedClosureMatchesByPreviewSegmentWhenNoCurrentImpactMatches() throws Exception {
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
            "Sat 11:00 PM - Sun 8:00 AM",
            null,
            null,
            "No subway service between Kipling and Jane stations"
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
            assertThat(match.notificationTitle()).isEqualTo(
                "No subway service between Kipling and Jane stations"
            );
            assertThat(match.notificationCause()).isEqualTo("Track work");
            assertThat(match.notificationShuttle()).isTrue();
        });
        assertThat(impact.travelTimeEstimate()).satisfies(estimate -> {
            assertThat(estimate.status()).isEqualTo("standard");
            assertThat(estimate.baselineSeconds()).isEqualTo(300);
            assertThat(estimate.extraLowSeconds()).isZero();
            assertThat(estimate.extraHighSeconds()).isZero();
        });
        String json = JsonMapper.builder().findAndAddModules().build()
            .writeValueAsString(impact.matchedImpacts().getFirst());
        assertThat(json).doesNotContain(
            "notificationTitle",
            "notificationCause",
            "notificationShuttle"
        );
    }

    @Test
    void ignoredCurrentImpactStillChangesAbsoluteTravelTimeEstimate() {
        CommuteResponses.MatchedImpactResponse ignoredDelay = new CommuteResponses.MatchedImpactResponse(
            "delay_ignored",
            "delay",
            "current",
            "minor",
            "Delays",
            "line-1",
            "1",
            "Eglinton to Davisville",
            "Southbound",
            "Trains are delayed.",
            "TTC Live Alerts",
            List.of("line-1-eglinton-davisville"),
            List.of(),
            OffsetDateTime.parse("2026-06-06T12:15:00-04:00"),
            OffsetDateTime.parse("2026-06-06T12:20:00-04:00"),
            null,
            "active-now",
            OffsetDateTime.parse("2026-06-06T12:15:00-04:00"),
            true
        );

        CommuteResponses.ImpactResponse impact = service.responseForMatches(
            path(
                List.of("eglinton", "davisville", "st-clair"),
                List.of("line-1-eglinton-davisville", "line-1-davisville-st-clair")
            ),
            List.of(ignoredDelay)
        );

        assertThat(impact.status()).isEqualTo("clear");
        assertThat(impact.severity()).isEqualTo("clear");
        assertThat(impact.statusLabel()).isEqualTo("Clear by filters");
        assertThat(impact.detail()).contains("ignored by this commute's route filters");
        assertThat(impact.matchedImpacts()).singleElement().extracting(CommuteResponses.MatchedImpactResponse::ignoredByRule).isEqualTo(true);
        assertThat(impact.travelTimeEstimate()).satisfies(estimate -> {
            assertThat(estimate.status()).isEqualTo("estimated");
            assertThat(estimate.baselineSeconds()).isEqualTo(300);
            assertThat(estimate.estimatedLowSeconds()).isEqualTo(480);
            assertThat(estimate.estimatedHighSeconds()).isEqualTo(900);
        });
    }

    @Test
    void activePlannedClosureWindowMarksTravelTimeUnreliable() {
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of(new AlertDashboardService.PlannedClosureDto(
            "nightly_closure_1",
            "line-1",
            "1",
            "Nightly closure",
            "Nightly closure windows",
            "Eglinton to Davisville",
            "Northbound & Southbound",
            "No subway service during track work.",
            OffsetDateTime.parse("2026-06-06T23:59:00-04:00"),
            OffsetDateTime.parse("2026-06-06T20:00:00-04:00"),
            List.of("line-1-eglinton-davisville"),
            true,
            "TTC Service Advisory",
            "Track work",
            "Shuttle buses operate",
            true,
            "active-now",
            true,
            OffsetDateTime.parse("2026-06-06T23:59:00-04:00"),
            OffsetDateTime.parse("2026-06-07T05:00:00-04:00"),
            "Tonight 11:59 PM - 5:00 AM",
            null,
            null,
            null,
            null,
            null
        )));
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        CommuteResponses.ImpactResponse impact = service.impactFor(path(
            List.of("eglinton", "davisville", "st-clair"),
            List.of("line-1-eglinton-davisville", "line-1-davisville-st-clair")
        ));

        assertThat(impact.status()).isEqualTo("affected");
        assertThat(impact.severity()).isEqualTo("major");
        assertThat(impact.matchedImpacts()).singleElement().satisfies(match -> {
            assertThat(match.status()).isEqualTo("current");
            assertThat(match.timingStatus()).isEqualTo("active-now");
        });
        assertThat(impact.travelTimeEstimate().status()).isEqualTo("unreliable");
    }

    @Test
    void linkedActiveClosureChildReplacesCanonicalClosureInCurrentDisruptions() {
        String segmentId = "line-4-sheppard-yonge-bayview";
        when(dashboardService.activeAlerts()).thenReturn(List.of(new AlertDashboardService.ActiveAlertDto(
            "closure-active-child",
            "line-4",
            "4",
            "No subway service between Sheppard-Yonge and Don Mills",
            "planned",
            "Sheppard-Yonge to Don Mills",
            "Eastbound & Westbound",
            "No subway service during the active overnight closure window.",
            OffsetDateTime.parse("2026-07-28T23:59:00-04:00"),
            OffsetDateTime.parse("2026-07-28T20:00:00-04:00"),
            List.of(segmentId),
            false,
            "TTC Live Alerts",
            "Planned work",
            null,
            "closure-parent"
        )));
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of(new AlertDashboardService.PlannedClosureDto(
            "closure-parent",
            "line-4",
            "4",
            "No subway service between Sheppard-Yonge and Don Mills",
            "Nightly closure windows",
            "Sheppard-Yonge to Don Mills",
            "Eastbound & Westbound",
            "No subway service during planned work.",
            OffsetDateTime.parse("2026-07-27T23:59:00-04:00"),
            OffsetDateTime.parse("2026-07-24T12:00:00-04:00"),
            List.of(segmentId),
            false,
            "TTC Service Advisory",
            "Planned work",
            null,
            true,
            "active-now",
            true,
            OffsetDateTime.parse("2026-07-28T23:59:00-04:00"),
            OffsetDateTime.parse("2026-07-29T03:30:00-04:00"),
            "Tonight 11:59 PM - 3:30 AM",
            null,
            null,
            null,
            "11:59 PM - 3:30 AM",
            "Jul 27 - Jul 31"
        )));
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        CommuteResponses.ImpactResponse impact = service.impactFor(path(
            List.of("sheppard-yonge", "bayview"),
            List.of(segmentId)
        ));

        assertThat(impact.status()).isEqualTo("affected");
        assertThat(impact.matchedImpacts()).singleElement().satisfies(match -> {
            assertThat(match.id()).isEqualTo("closure-active-child");
            assertThat(match.kind()).isEqualTo("planned-closure");
            assertThat(match.status()).isEqualTo("current");
        });
        assertThat(impact.travelTimeEstimate().status()).isEqualTo("unreliable");
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
            "TTC Live Alerts",
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
            "TTC Live Alerts",
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
        assertThat(impact.detail()).isEqualTo("LineWatchTO could not compute a rapid-transit path for this commute.");
        assertThat(impact.matchedImpacts()).isEmpty();
        assertThat(impact.travelTimeEstimate()).satisfies(estimate -> {
            assertThat(estimate.status()).isEqualTo("unavailable");
            assertThat(estimate.baselineSeconds()).isZero();
            assertThat(estimate.estimatedLowSeconds()).isNull();
            assertThat(estimate.estimatedHighSeconds()).isNull();
            assertThat(estimate.extraLowSeconds()).isNull();
            assertThat(estimate.extraHighSeconds()).isNull();
            assertThat(estimate.confidence()).isEqualTo("none");
            assertThat(estimate.summary()).isEqualTo("Travel time estimate unavailable because no route path could be computed.");
        });
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
