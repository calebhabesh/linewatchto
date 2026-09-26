package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.transaction.annotation.Transactional;

class RegionalGtfsScheduleImportWriterTest {
    @TempDir Path tempDir;

    private final RegionalGtfsScheduleRepository repository = mock(RegionalGtfsScheduleRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-07-29T12:00:00Z"), ZoneOffset.UTC);
    private final RegionalGtfsScheduleImportWriter writer = new RegionalGtfsScheduleImportWriter(repository, clock);

    @Test
    void batchesDeparturesAndActivatesOnSuccess() throws Exception {
        Path zip = tempDir.resolve("go_large.zip");
        writeLargeZip(zip, 2501);

        when(repository.beginReplacementImport(
            eq("go"), eq("https://example.test/go.zip"), any(),
            eq(LocalDate.parse("2026-07-01")), eq(LocalDate.parse("2026-09-01"))
        )).thenReturn(42L);

        RegionalGtfsPreparedImport prepared = new RegionalGtfsPreparedImport(
            "go", "https://example.test/go.zip",
            LocalDate.parse("2026-07-01"), LocalDate.parse("2026-09-01"),
            List.of(new RegionalGtfsScheduleImport.Service(
                "WKD", true, true, true, true, true, false, false,
                LocalDate.parse("2026-07-01"), LocalDate.parse("2026-09-01")
            )),
            List.of(new RegionalGtfsScheduleImport.ServiceException(
                "WKD", LocalDate.parse("2026-08-03"), 2
            )),
            1,
            Map.of("MI100", new RegionalGtfsScheduleImportService.TripInfo("regional-mi", "WKD", "681", "Union Station")),
            Map.of("ML", new RegionalGtfsScheduleImportService.StopInfo("ML", null, "1"))
        );

        RegionalGtfsScheduleImportService.ImportSummary summary = writer.write(zip, prepared);

        assertThat(summary.importId()).isEqualTo(42L);
        assertThat(summary.departures()).isEqualTo(2501);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<RegionalGtfsScheduleImport.Departure>> batches =
            ArgumentCaptor.forClass(List.class);
        verify(repository, times(3)).insertDepartures(eq(42L), batches.capture());

        assertThat(batches.getAllValues())
            .extracting(List::size)
            .containsExactly(1000, 1000, 501);
        assertThat(batches.getAllValues())
            .allSatisfy(batch -> assertThat(batch).hasSizeLessThanOrEqualTo(1000));

        InOrder order = inOrder(repository);
        order.verify(repository).beginReplacementImport(eq("go"), eq("https://example.test/go.zip"), any(), any(), any());
        order.verify(repository).insertServices(eq(42L), any());
        order.verify(repository).insertServiceExceptions(eq(42L), any());
        order.verify(repository, times(3)).insertDepartures(eq(42L), any());
        order.verify(repository).activateImport(42L, "go");
        order.verify(repository).pruneInactiveImports("go");
        order.verify(repository).analyzeTables();
    }

    @Test
    void failureDuringStreamingAbortsAndDoesNotActivate() throws Exception {
        Path zip = tempDir.resolve("go_fail.zip");
        writeLargeZip(zip, 2501);

        when(repository.beginReplacementImport(any(), any(), any(), any(), any())).thenReturn(42L);

        doNothing()
            .doThrow(new IllegalStateException("database insert failed on second batch"))
            .when(repository)
            .insertDepartures(eq(42L), any());

        RegionalGtfsPreparedImport prepared = new RegionalGtfsPreparedImport(
            "go", "https://example.test/go.zip",
            LocalDate.parse("2026-07-01"), LocalDate.parse("2026-09-01"),
            List.of(), List.of(), 1,
            Map.of("MI100", new RegionalGtfsScheduleImportService.TripInfo("regional-mi", "WKD", "681", "Union Station")),
            Map.of("ML", new RegionalGtfsScheduleImportService.StopInfo("ML", null, "1"))
        );

        assertThatThrownBy(() -> writer.write(zip, prepared))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("database insert failed on second batch");

        verify(repository, never()).activateImport(anyLong(), any());
        verify(repository, never()).pruneInactiveImports(any());
        verify(repository, never()).analyzeTables();
    }

    @Test
    void emptyFeedThrowsAndDoesNotActivate() throws Exception {
        Path zip = tempDir.resolve("empty.zip");
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            output.putNextEntry(new ZipEntry("stop_times.txt"));
            output.write("trip_id,arrival_time,departure_time,stop_id,stop_sequence\n".getBytes(StandardCharsets.UTF_8));
            output.closeEntry();
        }

        when(repository.beginReplacementImport(any(), any(), any(), any(), any())).thenReturn(43L);

        RegionalGtfsPreparedImport prepared = new RegionalGtfsPreparedImport(
            "go", "https://example.test/empty.zip",
            LocalDate.parse("2026-07-01"), LocalDate.parse("2026-09-01"),
            List.of(), List.of(), 1, Map.of(), Map.of()
        );

        assertThatThrownBy(() -> writer.write(zip, prepared))
            .isInstanceOf(IOException.class)
            .hasMessageContaining("Regional GTFS feed did not contain mapped rail schedule coverage");

        verify(repository, never()).activateImport(anyLong(), any());
        verify(repository, never()).pruneInactiveImports(any());
        verify(repository, never()).analyzeTables();
    }

    @Test
    void writeMethodIsTransactional() throws Exception {
        Transactional transactional = RegionalGtfsScheduleImportWriter.class
            .getMethod("write", Path.class, RegionalGtfsPreparedImport.class)
            .getAnnotation(Transactional.class);

        assertThat(transactional).isNotNull();
        assertThat(transactional.rollbackFor()).contains(Exception.class);
    }

    private void writeLargeZip(Path zip, int count) throws IOException {
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            output.putNextEntry(new ZipEntry("stop_times.txt"));
            StringBuilder sb = new StringBuilder();
            sb.append("trip_id,arrival_time,departure_time,stop_id,stop_sequence\n");
            for (int i = 0; i < count; i++) {
                sb.append("MI100,06:30:00,06:30:00,ML,1\n");
            }
            output.write(sb.toString().getBytes(StandardCharsets.UTF_8));
            output.closeEntry();
        }
    }
}
