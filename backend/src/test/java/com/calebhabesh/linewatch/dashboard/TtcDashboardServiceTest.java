package com.calebhabesh.linewatch.dashboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.ingestion.AlertIngestionProperties;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.map.MapController;
import com.calebhabesh.linewatch.performance.TtcPerformanceResponses;
import com.calebhabesh.linewatch.status.StatusController;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class TtcDashboardServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-06-01T12:00:00Z"), ZoneOffset.UTC);

    private final AlertDashboardService alertDashboardService = mock(AlertDashboardService.class);
    private final IngestionRunStore ingestionRunStore = mock(IngestionRunStore.class);
    private final IngestionFreshness ingestionFreshness = new IngestionFreshness(
        ingestionRunStore,
        new AlertIngestionProperties(),
        CLOCK
    );

    @Test
    void buildsTtcDashboardResponseFromSubservices() {
        MapController.MapResponse map = new MapController.MapResponse(List.of(), List.of(), List.of());
        StatusController.StatusResponse status = new StatusController.StatusResponse(
            new StatusController.GeneratedAtDto("8:00 AM", "Jun 1, 2026", true, "succeeded 1 min ago"),
            List.of()
        );
        TtcPerformanceResponses.SnapshotResponse performance = new TtcPerformanceResponses.SnapshotResponse(
            "available", "TTC.ca", "https://www.ttc.ca/", "On-time performance", "June 1, 2026",
            OffsetDateTime.parse("2026-06-01T12:00:00Z"), false, "Performance loaded", List.of()
        );

        when(alertDashboardService.activeAlerts()).thenReturn(List.of());
        when(alertDashboardService.delays()).thenReturn(List.of());
        when(alertDashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(alertDashboardService.plannedClosures()).thenReturn(List.of());

        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:59:00Z");
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
            1L, "success", completedAt.minusSeconds(2), completedAt, 5, 5, 0, 0, completedAt, null
        )));

        TtcDashboardService service = new TtcDashboardService(
            () -> map,
            () -> status,
            alertDashboardService,
            () -> performance,
            ingestionFreshness,
            ingestionRunStore
        );

        DashboardResponses.DashboardResponse response = service.dashboard();

        assertThat(response.networkId()).isEqualTo("ttc");
        assertThat(response.availability()).isEqualTo("available");
        assertThat(response.sourceSystems()).containsExactly("ttc-live-alerts", "ttc-scheduled-service");
        assertThat(response.message()).contains("Fresh TTC dashboard data loaded");
        assertThat(response.map()).isSameAs(map);
        assertThat(response.status()).isSameAs(status);
        assertThat(response.performance()).isSameAs(performance);
        assertThat(response.activeAlerts()).isEmpty();
        assertThat(response.delays()).isEmpty();
        assertThat(response.reducedSpeedZones()).isEmpty();
        assertThat(response.plannedClosures()).isEmpty();
    }

    @Test
    void marksDegradedWhenLiveButLatestRunFailed() {
        StatusController.StatusResponse status = new StatusController.StatusResponse(
            new StatusController.GeneratedAtDto("8:00 AM", "Jun 1, 2026", true, "failed"),
            List.of()
        );

        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
            2L, "failed", OffsetDateTime.now(CLOCK).minusMinutes(1), OffsetDateTime.now(CLOCK),
            0, 0, 0, 0, null, "timeout"
        )));

        TtcDashboardService service = new TtcDashboardService(
            () -> new MapController.MapResponse(List.of(), List.of(), List.of()),
            () -> status,
            alertDashboardService,
            () -> null,
            ingestionFreshness,
            ingestionRunStore
        );

        DashboardResponses.DashboardResponse response = service.dashboard();

        assertThat(response.availability()).isEqualTo("degraded");
        assertThat(response.message()).contains("The latest TTC refresh failed; LineWatchTO is retaining the last successful fresh snapshot.");
    }

    @Test
    void marksUnavailableWhenNotLive() {
        StatusController.StatusResponse status = new StatusController.StatusResponse(
            new StatusController.GeneratedAtDto("8:00 AM", "Jun 1, 2026", false, "not run"),
            List.of()
        );

        TtcDashboardService service = new TtcDashboardService(
            () -> new MapController.MapResponse(List.of(), List.of(), List.of()),
            () -> status,
            alertDashboardService,
            () -> null,
            ingestionFreshness,
            ingestionRunStore
        );

        DashboardResponses.DashboardResponse response = service.dashboard();

        assertThat(response.availability()).isEqualTo("unavailable");
        assertThat(response.message()).contains("TTC service-alert data is unavailable");
    }

    @Test
    void calculatesRemainingFreshnessCorrectly() {
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:50:30Z");
        when(ingestionRunStore.findLatestSuccessful()).thenReturn(Optional.of(new IngestionRunSnapshot(
            42L, "success", completedAt.minusSeconds(1), completedAt, 10, 10, 5, 0, completedAt, null
        )));

        TtcDashboardService service = new TtcDashboardService(
            () -> null,
            () -> null,
            alertDashboardService,
            () -> null,
            ingestionFreshness,
            ingestionRunStore
        );

        Optional<Duration> freshness = service.remainingFreshness();
        assertThat(freshness).isPresent();
        assertThat(freshness.get()).isEqualTo(Duration.ofSeconds(30));
    }

    @Test
    void constructorRejectsNullArguments() {
        assertThatThrownBy(() -> new TtcDashboardService(
            null, () -> null, alertDashboardService, () -> null, ingestionFreshness, ingestionRunStore
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new TtcDashboardService(
            () -> null, null, alertDashboardService, () -> null, ingestionFreshness, ingestionRunStore
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new TtcDashboardService(
            () -> null, () -> null, null, () -> null, ingestionFreshness, ingestionRunStore
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new TtcDashboardService(
            () -> null, () -> null, alertDashboardService, null, ingestionFreshness, ingestionRunStore
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new TtcDashboardService(
            () -> null, () -> null, alertDashboardService, () -> null, null, ingestionRunStore
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new TtcDashboardService(
            () -> null, () -> null, alertDashboardService, () -> null, ingestionFreshness, null
        )).isInstanceOf(NullPointerException.class);
    }
}
