package com.calebhabesh.linewatch.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleRefreshRunService;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleRefreshRunSnapshot;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;

class ScheduleHealthControllerTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-06-15T14:00:00Z"), ZoneOffset.UTC);

    private final GtfsScheduleReadRepository repository = mock(GtfsScheduleReadRepository.class);
    private final GtfsScheduleRefreshRunService refreshRunService = mock(GtfsScheduleRefreshRunService.class);
    private final ArrivalProperties properties = new ArrivalProperties();
    private final ScheduleHealthController controller = new ScheduleHealthController(
        repository,
        properties,
        refreshRunService,
        CLOCK
    );

    @Test
    void reportsNotImportedWhenNoActiveScheduleExists() {
        when(repository.findActiveImport()).thenReturn(Optional.empty());
        when(refreshRunService.latest()).thenReturn(Optional.empty());

        ScheduleHealthController.ScheduleHealthResponse response = controller.schedule();

        assertThat(response.status()).isEqualTo("not-imported");
        assertThat(response.scheduleActive()).isFalse();
        assertThat(response.serviceDaysRemaining()).isNull();
        assertThat(response.refreshStatus()).isEqualTo("never-run");
    }

    @Test
    void reportsActiveScheduleWithDaysRemaining() {
        properties.setGtfsRefreshMinServiceDaysRemaining(14);
        when(repository.findActiveImport()).thenReturn(Optional.of(activeImport(LocalDate.parse("2026-07-20"))));
        when(refreshRunService.latest()).thenReturn(Optional.of(new GtfsScheduleRefreshRunSnapshot(
            17L,
            "success",
            OffsetDateTime.parse("2026-06-15T10:00:00Z"),
            OffsetDateTime.parse("2026-06-15T10:05:00Z"),
            2500,
            null
        )));

        ScheduleHealthController.ScheduleHealthResponse response = controller.schedule();

        assertThat(response.status()).isEqualTo("active");
        assertThat(response.scheduleActive()).isTrue();
        assertThat(response.serviceDaysRemaining()).isEqualTo(35);
        assertThat(response.serviceEnd()).isEqualTo(LocalDate.parse("2026-07-20"));
        assertThat(response.refreshStatus()).isEqualTo("success");
        assertThat(response.refreshRecordsProcessed()).isEqualTo(2500);
    }

    @Test
    void reportsExpiringScheduleInsideRefreshThreshold() {
        properties.setGtfsRefreshMinServiceDaysRemaining(14);
        when(repository.findActiveImport()).thenReturn(Optional.of(activeImport(LocalDate.parse("2026-06-28"))));
        when(refreshRunService.latest()).thenReturn(Optional.empty());

        ScheduleHealthController.ScheduleHealthResponse response = controller.schedule();

        assertThat(response.status()).isEqualTo("expiring");
        assertThat(response.scheduleActive()).isTrue();
        assertThat(response.serviceDaysRemaining()).isEqualTo(13);
    }

    @Test
    void reportsExpiredSchedule() {
        when(repository.findActiveImport()).thenReturn(Optional.of(activeImport(LocalDate.parse("2026-06-10"))));
        when(refreshRunService.latest()).thenReturn(Optional.empty());

        ScheduleHealthController.ScheduleHealthResponse response = controller.schedule();

        assertThat(response.status()).isEqualTo("expired");
        assertThat(response.scheduleActive()).isFalse();
        assertThat(response.serviceDaysRemaining()).isEqualTo(-5);
    }

    @Test
    void reportsNoImportPlusFailedRefresh() throws Exception {
        when(repository.findActiveImport()).thenReturn(Optional.empty());
        when(refreshRunService.latest()).thenReturn(Optional.of(new GtfsScheduleRefreshRunSnapshot(
            19L,
            "failed",
            OffsetDateTime.parse("2026-06-20T19:04:20Z"),
            OffsetDateTime.parse("2026-06-20T19:05:15Z"),
            0,
            "Java heap space"
        )));

        ScheduleHealthController.ScheduleHealthResponse response = controller.schedule();

        assertThat(response.status()).isEqualTo("not-imported");
        assertThat(response.scheduleActive()).isFalse();
        assertThat(response.refreshStatus()).isEqualTo("failed");
        assertThat(response.refreshErrorMessage()).isEqualTo("Java heap space");
        assertThat(response.refreshCompletedAt())
            .isEqualTo(OffsetDateTime.parse("2026-06-20T19:05:15Z"));
        assertThat(response.message()).isEqualTo("No TTC GTFS schedule import is active; the latest refresh failed.");
        String json = new ObjectMapper().findAndRegisterModules().writeValueAsString(response);
        assertThat(json).contains("refreshErrorMessage", "Java heap space");
    }

    @Test
    void reportsActiveImportPlusANewerFailedRefresh() {
        properties.setGtfsRefreshMinServiceDaysRemaining(14);
        when(repository.findActiveImport()).thenReturn(Optional.of(activeImport(LocalDate.parse("2026-07-20"))));
        when(refreshRunService.latest()).thenReturn(Optional.of(new GtfsScheduleRefreshRunSnapshot(
            19L,
            "failed",
            OffsetDateTime.parse("2026-06-20T19:04:20Z"),
            OffsetDateTime.parse("2026-06-20T19:05:15Z"),
            0,
            "Java heap space"
        )));

        ScheduleHealthController.ScheduleHealthResponse response = controller.schedule();

        assertThat(response.status()).isEqualTo("active");
        assertThat(response.scheduleActive()).isTrue();
        assertThat(response.refreshStatus()).isEqualTo("failed");
        assertThat(response.refreshErrorMessage()).isEqualTo("Java heap space");
    }

    private GtfsScheduleReadRepository.ActiveScheduleImport activeImport(LocalDate serviceEnd) {
        return new GtfsScheduleReadRepository.ActiveScheduleImport(
            7L,
            "TTC merged GTFS schedule",
            "https://example.test/source",
            OffsetDateTime.parse("2026-06-01T12:00:00Z"),
            LocalDate.parse("2026-06-01"),
            serviceEnd
        );
    }
}
