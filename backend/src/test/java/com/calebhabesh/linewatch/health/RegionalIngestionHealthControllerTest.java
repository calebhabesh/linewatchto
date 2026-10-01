package com.calebhabesh.linewatch.health;

import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.regional.MetrolinxProperties;
import com.calebhabesh.linewatch.regional.MetrolinxSourceSystem;
import com.calebhabesh.linewatch.regional.RegionalIngestionFreshness;
import com.calebhabesh.linewatch.regional.RegionalIngestionRunStore;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class RegionalIngestionHealthControllerTest {
    @Test
    void reportsRequiredAndSupplementalCollectionCoverageForTheLatestRun() {
        MetrolinxProperties properties = new MetrolinxProperties();
        properties.setEnabled(true);
        properties.setApiKey("configured");
        RegionalIngestionRunStore runStore = mock(RegionalIngestionRunStore.class);
        RegionalIngestionFreshness freshness = mock(RegionalIngestionFreshness.class);
        RegionalFeedAvailabilityService availabilityService = mock(RegionalFeedAvailabilityService.class);
        when(availabilityService.summarize()).thenReturn(availability());
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-07-30T12:00:00-04:00");
        IngestionRunSnapshot run = new IngestionRunSnapshot(
            42, "success", completedAt.minusSeconds(2), completedAt, 30, 30, 2, 28, completedAt, null
        );
        when(runStore.findLatest()).thenReturn(Optional.of(run));
        when(freshness.isFresh()).thenReturn(true);
        when(runStore.findSourceStatuses(42)).thenReturn(List.of(
            new RegionalIngestionRunStore.SourceStatus(MetrolinxSourceSystem.GO_SERVICE_ALERTS, true, 2, completedAt.minusMinutes(1)),
            new RegionalIngestionRunStore.SourceStatus(MetrolinxSourceSystem.GO_MARKETING_ALERTS, false, 0, null),
            new RegionalIngestionRunStore.SourceStatus(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, true, 3, completedAt.minusSeconds(30)),
            new RegionalIngestionRunStore.SourceStatus(MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES, true, 25, completedAt.minusSeconds(10)),
            new RegionalIngestionRunStore.SourceStatus(MetrolinxSourceSystem.UP_GTFS_ALERTS, true, 0, completedAt.minusSeconds(5))
        ));

        RegionalIngestionHealthController.RegionalIngestionHealthResponse response =
            new RegionalIngestionHealthController(properties, runStore, freshness, availabilityService).health();

        assertThat(response.collections()).hasSize(MetrolinxSourceSystem.descriptors().size());
        assertThat(response.collections())
            .filteredOn(collection -> collection.sourceSystem().equals(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS))
            .singleElement().satisfies(collection -> {
            assertThat(collection.status()).isEqualTo("complete");
            assertThat(collection.required()).isFalse();
            assertThat(collection.kind()).isEqualTo("operational");
            assertThat(collection.recordsFetched()).isEqualTo(3);
            assertThat(collection.sourceUpdatedAt()).isEqualTo(completedAt.minusSeconds(30));
        });
        assertThat(response.collections())
            .filteredOn(collection -> collection.sourceSystem().equals(MetrolinxSourceSystem.GO_MARKETING_ALERTS))
            .singleElement().satisfies(collection -> {
            assertThat(collection.status()).isEqualTo("unavailable");
        });
        assertThat(response.collections())
            .filteredOn(collection -> collection.sourceSystem().equals(MetrolinxSourceSystem.GO_INFORMATION_ALERTS))
            .singleElement().satisfies(collection -> {
            assertThat(collection.status()).isEqualTo("unknown");
        });
        assertThat(response.feedAvailability().availabilityPercentage()).isEqualTo(99.5);
        assertThat(response.sourceEndpoints()).containsExactly(
            "https://api.openmetrolinx.com/OpenDataAPI/api/V1/ServiceUpdate/ServiceAlert/All",
            "https://api.openmetrolinx.com/OpenDataAPI/api/V1/UP/Gtfs/Feed/Alerts"
        );
    }

    @Test
    void publicResponseDoesNotSerializePersistedFailureDetails() throws Exception {
        MetrolinxProperties properties = new MetrolinxProperties();
        RegionalIngestionRunStore runStore = mock(RegionalIngestionRunStore.class);
        RegionalIngestionFreshness freshness = mock(RegionalIngestionFreshness.class);
        RegionalFeedAvailabilityService availabilityService = mock(RegionalFeedAvailabilityService.class);
        when(availabilityService.summarize()).thenReturn(availability());
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-07-30T12:00:00-04:00");
        IngestionRunSnapshot run = new IngestionRunSnapshot(
            42, "failed", completedAt.minusSeconds(2), completedAt, 0, 0, 0, 0, null,
            "request to internal-upstream-host failed"
        );
        when(runStore.findLatest()).thenReturn(Optional.of(run));
        when(runStore.findSourceStatuses(42)).thenReturn(List.of());

        String json = JsonMapper.builder().findAndAddModules().build().writeValueAsString(
            new RegionalIngestionHealthController(properties, runStore, freshness, availabilityService).health()
        );

        assertThat(json).doesNotContain("errorMessage", "internal-upstream-host");
    }

    @Test
    void withholdsNonOfficialMetrolinxEndpointConfiguration() {
        MetrolinxProperties properties = new MetrolinxProperties();
        properties.setBaseUrl(java.net.URI.create("https://internal.example.test/OpenDataAPI/?key=secret"));
        RegionalIngestionRunStore runStore = mock(RegionalIngestionRunStore.class);
        RegionalIngestionFreshness freshness = mock(RegionalIngestionFreshness.class);
        RegionalFeedAvailabilityService availabilityService = mock(RegionalFeedAvailabilityService.class);
        when(runStore.findLatest()).thenReturn(Optional.empty());
        when(availabilityService.summarize()).thenReturn(availability());

        var response = new RegionalIngestionHealthController(
            properties, runStore, freshness, availabilityService
        ).health();

        assertThat(response.sourceEndpoints()).isEmpty();
    }

    private RegionalFeedAvailabilityService.RegionalFeedAvailability availability() {
        return new RegionalFeedAvailabilityService.RegionalFeedAvailability(
            30, 99.5, 98.0, 398, 2, 400,
            java.time.LocalDate.parse("2026-07-01"), List.of()
        );
    }
}
