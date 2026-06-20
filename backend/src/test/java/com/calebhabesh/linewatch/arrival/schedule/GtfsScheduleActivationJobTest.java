package com.calebhabesh.linewatch.arrival.schedule;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class GtfsScheduleActivationJobTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-06-21T04:01:00Z"), ZoneOffset.UTC);

    private final ArrivalProperties properties = new ArrivalProperties();
    private final GtfsScheduleImportRepository repository = mock(GtfsScheduleImportRepository.class);
    private final GtfsScheduleActivationJob job = new GtfsScheduleActivationJob(properties, repository, CLOCK);

    @Test
    void promotesReadyImportWhenGtfsRefreshIsEnabled() {
        properties.setGtfsRefreshEnabled(true);

        job.promoteReadyImport();

        verify(repository).activateLatestImportCoveringDate(LocalDate.parse("2026-06-21"));
    }

    @Test
    void skipsPromotionWhenGtfsRefreshIsDisabled() {
        properties.setGtfsRefreshEnabled(false);

        job.promoteReadyImport();

        verify(repository, never()).activateLatestImportCoveringDate(LocalDate.parse("2026-06-21"));
    }
}
