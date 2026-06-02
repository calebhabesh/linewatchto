package com.calebhabesh.linewatch.station;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

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
        assertThat(summary.hasActiveImpact()).isTrue();
    }

    @Test
    void stationDetailIncludesLinesAccessImpactsArrivalsAndDisclaimer() {
        StationEntity union = new StationEntity("union", "Union", 4311, 3597, true, 10, null);
        TransitLineEntity line = new TransitLineEntity("line-1", "1", "Yonge-University", "#f4c430", 1);
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

        StationResponses.StationDetailResponse response = stationService.stationDetail("union");

        assertThat(response.id()).isEqualTo("union");
        assertThat(response.lines()).extracting(StationResponses.StationLineResponse::id).containsExactly("line-1");
        assertThat(response.lines().getFirst().wheelchairAccessible()).isTrue();
        assertThat(response.lines().getFirst().hasElevator()).isTrue();
        assertThat(response.access().status()).isEqualTo("normal");
        assertThat(response.impacts()).extracting(StationResponses.StationImpactResponse::id).containsExactly("impact-union-weekend");
        assertThat(response.arrivals()).isNotEmpty();
        assertThat(response.arrivals().getFirst().label()).isEqualTo("Demo arrival");
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
        TransitLineEntity line = new TransitLineEntity("line-1", "1", "Yonge-University", "#f4c430", 1);
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
                updatedAt
            )
        ));

        StationResponses.StationDetailResponse response = stationService.stationDetail("union");

        assertThat(response.access().status()).isEqualTo("outage");
        assertThat(response.access().outages()).hasSize(1);
        assertThat(response.access().outages().getFirst().source()).isEqualTo("TTC Live Alerts");
        assertThat(response.impacts()).extracting(StationResponses.StationImpactResponse::id)
            .containsExactly("ttc-route-union");
        assertThat(response.impacts().getFirst().updatedAt()).isEqualTo(updatedAt);
        assertThat(response.impacts().getFirst().source()).isEqualTo("TTC Live Alerts");
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
        when(liveReadRepository.findStationIdsWithActiveOutages()).thenReturn(Set.of("union"));
        when(liveReadRepository.findStationIdsWithActiveAlerts()).thenReturn(Set.of("union"));

        StationResponses.StationSummaryResponse summary =
            stationService.stationSummaries().stations().getFirst();

        assertThat(summary.accessStatus()).isEqualTo("outage");
        assertThat(summary.hasActiveImpact()).isTrue();
    }

    @Test
    void staleStationDetailUsesFixtureFallbackWithoutReadingLiveRows() {
        StationEntity union = new StationEntity("union", "Union", 4311, 3597, true, 10, null);
        TransitLineEntity line = new TransitLineEntity("line-1", "1", "Yonge-University", "#f4c430", 1);
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

        StationResponses.StationDetailResponse response = stationService.stationDetail("union");

        assertThat(response.access().status()).isEqualTo("advisory");
        assertThat(response.access().outages()).isEmpty();
        assertThat(response.impacts()).isEmpty();
        verifyNoInteractions(liveReadRepository);
    }
}
