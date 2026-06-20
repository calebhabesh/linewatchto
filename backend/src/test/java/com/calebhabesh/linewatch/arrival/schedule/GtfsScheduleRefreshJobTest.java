package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class GtfsScheduleRefreshJobTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-06-15T14:00:00Z"), ZoneOffset.UTC);

    private final ArrivalProperties properties = new ArrivalProperties();
    private final GtfsScheduleReadRepository readRepository = mock(GtfsScheduleReadRepository.class);
    private final GtfsScheduleImportRepository importRepository = mock(GtfsScheduleImportRepository.class);
    private final GtfsScheduleDownloadClient downloadClient = mock(GtfsScheduleDownloadClient.class);
    private final GtfsScheduleImportService importService = mock(GtfsScheduleImportService.class);
    private final GtfsScheduleRefreshRunService runService = mock(GtfsScheduleRefreshRunService.class);
    private final GtfsScheduleRefreshJob job = new GtfsScheduleRefreshJob(
        properties,
        readRepository,
        importRepository,
        downloadClient,
        importService,
        runService,
        CLOCK
    );

    private final GtfsScheduleImportService.ImportSummary summary =
        new GtfsScheduleImportService.ImportSummary(11L, 5, 76, 12, 4, 3000, 90000, 154);

    @Test
    void doesNotRefreshWhenJobIsDisabled() throws Exception {
        properties.setGtfsRefreshEnabled(false);

        job.refresh();

        verify(downloadClient, never()).downloadCurrentZip();
        verify(runService, never()).start();
    }

    @Test
    void promotesReadyImportBeforeRefreshDecision() throws Exception {
        properties.setGtfsRefreshEnabled(true);
        properties.setGtfsRefreshMinServiceDaysRemaining(14);
        when(readRepository.findActiveImport()).thenReturn(Optional.of(activeImport(LocalDate.parse("2026-07-20"))));
        when(readRepository.findLatestImport()).thenReturn(Optional.empty());

        job.refresh();

        verify(importRepository).activateLatestImportCoveringDate(LocalDate.parse("2026-06-15"));
        verify(downloadClient, never()).downloadCurrentZip();
        verify(runService, never()).start();
    }

    @Test
    void importsCurrentScheduleWhenNoActiveImportExistsAndSucceeds() throws Exception {
        properties.setGtfsRefreshEnabled(true);
        when(readRepository.findActiveImport()).thenReturn(Optional.empty());
        when(readRepository.findLatestImport()).thenReturn(Optional.empty());
        when(downloadClient.downloadCurrentZip()).thenReturn(downloaded("/tmp/ttc-gtfs.zip"));
        when(importService.importZip(Path.of("/tmp/ttc-gtfs.zip"), "https://example.test/gtfs.zip"))
            .thenReturn(summary);
        when(runService.start()).thenReturn(17L);

        job.refresh();

        verify(importService).importZip(Path.of("/tmp/ttc-gtfs.zip"), "https://example.test/gtfs.zip");
        verify(runService).succeed(17L, summary);
        verify(runService, never()).fail(anyLong(), any());
    }

    @Test
    void skipsRefreshWhenActiveScheduleHasEnoughServiceDaysRemaining() throws Exception {
        properties.setGtfsRefreshEnabled(true);
        properties.setGtfsRefreshMinServiceDaysRemaining(14);
        when(readRepository.findActiveImport()).thenReturn(Optional.of(activeImport(LocalDate.parse("2026-07-20"))));
        when(readRepository.findLatestImport()).thenReturn(Optional.empty());

        job.refresh();

        verify(downloadClient, never()).downloadCurrentZip();
        verify(runService, never()).start();
    }

    @Test
    void skipsRefreshWhenFutureImportAlreadyExtendsCoverageBeyondThreshold() throws Exception {
        properties.setGtfsRefreshEnabled(true);
        properties.setGtfsRefreshMinServiceDaysRemaining(14);
        when(readRepository.findActiveImport()).thenReturn(Optional.of(activeImport(LocalDate.parse("2026-06-28"))));
        when(readRepository.findLatestImport()).thenReturn(Optional.of(scheduleImport(
            LocalDate.parse("2026-06-29"),
            LocalDate.parse("2026-07-25")
        )));

        job.refresh();

        verify(downloadClient, never()).downloadCurrentZip();
        verify(runService, never()).start();
    }

    @Test
    void skipsRefreshWhenOnlyFutureImportExists() throws Exception {
        properties.setGtfsRefreshEnabled(true);
        when(readRepository.findActiveImport()).thenReturn(Optional.empty());
        when(readRepository.findLatestImport()).thenReturn(Optional.of(scheduleImport(
            LocalDate.parse("2026-06-21"),
            LocalDate.parse("2026-07-25")
        )));

        job.refresh();

        verify(downloadClient, never()).downloadCurrentZip();
        verify(runService, never()).start();
    }

    @Test
    void refreshesWhenActiveScheduleIsNearingExpiryAndRecordsFailure() throws Exception {
        properties.setGtfsRefreshEnabled(true);
        properties.setGtfsRefreshMinServiceDaysRemaining(14);
        when(readRepository.findActiveImport()).thenReturn(Optional.of(activeImport(LocalDate.parse("2026-06-28"))));
        when(readRepository.findLatestImport()).thenReturn(Optional.empty());
        when(downloadClient.downloadCurrentZip()).thenThrow(new IOException("CKAN unavailable"));
        when(runService.start()).thenReturn(17L);

        job.refresh();

        verify(runService).fail(eq(17L), any(IOException.class));
        verify(runService, never()).succeed(anyLong(), any());
    }

    @Test
    void errorDuringRefreshRecordsFailureAndRethrows() throws Exception {
        properties.setGtfsRefreshEnabled(true);
        when(readRepository.findActiveImport()).thenReturn(Optional.empty());
        when(readRepository.findLatestImport()).thenReturn(Optional.empty());
        OutOfMemoryError failure = new OutOfMemoryError("simulated");
        when(downloadClient.downloadCurrentZip()).thenThrow(failure);
        when(runService.start()).thenReturn(17L);

        assertThatThrownBy(job::refresh).isSameAs(failure);
        verify(runService).fail(17L, failure);
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

    private GtfsScheduleReadRepository.ScheduleImport scheduleImport(LocalDate serviceStart, LocalDate serviceEnd) {
        return new GtfsScheduleReadRepository.ScheduleImport(
            11L,
            "TTC merged GTFS schedule",
            "https://example.test/source",
            OffsetDateTime.parse("2026-06-14T12:00:00Z"),
            serviceStart,
            serviceEnd
        );
    }

    private GtfsScheduleDownloadClient.DownloadedGtfs downloaded(String path) {
        return new GtfsScheduleDownloadClient.DownloadedGtfs(Path.of(path), "https://example.test/gtfs.zip");
    }
}
