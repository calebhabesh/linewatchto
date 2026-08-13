package com.calebhabesh.linewatch.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.ingestion.AlertIngestionProperties;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
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
    private final IngestionHealthController controller = new IngestionHealthController(
        store, freshness, cache, cacheProperties
    );

    @BeforeEach
    void setUp() {
        when(cache.getOrCompute(any(), any(), any(), any())).thenAnswer(invocation -> {
            java.util.function.Supplier<?> supplier = invocation.getArgument(3);
            return supplier.get();
        });
    }

    @Test
    void returnsNotRunStateBeforeFirstPoll() {
        when(store.findLatest()).thenReturn(Optional.empty());

        IngestionHealthController.IngestionHealthResponse response = controller.ingestion();

        assertThat(response.status()).isEqualTo("not-run");
        assertThat(response.dashboardLive()).isFalse();
    }

    @Test
    void reportsDashboardLiveAfterSuccessfulRun() {
        OffsetDateTime started = OffsetDateTime.parse("2026-06-01T11:58:00Z");
        when(store.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
            42L, "success", started, started.plusSeconds(2),
            44, 44, 12, 3, started.minusMinutes(1), null
        )));

        IngestionHealthController.IngestionHealthResponse response = controller.ingestion();

        assertThat(response.status()).isEqualTo("success");
        assertThat(response.recordsFetched()).isEqualTo(44);
        assertThat(response.recordsNormalized()).isEqualTo(12);
        assertThat(response.dashboardLive()).isTrue();
    }

    @Test
    void reportsDashboardNotLiveWhenSuccessfulRunIsStale() {
        OffsetDateTime started = OffsetDateTime.parse("2026-06-01T11:00:00Z");
        when(store.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
            42L, "success", started, started.plusSeconds(2),
            44, 44, 12, 3, started.minusMinutes(1), null
        )));

        IngestionHealthController.IngestionHealthResponse response = controller.ingestion();

        assertThat(response.status()).isEqualTo("success");
        assertThat(response.dashboardLive()).isFalse();
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
}
