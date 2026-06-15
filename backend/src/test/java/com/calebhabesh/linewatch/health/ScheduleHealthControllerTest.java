package com.calebhabesh.linewatch.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class ScheduleHealthControllerTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-06-15T14:00:00Z"), ZoneOffset.UTC);

    private final GtfsScheduleReadRepository repository = mock(GtfsScheduleReadRepository.class);
    private final ArrivalProperties properties = new ArrivalProperties();
    private final ScheduleHealthController controller = new ScheduleHealthController(repository, properties, CLOCK);

    @Test
    void reportsNotImportedWhenNoActiveScheduleExists() {
        when(repository.findActiveImport()).thenReturn(Optional.empty());

        ScheduleHealthController.ScheduleHealthResponse response = controller.schedule();

        assertThat(response.status()).isEqualTo("not-imported");
        assertThat(response.scheduleActive()).isFalse();
        assertThat(response.serviceDaysRemaining()).isNull();
    }

    @Test
    void reportsActiveScheduleWithDaysRemaining() {
        properties.setGtfsRefreshMinServiceDaysRemaining(14);
        when(repository.findActiveImport()).thenReturn(Optional.of(activeImport(LocalDate.parse("2026-07-20"))));

        ScheduleHealthController.ScheduleHealthResponse response = controller.schedule();

        assertThat(response.status()).isEqualTo("active");
        assertThat(response.scheduleActive()).isTrue();
        assertThat(response.serviceDaysRemaining()).isEqualTo(35);
        assertThat(response.serviceEnd()).isEqualTo(LocalDate.parse("2026-07-20"));
    }

    @Test
    void reportsExpiringScheduleInsideRefreshThreshold() {
        properties.setGtfsRefreshMinServiceDaysRemaining(14);
        when(repository.findActiveImport()).thenReturn(Optional.of(activeImport(LocalDate.parse("2026-06-28"))));

        ScheduleHealthController.ScheduleHealthResponse response = controller.schedule();

        assertThat(response.status()).isEqualTo("expiring");
        assertThat(response.scheduleActive()).isTrue();
        assertThat(response.serviceDaysRemaining()).isEqualTo(13);
    }

    @Test
    void reportsExpiredSchedule() {
        when(repository.findActiveImport()).thenReturn(Optional.of(activeImport(LocalDate.parse("2026-06-10"))));

        ScheduleHealthController.ScheduleHealthResponse response = controller.schedule();

        assertThat(response.status()).isEqualTo("expired");
        assertThat(response.scheduleActive()).isFalse();
        assertThat(response.serviceDaysRemaining()).isEqualTo(-5);
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
