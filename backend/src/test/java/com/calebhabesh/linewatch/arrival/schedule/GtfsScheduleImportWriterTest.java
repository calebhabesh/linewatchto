package com.calebhabesh.linewatch.arrival.schedule;

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
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.transaction.annotation.Transactional;

class GtfsScheduleImportWriterTest {
    @TempDir
    Path tempDir;

    private final GtfsScheduleImportRepository repository = mock(GtfsScheduleImportRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-04T12:00:00Z"), ZoneOffset.UTC);
    private final GtfsScheduleImportWriter writer = new GtfsScheduleImportWriter(repository, clock);

    @Test
    void batchesStopTimesAndActivatesImportOnSuccess() throws Exception {
        Path zip = tempDir.resolve("gtfs_large.zip");
        writeLargeZip(zip, 2501);

        when(repository.beginReplacementImport(
            eq("TTC merged GTFS schedule"),
            eq("test-source"),
            any(),
            eq(LocalDate.parse("2026-06-01")),
            eq(LocalDate.parse("2026-12-31"))
        )).thenReturn(42L);

        GtfsSchedulePreparedImport prepared = new GtfsSchedulePreparedImport(
            List.of(new GtfsImportModels.RouteRow("1", "line-1", "1", "Yonge-University")),
            List.of(new GtfsImportModels.StopRow("UNION", "Union Station", "")),
            List.of(new GtfsImportModels.ServiceRow("WEEKDAY", true, true, true, true, true, false, false, LocalDate.parse("2026-06-01"), LocalDate.parse("2026-12-31"))),
            Collections.emptyList(),
            List.of(new GtfsImportModels.TripRow("L1_N_1", "1", "WEEKDAY", "Northbound", 0)),
            List.of(new GtfsImportModels.StationStopRow("UNION", "line-1", "UNION")),
            Set.of("L1_N_1"),
            LocalDate.parse("2026-06-01"),
            LocalDate.parse("2026-12-31")
        );

        GtfsScheduleImportService.ImportSummary summary =
            writer.write(zip, "test-source", prepared);

        ArgumentCaptor<List<GtfsImportModels.StopTimeRow>> batches =
            ArgumentCaptor.forClass(List.class);
        verify(repository, times(3)).insertStopTimes(eq(42L), batches.capture());

        assertThat(batches.getAllValues())
            .extracting(List::size)
            .containsExactly(1000, 1000, 501);
        assertThat(batches.getAllValues())
            .allSatisfy(batch -> assertThat(batch).hasSizeLessThanOrEqualTo(1000));
        assertThat(summary.stopTimes()).isEqualTo(2501);

        InOrder order = inOrder(repository);
        order.verify(repository).beginReplacementImport(any(), any(), any(), any(), any());
        order.verify(repository).insertRoutes(eq(42L), any());
        order.verify(repository).insertStops(eq(42L), any());
        order.verify(repository).insertServices(eq(42L), any());
        order.verify(repository).insertServiceExceptions(eq(42L), any());
        order.verify(repository).insertTrips(eq(42L), any());
        order.verify(repository, times(3)).insertStopTimes(eq(42L), any());
        order.verify(repository).insertStationStops(eq(42L), any());
        order.verify(repository).activateImport(42L);
        order.verify(repository).refreshPlannerStatistics();
    }

    @Test
    void futureDatedImportIsWrittenButNotActivated() throws Exception {
        Path zip = tempDir.resolve("gtfs_future.zip");
        writeLargeZip(zip, 3);

        when(repository.beginReplacementImport(
            eq("TTC merged GTFS schedule"),
            eq("test-source"),
            any(),
            eq(LocalDate.parse("2026-06-05")),
            eq(LocalDate.parse("2026-07-19"))
        )).thenReturn(43L);

        GtfsSchedulePreparedImport prepared = new GtfsSchedulePreparedImport(
            List.of(new GtfsImportModels.RouteRow("1", "line-1", "1", "Yonge-University")),
            List.of(new GtfsImportModels.StopRow("UNION", "Union Station", "")),
            List.of(new GtfsImportModels.ServiceRow("WEEKDAY", true, true, true, true, true, false, false, LocalDate.parse("2026-06-05"), LocalDate.parse("2026-07-19"))),
            Collections.emptyList(),
            List.of(new GtfsImportModels.TripRow("L1_N_1", "1", "WEEKDAY", "Northbound", 0)),
            List.of(new GtfsImportModels.StationStopRow("UNION", "line-1", "UNION")),
            Set.of("L1_N_1"),
            LocalDate.parse("2026-06-05"),
            LocalDate.parse("2026-07-19")
        );

        GtfsScheduleImportService.ImportSummary summary =
            writer.write(zip, "test-source", prepared);

        assertThat(summary.importId()).isEqualTo(43L);
        verify(repository, never()).activateImport(43L);
        verify(repository).refreshPlannerStatistics();
    }

    @Test
    void failureDuringWritesAbortsAndDoesNotActivate() throws Exception {
        Path zip = tempDir.resolve("gtfs_fail.zip");
        writeLargeZip(zip, 2501);

        when(repository.beginReplacementImport(
            eq("TTC merged GTFS schedule"),
            eq("test-source"),
            any(),
            eq(LocalDate.parse("2026-06-01")),
            eq(LocalDate.parse("2026-12-31"))
        )).thenReturn(42L);

        GtfsSchedulePreparedImport prepared = new GtfsSchedulePreparedImport(
            List.of(new GtfsImportModels.RouteRow("1", "line-1", "1", "Yonge-University")),
            List.of(new GtfsImportModels.StopRow("UNION", "Union Station", "")),
            List.of(new GtfsImportModels.ServiceRow("WEEKDAY", true, true, true, true, true, false, false, LocalDate.parse("2026-06-01"), LocalDate.parse("2026-12-31"))),
            Collections.emptyList(),
            List.of(new GtfsImportModels.TripRow("L1_N_1", "1", "WEEKDAY", "Northbound", 0)),
            List.of(new GtfsImportModels.StationStopRow("UNION", "line-1", "UNION")),
            Set.of("L1_N_1"),
            LocalDate.parse("2026-06-01"),
            LocalDate.parse("2026-12-31")
        );

        doNothing()
            .doThrow(new IllegalStateException("database write failed"))
            .when(repository)
            .insertStopTimes(eq(42L), any());

        assertThatThrownBy(() -> writer.write(zip, "test-source", prepared))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("database write failed");

        verify(repository, never()).activateImport(anyLong());
        verify(repository, never()).refreshPlannerStatistics();
    }

    @Test
    void writeMethodIsTransactional() throws Exception {
        Transactional transactional = GtfsScheduleImportWriter.class
            .getMethod("write", Path.class, String.class, GtfsSchedulePreparedImport.class)
            .getAnnotation(Transactional.class);

        assertThat(transactional).isNotNull();
        assertThat(transactional.rollbackFor()).contains(Exception.class);
    }

    private void writeLargeZip(Path zip, int stopTimesCount) throws IOException {
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            StringBuilder stopTimesBuilder = new StringBuilder();
            stopTimesBuilder.append("trip_id,arrival_time,departure_time,stop_id,stop_sequence\n");
            for (int i = 0; i < stopTimesCount; i++) {
                stopTimesBuilder.append("L1_N_1,09:00:00,09:00:00,UNION,1\n");
            }
            // surface row
            stopTimesBuilder.append("QUEEN_1,09:01:00,09:01:00,QUEEN_SURFACE,1\n");

            entry(output, "stop_times.txt", stopTimesBuilder.toString());
        }
    }

    private void entry(ZipOutputStream output, String name, String body) throws IOException {
        output.putNextEntry(new ZipEntry(name));
        output.write(body.getBytes(StandardCharsets.UTF_8));
        output.closeEntry();
    }
}
