package com.calebhabesh.linewatch.health;

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
import com.fasterxml.jackson.databind.ObjectMapper;

class RegionalIngestionHealthControllerTest {
    @Test
    void reportsRequiredAndSupplementalCollectionCoverageForTheLatestRun() {
        MetrolinxProperties properties = new MetrolinxProperties();
        properties.setEnabled(true);
        properties.setApiKey("configured");
        RegionalIngestionRunStore runStore = mock(RegionalIngestionRunStore.class);
        RegionalIngestionFreshness freshness = mock(RegionalIngestionFreshness.class);
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
            new RegionalIngestionHealthController(properties, runStore, freshness).health();

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
    }

    @Test
    void publicResponseDoesNotSerializePersistedFailureDetails() throws Exception {
        MetrolinxProperties properties = new MetrolinxProperties();
        RegionalIngestionRunStore runStore = mock(RegionalIngestionRunStore.class);
        RegionalIngestionFreshness freshness = mock(RegionalIngestionFreshness.class);
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-07-30T12:00:00-04:00");
        IngestionRunSnapshot run = new IngestionRunSnapshot(
            42, "failed", completedAt.minusSeconds(2), completedAt, 0, 0, 0, 0, null,
            "request to internal-upstream-host failed"
        );
        when(runStore.findLatest()).thenReturn(Optional.of(run));
        when(runStore.findSourceStatuses(42)).thenReturn(List.of());

        String json = new ObjectMapper().findAndRegisterModules().writeValueAsString(
            new RegionalIngestionHealthController(properties, runStore, freshness).health()
        );

        assertThat(json).doesNotContain("errorMessage", "internal-upstream-host");
    }
}
