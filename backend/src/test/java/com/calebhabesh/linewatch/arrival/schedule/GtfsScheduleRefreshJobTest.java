package com.calebhabesh.linewatch.arrival.schedule;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
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
    private final GtfsScheduleDownloadClient downloadClient = mock(GtfsScheduleDownloadClient.class);
    private final GtfsScheduleImportService importService = mock(GtfsScheduleImportService.class);
    private final GtfsScheduleRefreshJob job = new GtfsScheduleRefreshJob(
        properties,
        readRepository,
        downloadClient,
        importService,
        CLOCK
    );

    @Test
    void doesNotRefreshWhenJobIsDisabled() throws Exception {
        properties.setGtfsRefreshEnabled(false);

        job.refresh();

        verify(downloadClient, never()).downloadCurrentZip();
    }

    @Test
    void importsCurrentScheduleWhenNoActiveImportExists() throws Exception {
        properties.setGtfsRefreshEnabled(true);
        when(readRepository.findActiveImport()).thenReturn(Optional.empty());
        when(downloadClient.downloadCurrentZip()).thenReturn(downloaded("/tmp/ttc-gtfs.zip"));
        stubImport("/tmp/ttc-gtfs.zip");

        job.refresh();

        verify(importService).importZip(Path.of("/tmp/ttc-gtfs.zip"), "https://example.test/gtfs.zip");
    }

    @Test
    void skipsRefreshWhenActiveScheduleHasEnoughServiceDaysRemaining() throws Exception {
        properties.setGtfsRefreshEnabled(true);
        properties.setGtfsRefreshMinServiceDaysRemaining(14);
        when(readRepository.findActiveImport()).thenReturn(Optional.of(activeImport(LocalDate.parse("2026-07-20"))));

        job.refresh();

        verify(downloadClient, never()).downloadCurrentZip();
    }

    @Test
    void refreshesWhenActiveScheduleIsNearingExpiry() throws Exception {
        properties.setGtfsRefreshEnabled(true);
        properties.setGtfsRefreshMinServiceDaysRemaining(14);
        when(readRepository.findActiveImport()).thenReturn(Optional.of(activeImport(LocalDate.parse("2026-06-28"))));
        when(downloadClient.downloadCurrentZip()).thenReturn(downloaded("/tmp/ttc-gtfs.zip"));
        stubImport("/tmp/ttc-gtfs.zip");

        job.refresh();

        verify(importService).importZip(Path.of("/tmp/ttc-gtfs.zip"), "https://example.test/gtfs.zip");
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

    private GtfsScheduleDownloadClient.DownloadedGtfs downloaded(String path) {
        return new GtfsScheduleDownloadClient.DownloadedGtfs(Path.of(path), "https://example.test/gtfs.zip");
    }

    private void stubImport(String path) throws Exception {
        when(importService.importZip(Path.of(path), "https://example.test/gtfs.zip"))
            .thenReturn(new GtfsScheduleImportService.ImportSummary(11L, 5, 76, 12, 4, 3000, 90000, 154));
    }
}
