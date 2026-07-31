package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.dashboard.DashboardResponses;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RegionalDashboardServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-28T18:15:00Z"), ZoneOffset.UTC);
    private final RegionalAlertStore alertStore = mock(RegionalAlertStore.class);
    private final RegionalIngestionRunStore runStore = mock(RegionalIngestionRunStore.class);
    private final RegionalIngestionFreshness freshness = mock(RegionalIngestionFreshness.class);
    private final MetrolinxProperties properties = new MetrolinxProperties();
    private RegionalDashboardService service;

    @BeforeEach
    void setUp() {
        properties.setEnabled(true);
        properties.setApiKey("configured-test-key");
        service = new RegionalDashboardService(alertStore, runStore, freshness, properties, CLOCK);
        when(runStore.findLatest()).thenReturn(Optional.of(successfulRun()));
    }

    @Test
    void exposesFreshRegionalAlertsStatusesAndReviewedMapImpacts() {
        when(freshness.remainingFreshness(any())).thenReturn(Optional.of(Duration.ofMinutes(5)));
        when(alertStore.findActiveAlerts()).thenReturn(List.of(new RegionalNormalizedAlert(
            "regional-go-M1-ki", MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M1", "regional-ki", "delay",
            "Kitchener line service adjustment", "Trips are operating later than usual.", "Modified Trip",
            OffsetDateTime.parse("2026-07-28T09:01:00-04:00"), null,
            OffsetDateTime.parse("2026-07-28T14:12:32-04:00"),
            List.of("bloor", "weston", "mount-dennis"),
            List.of("segment-ki-bloor-mount-dennis", "segment-ki-mount-dennis-weston"), ""
        )));

        DashboardResponses.DashboardResponse dashboard = service.dashboard();

        assertThat(dashboard.availability()).isEqualTo("available");
        assertThat(dashboard.status().generatedAt().live()).isTrue();
        assertThat(dashboard.delays()).singleElement().satisfies(delay -> {
            assertThat(delay.lineNumber()).isEqualTo("KI");
            assertThat(delay.location()).isEqualTo("Bloor ↔ Weston");
            assertThat(delay.source()).isEqualTo("Metrolinx Open API");
        });
        assertThat(dashboard.status().lines()).filteredOn(line -> line.number().equals("KI"))
            .singleElement().extracting(line -> line.status()).isEqualTo("delay");
        assertThat(dashboard.map().segments()).filteredOn(segment -> segment.id().equals("segment-ki-bloor-mount-dennis"))
            .singleElement().satisfies(segment -> {
                assertThat(segment.overlay()).isEqualTo("delay");
                assertThat(segment.impacts()).singleElement().satisfies(impact -> {
                    assertThat(impact.cardId()).isEqualTo("regional-go-M1-ki");
                    assertThat(impact.travelDirection()).isEqualTo("bidirectional");
                });
            });
        assertThat(dashboard.map().segments()).hasSize(74);
    }

    @Test
    void exposesPlannedSegmentPreviewsAndKeepsStationOnlyImpactsOffTheCorridor() {
        when(freshness.remainingFreshness(any())).thenReturn(Optional.of(Duration.ofMinutes(5)));
        when(alertStore.findActiveAlerts()).thenReturn(List.of(
            new RegionalNormalizedAlert(
                "regional-go-planned-le", MetrolinxSourceSystem.GO_SERVICE_ALERTS, "P1", "regional-le",
                "planned-closure", "Planned track work", "Service changes are planned.", "Construction",
                OffsetDateTime.parse("2026-07-29T22:00:00-04:00"),
                OffsetDateTime.parse("2026-07-30T05:00:00-04:00"),
                OffsetDateTime.parse("2026-07-29T14:00:00-04:00"),
                List.of("pickering", "ajax"), List.of("segment-le-pickering-ajax"), ""
            ),
            new RegionalNormalizedAlert(
                "regional-go-station-ki", MetrolinxSourceSystem.GO_SERVICE_ALERTS, "S1", "regional-ki",
                "suspension", "Bloor station service suspension", "Trains are bypassing Bloor GO.", "Emergency",
                OffsetDateTime.parse("2026-07-29T14:05:00-04:00"), null,
                OffsetDateTime.parse("2026-07-29T14:08:00-04:00"),
                List.of("bloor"), List.of(), ""
            )
        ));

        DashboardResponses.DashboardResponse dashboard = service.dashboard();

        assertThat(dashboard.map().segments())
            .filteredOn(segment -> segment.id().equals("segment-le-pickering-ajax"))
            .singleElement()
            .satisfies(segment -> assertThat(segment.impacts())
                .singleElement()
                .satisfies(impact -> assertThat(impact.kind()).isEqualTo("planned-closure")));
        assertThat(dashboard.map().stationNodeImpacts())
            .singleElement()
            .satisfies(impact -> {
                assertThat(impact.stationId()).isEqualTo("bloor");
                assertThat(impact.cardId()).isEqualTo("regional-go-station-ki");
            });
        assertThat(dashboard.map().segments())
            .noneSatisfy(segment -> assertThat(segment.impacts())
                .extracting(impact -> impact.cardId())
                .contains("regional-go-station-ki"));
    }

    @Test
    void suppressesPersistedImpactsWhenTheLatestRegionalRunIsStale() {
        when(freshness.remainingFreshness(any())).thenReturn(Optional.empty());

        DashboardResponses.DashboardResponse dashboard = service.dashboard();

        assertThat(dashboard.availability()).isEqualTo("unavailable");
        assertThat(dashboard.status().generatedAt().live()).isFalse();
        assertThat(dashboard.delays()).isEmpty();
        assertThat(dashboard.map().segments()).allSatisfy(segment -> assertThat(segment.overlay()).isEqualTo("clear"));
    }

    private IngestionRunSnapshot successfulRun() {
        OffsetDateTime completed = OffsetDateTime.parse("2026-07-28T18:12:33Z");
        return new IngestionRunSnapshot(
            7L, "success", completed.minusSeconds(1), completed, 12, 12, 1, 11,
            OffsetDateTime.parse("2026-07-28T18:12:32Z"), null
        );
    }
}
