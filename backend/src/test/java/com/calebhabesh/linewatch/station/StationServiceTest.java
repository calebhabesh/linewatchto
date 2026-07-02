package com.calebhabesh.linewatch.station;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.arrival.ArrivalPrediction;
import com.calebhabesh.linewatch.arrival.ArrivalService;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class StationServiceTest {
    @Mock
    private StationRepository stationRepository;
    @Mock
    private TransitLineRepository transitLineRepository;
    @Mock
    private StationLineRepository stationLineRepository;
    @Mock
    private StationAccessStatusRepository accessStatusRepository;
    @Mock
    private StationImpactRepository impactRepository;
    @Mock
    private StationLiveReadRepository liveReadRepository;
    @Mock
    private IngestionFreshness ingestionFreshness;
    @Mock
    private ArrivalService arrivalService;
    @Mock
    private AlertDashboardService alertDashboardService;

    @InjectMocks
    private StationService stationService;

    @Test
    void stationSummariesIncludeLineIdsAccessStatusAndActiveImpactFlag() {
        StationEntity union = new StationEntity("union", "Union", 4311, 3597, true, 10, null);
        StationLineEntity stationLine = new StationLineEntity(
            1L, "union", "line-1", "Northbound / Southbound", 1, true, true
        );
        StationAccessStatusEntity access = new StationAccessStatusEntity(
            "union",
            "normal",
            "No station access advisories in demo data.",
            "Fixture seed"
        );
        StationImpactEntity impact = new StationImpactEntity(
            "impact-union-delay",
            "union",
            "active-alert",
            "delay",
            "Slow trains",
            "Trains are moving slowly through Union.",
            "Fixture seed",
            "TTC service alert fixture",
            1
        );

        when(stationRepository.findAllByOrderBySortOrderAscNameAsc()).thenReturn(List.of(union));
        when(stationLineRepository.findAllByOrderByStationIdAscSortOrderAsc()).thenReturn(List.of(stationLine));
        when(accessStatusRepository.findAll()).thenReturn(List.of(access));
        when(impactRepository.findAll()).thenReturn(List.of(impact));

        StationResponses.StationListResponse response = stationService.stationSummaries();

        assertThat(response.generatedAt()).isEqualTo("seeded-demo");
        assertThat(response.stations()).hasSize(1);
        StationResponses.StationSummaryResponse summary = response.stations().getFirst();
        assertThat(summary.id()).isEqualTo("union");
        assertThat(summary.lineIds()).containsExactly("line-1");
        assertThat(summary.accessStatus()).isEqualTo("normal");
        assertThat(summary.accessOutageCounts().elevator()).isZero();
        assertThat(summary.accessOutageCounts().escalator()).isZero();
        assertThat(summary.hasActiveImpact()).isTrue();
    }

    @Test
    void stationDetailIncludesLinesAccessImpactsArrivalsAndDisclaimer() {
        StationEntity union = new StationEntity("union", "Union", 4311, 3597, true, 10, null);
        TransitLineEntity line = new TransitLineEntity("line-1", "1", "Yonge-University", "#F8C300", 1);
        StationLineEntity stationLine = new StationLineEntity(
            1L, "union", "line-1", "Northbound / Southbound", 1, true, true
        );
        StationAccessStatusEntity access = new StationAccessStatusEntity(
            "union",
            "normal",
            "No station access advisories in demo data.",
            "Fixture seed"
        );
        StationImpactEntity impact = new StationImpactEntity(
            "impact-union-weekend",
            "union",
            "planned-closure",
            "planned",
            "Weekend signal upgrades",
            "Planned work affects Line 1 north of Eglinton. Union remains open.",
            "Fixture seed",
            "Planned TTC closure fixture",
            1
        );

        when(stationRepository.findById("union")).thenReturn(Optional.of(union));
        when(stationLineRepository.findByStationIdOrderBySortOrderAsc("union")).thenReturn(List.of(stationLine));
        when(transitLineRepository.findAllById(List.of("line-1"))).thenReturn(List.of(line));
        when(accessStatusRepository.findById("union")).thenReturn(Optional.of(access));
        when(impactRepository.findByStationIdOrderBySortOrderAsc("union")).thenReturn(List.of(impact));
        when(arrivalService.arrivalsFor(any(), any())).thenReturn(List.of(
            new ArrivalPrediction("line-1", "Northbound", 2, OffsetDateTime.now(), "Demo estimates", "demo", "2 min")
        ));

        StationResponses.StationDetailResponse response = stationService.stationDetail("union");

        assertThat(response.id()).isEqualTo("union");
        assertThat(response.lines()).extracting(StationResponses.StationLineResponse::id).containsExactly("line-1");
        assertThat(response.lines().getFirst().wheelchairAccessible()).isTrue();
        assertThat(response.lines().getFirst().hasElevator()).isTrue();
        assertThat(response.access().status()).isEqualTo("normal");
        assertThat(response.impacts()).extracting(StationResponses.StationImpactResponse::id).containsExactly("impact-union-weekend");
        assertThat(response.arrivals()).isNotEmpty();
        assertThat(response.arrivals().getFirst().label()).isEqualTo("2 min");
        assertThat(response.arrivalsSource()).isEqualTo("Demo estimates");
        assertThat(response.disclaimer()).contains("not live TTC predictions");
    }

    @Test
    void stationDetailThrowsForUnknownStation() {
        when(stationRepository.findById("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> stationService.stationDetail("missing"))
            .isInstanceOf(StationNotFoundException.class)
            .hasMessageContaining("missing");
    }

    @Test
    void freshStationDetailUsesLinkedAccessibilityOutagesAndRouteAlerts() {
        OffsetDateTime updatedAt = OffsetDateTime.parse("2026-06-02T14:12:00-04:00");
        StationEntity union = new StationEntity("union", "Union", 4311, 3597, true, 10, null);
        TransitLineEntity line = new TransitLineEntity("line-1", "1", "Yonge-University", "#F8C300", 1);
        StationLineEntity stationLine = new StationLineEntity(
            1L, "union", "line-1", "Northbound / Southbound", 1, true, true
        );

        when(stationRepository.findById("union")).thenReturn(Optional.of(union));
        when(stationLineRepository.findByStationIdOrderBySortOrderAsc("union")).thenReturn(List.of(stationLine));
        when(transitLineRepository.findAllById(List.of("line-1"))).thenReturn(List.of(line));
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        when(liveReadRepository.findActiveOutagesByStationId("union")).thenReturn(List.of(
            new StationLiveReadRepository.FacilityOutage(
                "outage-union-elevator",
                "elevator",
                "Elevator outage",
                "Elevator is unavailable.",
                "Technical issue",
                updatedAt
            )
        ));
        when(liveReadRepository.findActiveAlertsByStationId("union")).thenReturn(List.of(
            new StationLiveReadRepository.LinkedAlert(
                "ttc-route-union",
                "active-alert",
                "delay",
                "Station delay",
                "Trains are delayed at Union.",
                updatedAt,
                "GTFS-RT"
            )
        ));
        when(arrivalService.arrivalsFor(any(), any())).thenReturn(List.of(
            new ArrivalPrediction("line-1", "Northbound", 2, OffsetDateTime.now(), "Demo estimates", "demo", "2 min")
        ));

        StationResponses.StationDetailResponse response = stationService.stationDetail("union");

        assertThat(response.access().status()).isEqualTo("outage");
        assertThat(response.access().outages()).hasSize(1);
        assertThat(response.access().outages().getFirst().source()).isEqualTo("TTC Live Alerts");
        assertThat(response.impacts()).extracting(StationResponses.StationImpactResponse::id)
            .containsExactly("ttc-route-union");
        assertThat(response.impacts().getFirst().updatedAt()).isEqualTo(updatedAt);
        assertThat(response.impacts().getFirst().source()).isEqualTo("TTC GTFS-RT");
    }

    @Test
    void freshStationDetailDeduplicatesEquivalentLivePlannedClosures() {
        OffsetDateTime newerUpdatedAt = OffsetDateTime.parse("2026-06-02T14:12:00-04:00");
        OffsetDateTime olderUpdatedAt = OffsetDateTime.parse("2026-06-02T14:10:00-04:00");
        StationEntity union = new StationEntity("union", "Union", 4311, 3597, true, 10, null);
        TransitLineEntity line = new TransitLineEntity("line-1", "1", "Yonge-University", "#F8C300", 1);
        StationLineEntity stationLine = new StationLineEntity(
            1L, "union", "line-1", "Northbound / Southbound", 1, true, true
        );

        when(stationRepository.findById("union")).thenReturn(Optional.of(union));
        when(stationLineRepository.findByStationIdOrderBySortOrderAsc("union")).thenReturn(List.of(stationLine));
        when(transitLineRepository.findAllById(List.of("line-1"))).thenReturn(List.of(line));
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        when(liveReadRepository.findActiveOutagesByStationId("union")).thenReturn(List.of());
        when(liveReadRepository.findActiveAlertsByStationId("union")).thenReturn(List.of(
            new StationLiveReadRepository.LinkedAlert(
                "ttc-route-closure-newer",
                "planned-closure",
                "planned",
                "No subway service between St George and Sheppard West",
                "There will be no subway service between St George and Sheppard West due to planned track work.",
                newerUpdatedAt
            ),
            new StationLiveReadRepository.LinkedAlert(
                "ttc-route-closure-older",
                "planned-closure",
                "planned",
                "No subway service between St George and Sheppard West",
                "There will be no subway service between St George and Sheppard West due to planned track work.",
                olderUpdatedAt
            )
        ));
        when(alertDashboardService.dashboardVisiblePlannedClosureIds()).thenReturn(Set.of("ttc-route-closure-newer"));
        when(arrivalService.arrivalsFor(any(), any())).thenReturn(List.of(
            ArrivalPrediction.scheduled("line-1", "Northbound to Finch", 3, OffsetDateTime.now(), "TTC scheduled service")
        ));

        StationResponses.StationDetailResponse response = stationService.stationDetail("union");

        assertThat(response.impacts()).extracting(StationResponses.StationImpactResponse::id)
            .containsExactly("ttc-route-closure-newer");
        assertThat(response.arrivalContext().scheduleMayBeDisrupted()).isTrue();
        assertThat(response.arrivalContext().reason()).isEqualTo("No subway service between St George and Sheppard West");
    }

    @Test
    void freshStationDetailSuppressesOlderPlannedClosureVariantForSameStation() {
        OffsetDateTime newerUpdatedAt = OffsetDateTime.parse("2026-06-05T18:49:00-04:00");
        OffsetDateTime olderUpdatedAt = OffsetDateTime.parse("2026-06-01T13:51:00-04:00");
        StationEntity cedarvale = new StationEntity("cedarvale", "Cedarvale", 2936, 1810, true, 40, null);
        TransitLineEntity line = new TransitLineEntity("line-1", "1", "Yonge-University", "#F8C300", 1);
        StationLineEntity stationLine = new StationLineEntity(
            1L, "cedarvale", "line-1", "Northbound / Southbound", 1, true, true
        );

        when(stationRepository.findById("cedarvale")).thenReturn(Optional.of(cedarvale));
        when(stationLineRepository.findByStationIdOrderBySortOrderAsc("cedarvale")).thenReturn(List.of(stationLine));
        when(transitLineRepository.findAllById(List.of("line-1"))).thenReturn(List.of(line));
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        when(liveReadRepository.findActiveOutagesByStationId("cedarvale")).thenReturn(List.of());
        when(liveReadRepository.findActiveAlertsByStationId("cedarvale")).thenReturn(List.of(
            new StationLiveReadRepository.LinkedAlert(
                "ttc-route-closure-visible",
                "planned-closure",
                "planned",
                "There will be no subway service between St George and Sheppard West stations, starting at 12",
                "Synthetic scenario: no subway service between St George and Sheppard West for a test closure.",
                newerUpdatedAt
            ),
            new StationLiveReadRepository.LinkedAlert(
                "ttc-route-closure-older",
                "planned-closure",
                "planned",
                "There will be no subway service between St George and Sheppard West stations, starting 11",
                "Synthetic scenario: no subway service between St George and Sheppard West for a test closure.",
                olderUpdatedAt
            )
        ));
        when(alertDashboardService.dashboardVisiblePlannedClosureIds()).thenReturn(Set.of("ttc-route-closure-visible"));
        when(arrivalService.arrivalsFor(any(), any())).thenReturn(List.of(
            ArrivalPrediction.scheduled("line-1", "Northbound to Vaughan Metropolitan Centre", 4, OffsetDateTime.now(), "TTC scheduled service")
        ));

        StationResponses.StationDetailResponse response = stationService.stationDetail("cedarvale");

        assertThat(response.impacts()).extracting(StationResponses.StationImpactResponse::id)
            .containsExactly("ttc-route-closure-visible");
        assertThat(response.arrivalContext().scheduleMayBeDisrupted()).isTrue();
        assertThat(response.arrivalContext().reason())
            .isEqualTo("There will be no subway service between St George and Sheppard West stations, starting at 12");
    }

    @Test
    void freshStationSummariesUseLinkedOutageAndAlertStationIds() {
        StationEntity union = new StationEntity("union", "Union", 4311, 3597, true, 10, null);
        StationLineEntity stationLine = new StationLineEntity(
            1L, "union", "line-1", "Northbound / Southbound", 1, true, true
        );

        when(stationRepository.findAllByOrderBySortOrderAscNameAsc()).thenReturn(List.of(union));
        when(stationLineRepository.findAllByOrderByStationIdAscSortOrderAsc()).thenReturn(List.of(stationLine));
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        when(liveReadRepository.findActiveOutageCountsByStationId()).thenReturn(List.of(
            new StationLiveReadRepository.FacilityOutageCount("union", "elevator", 2),
            new StationLiveReadRepository.FacilityOutageCount("union", "escalator", 1)
        ));
        when(liveReadRepository.findStationIdsWithActiveAlerts()).thenReturn(Set.of("union"));

        StationResponses.StationSummaryResponse summary =
            stationService.stationSummaries().stations().getFirst();

        assertThat(summary.accessStatus()).isEqualTo("outage");
        assertThat(summary.accessOutageCounts().elevator()).isEqualTo(2);
        assertThat(summary.accessOutageCounts().escalator()).isEqualTo(1);
        assertThat(summary.hasActiveImpact()).isTrue();
    }

    @Test
    void staleStationDetailUsesFixtureFallbackWithoutReadingLiveRows() {
        StationEntity union = new StationEntity("union", "Union", 4311, 3597, true, 10, null);
        TransitLineEntity line = new TransitLineEntity("line-1", "1", "Yonge-University", "#F8C300", 1);
        StationLineEntity stationLine = new StationLineEntity(
            1L, "union", "line-1", "Northbound / Southbound", 1, true, true
        );
        StationAccessStatusEntity access = new StationAccessStatusEntity(
            "union",
            "advisory",
            "Fixture elevator advisory.",
            "Fixture seed"
        );

        when(stationRepository.findById("union")).thenReturn(Optional.of(union));
        when(stationLineRepository.findByStationIdOrderBySortOrderAsc("union")).thenReturn(List.of(stationLine));
        when(transitLineRepository.findAllById(List.of("line-1"))).thenReturn(List.of(line));
        when(ingestionFreshness.isDashboardFresh()).thenReturn(false);
        when(accessStatusRepository.findById("union")).thenReturn(Optional.of(access));
        when(impactRepository.findByStationIdOrderBySortOrderAsc("union")).thenReturn(List.of());
        when(arrivalService.arrivalsFor(any(), any())).thenReturn(List.of(
            new ArrivalPrediction("line-1", "Northbound", 2, OffsetDateTime.now(), "Demo estimates", "demo", "2 min")
        ));

        StationResponses.StationDetailResponse response = stationService.stationDetail("union");

        assertThat(response.access().status()).isEqualTo("advisory");
        assertThat(response.access().outages()).isEmpty();
        assertThat(response.impacts()).isEmpty();
        verifyNoInteractions(liveReadRepository);
    }

    @Test
    void stationDetailMarksArrivalsDisruptedWhenServiceImpactExists() {
        StationEntity union = new StationEntity("union", "Union", 4311, 3597, true, 10, null);
        TransitLineEntity line = new TransitLineEntity("line-1", "1", "Yonge-University", "#F8C300", 1);
        StationLineEntity stationLine = new StationLineEntity(
            1L, "union", "line-1", "Northbound / Southbound", 1, true, true
        );
        StationAccessStatusEntity access = new StationAccessStatusEntity(
            "union",
            "normal",
            "No station access advisories in demo data.",
            "Fixture seed"
        );
        StationImpactEntity impact = new StationImpactEntity(
            "union-delay",
            "union",
            "active-alert",
            "delay",
            "Line 1 delay",
            "Longer travel times near Union.",
            "TTC Live Alerts",
            "TTC Live Alerts",
            1
        );

        when(stationRepository.findById("union")).thenReturn(Optional.of(union));
        when(stationLineRepository.findByStationIdOrderBySortOrderAsc("union")).thenReturn(List.of(stationLine));
        when(transitLineRepository.findAllById(List.of("line-1"))).thenReturn(List.of(line));
        when(accessStatusRepository.findById("union")).thenReturn(Optional.of(access));
        when(arrivalService.arrivalsFor(any(), any())).thenReturn(List.of(
            ArrivalPrediction.scheduled("line-1", "Northbound to Finch", 3, OffsetDateTime.now(), "TTC scheduled service")
        ));
        when(ingestionFreshness.isDashboardFresh()).thenReturn(false);
        when(impactRepository.findByStationIdOrderBySortOrderAsc("union")).thenReturn(List.of(impact));

        StationResponses.StationDetailResponse response = stationService.stationDetail("union");

        assertThat(response.arrivalContext().scheduleMayBeDisrupted()).isTrue();
        assertThat(response.arrivalContext().message()).isEqualTo("Schedule may be disrupted");
        assertThat(response.arrivalContext().reason()).contains("Line 1 delay");
        assertThat(response.arrivalContext().severity()).isEqualTo("delay");
    }

    @Test
    void stationDetailDoesNotMarkArrivalsDisruptedForAccessibilityOutageOnly() {
        StationEntity union = new StationEntity("union", "Union", 4311, 3597, true, 10, null);
        TransitLineEntity line = new TransitLineEntity("line-1", "1", "Yonge-University", "#F8C300", 1);
        StationLineEntity stationLine = new StationLineEntity(
            1L, "union", "line-1", "Northbound / Southbound", 1, true, true
        );

        when(stationRepository.findById("union")).thenReturn(Optional.of(union));
        when(stationLineRepository.findByStationIdOrderBySortOrderAsc("union")).thenReturn(List.of(stationLine));
        when(transitLineRepository.findAllById(List.of("line-1"))).thenReturn(List.of(line));
        when(arrivalService.arrivalsFor(any(), any())).thenReturn(List.of(
            ArrivalPrediction.scheduled("line-1", "Northbound to Finch", 3, OffsetDateTime.now(), "TTC scheduled service")
        ));
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        when(liveReadRepository.findActiveAlertsByStationId("union")).thenReturn(List.of());
        when(liveReadRepository.findActiveOutagesByStationId("union")).thenReturn(List.of(
            new StationLiveReadRepository.FacilityOutage(
                "outage-1",
                "elevator",
                "Elevator outage",
                "Elevator unavailable.",
                "Mechanical",
                OffsetDateTime.now()
            )
        ));

        StationResponses.StationDetailResponse response = stationService.stationDetail("union");

        assertThat(response.arrivalContext().scheduleMayBeDisrupted()).isFalse();
        assertThat(response.arrivalContext().message()).isEqualTo("Schedule active");
        assertThat(response.disclaimer()).isEqualTo("Scheduled arrivals use TTC timetable data and are not live train predictions.");
        assertThat(response.disclaimer()).doesNotContain("seeded backend data");
        assertThat(response.disclaimer()).doesNotContain("demo placeholders");
    }

    @Test
    void stationDetailReportsMixedLiveAndScheduledArrivalSources() {
        OffsetDateTime now = OffsetDateTime.parse("2026-07-02T10:25:46Z");
        StationEntity finchWest = new StationEntity("finch-west", "Finch West", 2587, 1560, true, 20, null);
        TransitLineEntity line1 = new TransitLineEntity("line-1", "1", "Yonge-University", "#F8C300", 1);
        TransitLineEntity line6 = new TransitLineEntity("line-6", "6", "Finch West", "#D9261C", 6);
        StationLineEntity stationLine1 = new StationLineEntity(
            1L, "finch-west", "line-1", "Northbound / Southbound", 1, true, true
        );
        StationLineEntity stationLine6 = new StationLineEntity(
            2L, "finch-west", "line-6", "Eastbound / Westbound", 2, true, true
        );

        when(stationRepository.findById("finch-west")).thenReturn(Optional.of(finchWest));
        when(stationLineRepository.findByStationIdOrderBySortOrderAsc("finch-west"))
            .thenReturn(List.of(stationLine1, stationLine6));
        when(transitLineRepository.findAllById(List.of("line-1", "line-6"))).thenReturn(List.of(line1, line6));
        when(accessStatusRepository.findById("finch-west")).thenReturn(Optional.empty());
        when(impactRepository.findByStationIdOrderBySortOrderAsc("finch-west")).thenReturn(List.of());
        when(arrivalService.arrivalsFor(any(), any())).thenReturn(List.of(
            ArrivalPrediction.live(
                "line-1",
                "Northbound",
                3,
                now.plusMinutes(3),
                "TTC GTFS-RT subway trip updates"
            ),
            ArrivalPrediction.scheduled(
                "line-6",
                "Eastbound to Finch West",
                8,
                now.plusMinutes(8),
                "TTC scheduled service"
            )
        ));

        StationResponses.StationDetailResponse response = stationService.stationDetail("finch-west");

        assertThat(response.arrivalsSource()).isEqualTo("TTC GTFS-RT subway trip updates / TTC scheduled service");
        assertThat(response.disclaimer()).isEqualTo("Arrival predictions are source-labeled and may be affected by active TTC service alerts.");
    }
}
