package com.calebhabesh.linewatch.arrival.schedule;

import com.calebhabesh.linewatch.reliability.ReliabilityScheduleCapture;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GtfsScheduleImportWriter {
    static final int STOP_TIME_BATCH_SIZE = 1000;
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private final GtfsScheduleImportRepository repository;
    private final ReliabilityScheduleCapture scheduleCapture;
    private final Clock clock;

    public GtfsScheduleImportWriter(
        GtfsScheduleImportRepository repository,
        ReliabilityScheduleCapture scheduleCapture,
        Clock clock
    ) {
        this.repository = repository;
        this.scheduleCapture = scheduleCapture;
        this.clock = clock;
    }

    @Transactional(rollbackFor = Exception.class)
    public GtfsScheduleImportService.ImportSummary write(
        Path zipPath,
        String sourceUrl,
        GtfsSchedulePreparedImport prepared
    ) throws IOException {
        long importId = repository.beginReplacementImport(
            "TTC merged GTFS schedule",
            sourceUrl,
            OffsetDateTime.now(clock),
            prepared.serviceStart(),
            prepared.serviceEnd()
        );

        repository.insertRoutes(importId, prepared.routes());
        repository.insertStops(importId, prepared.stops());
        repository.markFullStopCatalogAvailable(importId);
        repository.insertServices(importId, prepared.services());
        repository.insertServiceExceptions(importId, prepared.serviceExceptions());
        repository.insertTrips(importId, prepared.trips());
        repository.insertSurfaceRoutes(importId, prepared.surfaceRoutes());
        repository.insertSurfaceStationStops(importId, prepared.surfaceStationStops());
        repository.insertSurfaceTrips(importId, prepared.surfaceTrips());
        repository.insertSurfaceStationConnections(importId, prepared.surfaceStationConnections());
        repository.insertSurfaceStops(importId, prepared.surfaceStops());

        StopTimeBatcher batcher = new StopTimeBatcher(
            repository,
            importId,
            prepared.rapidTransitTripIds()
        );
        Set<String> surfaceTrips = prepared.surfaceTrips().stream()
            .map(GtfsImportModels.SurfaceTripRow::tripId).collect(java.util.stream.Collectors.toSet());
        var lastSurfaceStops = prepared.surfaceTrips().stream().collect(java.util.stream.Collectors.toMap(
            GtfsImportModels.SurfaceTripRow::tripId, GtfsImportModels.SurfaceTripRow::lastStopSequence));
        Set<String> surfaceStops = new java.util.HashSet<>();
        prepared.surfaceStationStops().forEach(stop -> surfaceStops.add(stop.stopId()));
        prepared.surfaceStops().forEach(stop -> surfaceStops.add(stop.stopId()));
        var tripsById = prepared.surfaceTrips().stream().collect(java.util.stream.Collectors.toMap(
            GtfsImportModels.SurfaceTripRow::tripId, java.util.function.Function.identity(), (a, b) -> a));
        Set<GtfsImportModels.SurfaceStopRouteRow> stopRoutes = new java.util.HashSet<>();
        List<GtfsImportModels.StopTimeRow> surfaceBatch = new ArrayList<>();
        streamStopTimes(zipPath, row -> {
            batcher.accept(row);
            // Only ordinary, published boarding departures at surface stops.
            if (!surfaceTrips.contains(row.value("trip_id")) || !surfaceStops.contains(row.value("stop_id"))) return;
            if (Integer.parseInt(row.value("stop_sequence")) >= lastSurfaceStops.get(row.value("trip_id"))) return;
            String pickup = row.value("pickup_type");
            if (!pickup.isBlank() && !"0".equals(pickup)) return;
            if (row.value("departure_time").isBlank()) return;
            GtfsImportModels.SurfaceTripRow trip = tripsById.get(row.value("trip_id"));
            stopRoutes.add(new GtfsImportModels.SurfaceStopRouteRow(row.value("stop_id"), trip.routeId(),
                trip.tripHeadsign() == null ? "" : trip.tripHeadsign()));
            int departure = GtfsCsvReader.seconds(row.value("departure_time"));
            surfaceBatch.add(new GtfsImportModels.StopTimeRow(row.value("trip_id"), row.value("stop_id"),
                departure, departure, Integer.parseInt(row.value("stop_sequence"))));
            if (surfaceBatch.size() >= STOP_TIME_BATCH_SIZE) {
                repository.insertSurfaceStopTimes(importId, List.copyOf(surfaceBatch));
                surfaceBatch.clear();
            }
        });
        repository.insertSurfaceStopTimes(importId, List.copyOf(surfaceBatch));
        repository.markSurfaceScheduleAvailable(importId);
        if (!prepared.surfaceStops().isEmpty()) {
            Set<String> catalogStops = prepared.surfaceStops().stream()
                .map(GtfsImportModels.SurfaceStopRow::stopId).collect(java.util.stream.Collectors.toSet());
            repository.insertSurfaceStopRoutes(importId, stopRoutes.stream()
                .filter(route -> catalogStops.contains(route.stopId()))
                .sorted(java.util.Comparator.comparing(GtfsImportModels.SurfaceStopRouteRow::stopId)
                    .thenComparing(GtfsImportModels.SurfaceStopRouteRow::routeId)
                    .thenComparing(GtfsImportModels.SurfaceStopRouteRow::destination))
                .toList());
            repository.markSurfaceStopCatalogAvailable(importId);
        }
        batcher.finish();

        repository.insertStationStops(importId, prepared.stationStops());
        List<String> missingStationLines = repository.findMissingStationLines(importId);
        if (!missingStationLines.isEmpty()) {
            throw new IllegalStateException(
                "TTC GTFS import is missing expected station-line mappings: "
                    + String.join(", ", missingStationLines)
            );
        }
        if (coversToday(prepared)) {
            repository.activateImport(importId);
        }
        // The small route table can remain below PostgreSQL's auto-analyze threshold
        // while its import IDs change completely. Refresh all related statistics in
        // the replacement transaction so readers never plan against mismatched IDs.
        repository.refreshPlannerStatistics();
        // Reliability keeps each date's spans after this import is pruned. Part of the import's
        // transaction: if capture fails the import rolls back and the active schedule stays.
        scheduleCapture.capture(ReliabilityScheduleCapture.ScheduleSource.TTC);

        return new GtfsScheduleImportService.ImportSummary(
            importId,
            prepared.routes().size(),
            prepared.stops().size(),
            prepared.services().size(),
            prepared.serviceExceptions().size(),
            prepared.trips().size(),
            batcher.totalRows(),
            prepared.stationStops().size()
        );
    }

    /**
     * Plan 17 A2 archive backfill: imports rapid-transit schedule tables from an archived TTC zip
     * as an inactive import, captures spans only for dates with no existing row in
     * {@code reliability_schedule_days}, then deletes the temporary import. Never activates.
     * Fails if a served rapid-transit stop maps to no station on its line, because the captured
     * days would otherwise count as complete while missing that station's spans.
     */
    @Transactional(rollbackFor = Exception.class)
    public ReliabilityScheduleCapture.CaptureResult writeArchiveBackfill(
        Path zipPath,
        String sourceUrl,
        String feedVersion,
        GtfsSchedulePreparedImport prepared
    ) throws IOException {
        long importId = repository.beginReplacementImport(
            "TTC archived GTFS backfill",
            sourceUrl,
            OffsetDateTime.now(clock),
            prepared.serviceStart(),
            prepared.serviceEnd()
        );
        repository.insertRoutes(importId, prepared.routes());
        repository.insertStops(importId, prepared.stops());
        repository.insertServices(importId, prepared.services());
        repository.insertServiceExceptions(importId, prepared.serviceExceptions());
        repository.insertTrips(importId, prepared.trips());
        StopTimeBatcher batcher = new StopTimeBatcher(repository, importId, prepared.rapidTransitTripIds());
        streamStopTimes(zipPath, batcher::accept);
        batcher.finish();
        repository.insertStationStops(importId, prepared.stationStops());
        // Until the statistics include this import ID, the cascades behind the delete below can
        // look up stop times by import alone and rescan the whole import for every deleted trip.
        repository.refreshPlannerStatistics();
        List<String> unmappedStops = repository.findUnmappedRapidTransitStops(importId);
        if (!unmappedStops.isEmpty()) {
            throw new IllegalStateException(
                "Archived TTC GTFS has rapid-transit stops without a station mapping: "
                    + String.join(", ", unmappedStops)
            );
        }
        ReliabilityScheduleCapture.CaptureResult captured = scheduleCapture.captureArchiveForImport(
            ReliabilityScheduleCapture.ScheduleSource.TTC,
            importId,
            feedVersion
        );
        // A failure above rolls the whole import back, so only success needs the delete.
        repository.deleteInactiveImport(importId);
        repository.refreshPlannerStatistics();
        return captured;
    }

    private boolean coversToday(GtfsSchedulePreparedImport prepared) {
        LocalDate today = LocalDate.now(clock.withZone(TORONTO_ZONE));
        return prepared.serviceStart() != null
            && prepared.serviceEnd() != null
            && !prepared.serviceStart().isAfter(today)
            && !prepared.serviceEnd().isBefore(today);
    }

    private void streamStopTimes(Path zipPath, java.util.function.Consumer<GtfsCsvReader.Row> consumer) throws IOException {
        try (ZipFile zipFile = new ZipFile(zipPath.toFile())) {
            ZipEntry entry = zipFile.getEntry("stop_times.txt");
            if (entry == null) {
                throw new IOException("TTC GTFS zip did not contain stop_times.txt");
            }
            try (InputStream input = zipFile.getInputStream(entry);
                 InputStreamReader reader = new InputStreamReader(input, StandardCharsets.UTF_8)) {
                GtfsCsvReader.forEachRow(reader, consumer);
            }
        }
    }

    private static class StopTimeBatcher {
        private final GtfsScheduleImportRepository repository;
        private final long importId;
        private final Set<String> rapidTransitTripIds;
        private final List<GtfsImportModels.StopTimeRow> batch = new ArrayList<>();
        private int totalRows = 0;

        public StopTimeBatcher(
            GtfsScheduleImportRepository repository,
            long importId,
            Set<String> rapidTransitTripIds
        ) {
            this.repository = repository;
            this.importId = importId;
            this.rapidTransitTripIds = rapidTransitTripIds;
        }

        public void accept(GtfsCsvReader.Row row) {
            String tripId = row.value("trip_id");
            if (!rapidTransitTripIds.contains(tripId)) {
                return;
            }
            batch.add(new GtfsImportModels.StopTimeRow(
                tripId,
                row.value("stop_id"),
                GtfsCsvReader.seconds(row.value("arrival_time")),
                GtfsCsvReader.seconds(row.value("departure_time")),
                Integer.parseInt(row.value("stop_sequence"))
            ));
            totalRows++;
            if (batch.size() >= STOP_TIME_BATCH_SIZE) {
                flush();
            }
        }

        public void finish() {
            if (!batch.isEmpty()) {
                flush();
            }
        }

        private void flush() {
            repository.insertStopTimes(importId, List.copyOf(batch));
            batch.clear();
        }

        public int totalRows() {
            return totalRows;
        }
    }
}
