package com.calebhabesh.linewatch.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.ingestion.AlertIngestionProperties;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import static org.mockito.ArgumentMatchers.any;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;

class IngestionHealthControllerTest {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-06-01T12:00:00Z"),
        ZoneOffset.UTC
    );

    private final IngestionRunStore store = mock(IngestionRunStore.class);
    private final IngestionFreshness freshness = new IngestionFreshness(
        store,
        new AlertIngestionProperties(),
        CLOCK
    );
    private final DashboardCacheService cache = mock(DashboardCacheService.class);
    private final DashboardCacheProperties cacheProperties = new DashboardCacheProperties();
    private final AlertIngestionProperties ingestionProperties = new AlertIngestionProperties();
    private final TtcFeedAvailabilityService availabilityService = mock(TtcFeedAvailabilityService.class);
    private final IngestionHealthController controller = new IngestionHealthController(
        store, freshness, cache, cacheProperties, ingestionProperties, availabilityService
    );

    @BeforeEach
    void setUp() {
        when(cache.getOrCompute(any(), any(), any(), any())).thenAnswer(invocation -> {
            java.util.function.Supplier<?> supplier = invocation.getArgument(3);
            return supplier.get();
        });
        when(availabilityService.summarize()).thenReturn(new TtcFeedAvailabilityService.TtcFeedAvailability(
            30, 99.8, 98.4, 998, 2, 1000,
            java.time.LocalDate.parse("2026-05-03"), java.util.List.of()
        ));
    }

    @Test
    void returnsNotRunStateBeforeFirstPoll() {
        when(store.findLatest()).thenReturn(Optional.empty());

        IngestionHealthController.IngestionHealthResponse response = controller.ingestion();

        assertThat(response.status()).isEqualTo("not-run");
        assertThat(response.dashboardLive()).isFalse();
        assertThat(response.feedAvailability().availabilityPercentage()).isEqualTo(99.8);
        assertThat(response.sourceEndpoint()).isEqualTo("https://alerts.ttc.ca/api/alerts/live-alerts");
    }

    @Test
    void reportsDashboardLiveAfterSuccessfulRun() {
        OffsetDateTime started = OffsetDateTime.parse("2026-06-01T11:58:00Z");
        IngestionRunSnapshot successful = new IngestionRunSnapshot(
            42L, "success", started, started.plusSeconds(2),
            44, 44, 12, 3, started.minusMinutes(1), null, true, 1
        );
        when(store.findLatest()).thenReturn(Optional.of(successful));
        when(store.findLatestSuccessful()).thenReturn(Optional.of(successful));

        IngestionHealthController.IngestionHealthResponse response = controller.ingestion();

        assertThat(response.status()).isEqualTo("success");
        assertThat(response.recordsFetched()).isEqualTo(44);
        assertThat(response.recordsNormalized()).isEqualTo(12);
        assertThat(response.dashboardLive()).isTrue();
        assertThat(response.subwayClosureSupplementEnabled()).isTrue();
        assertThat(response.subwayClosureSupplementAvailable()).isTrue();
        assertThat(response.subwayClosureRecordsFetched()).isEqualTo(1);
    }

    @Test
    void reportsDashboardNotLiveWhenSuccessfulRunIsStale() {
        OffsetDateTime started = OffsetDateTime.parse("2026-06-01T11:00:00Z");
        IngestionRunSnapshot successful = new IngestionRunSnapshot(
            42L, "success", started, started.plusSeconds(2),
            44, 44, 12, 3, started.minusMinutes(1), null
        );
        when(store.findLatest()).thenReturn(Optional.of(successful));
        when(store.findLatestSuccessful()).thenReturn(Optional.of(successful));

        IngestionHealthController.IngestionHealthResponse response = controller.ingestion();

        assertThat(response.status()).isEqualTo("success");
        assertThat(response.dashboardLive()).isFalse();
    }

    @Test
    void reportsFailedAttemptWhileLastSuccessfulSnapshotRemainsLive() {
        OffsetDateTime successfulAt = OffsetDateTime.parse("2026-06-01T11:58:00Z");
        IngestionRunSnapshot successful = new IngestionRunSnapshot(
            41L, "success", successfulAt.minusSeconds(2), successfulAt,
            44, 44, 12, 3, successfulAt.minusMinutes(1), null
        );
        IngestionRunSnapshot failed = new IngestionRunSnapshot(
            42L, "failed", successfulAt.plusMinutes(1), successfulAt.plusMinutes(1).plusSeconds(8),
            0, 0, 0, 0, null, "timeout"
        );
        when(store.findLatest()).thenReturn(Optional.of(failed));
        when(store.findLatestSuccessful()).thenReturn(Optional.of(successful));

        IngestionHealthController.IngestionHealthResponse response = controller.ingestion();

        assertThat(response.status()).isEqualTo("failed");
        assertThat(response.dashboardLive()).isTrue();
    }

    @Test
    void publicResponseDoesNotSerializePersistedFailureDetails() throws Exception {
        OffsetDateTime started = OffsetDateTime.parse("2026-06-01T11:58:00Z");
        when(store.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
            42L, "failed", started, started.plusSeconds(2),
            0, 0, 0, 0, null, "jdbc:postgresql://internal-host/linewatch failed"
        )));

        String json = new ObjectMapper().findAndRegisterModules().writeValueAsString(controller.ingestion());

        assertThat(json).doesNotContain("errorMessage", "internal-host");
    }

    @Test
    void stripsQueriesFromAllowlistedTtcEndpointAndWithholdsOtherHosts() {
        ingestionProperties.setUrl(URI.create(
            "https://alerts.ttc.ca/api/alerts/live-alerts?token=not-public"
        ));
        when(store.findLatest()).thenReturn(Optional.empty());

        assertThat(controller.ingestion().sourceEndpoint())
            .isEqualTo("https://alerts.ttc.ca/api/alerts/live-alerts");

        ingestionProperties.setUrl(URI.create("https://internal.example.test/ttc?token=not-public"));
        assertThat(controller.ingestion().sourceEndpoint()).isNull();
    }
}
