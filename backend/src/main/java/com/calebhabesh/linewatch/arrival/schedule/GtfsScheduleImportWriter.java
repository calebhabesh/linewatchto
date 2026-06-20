package com.calebhabesh.linewatch.arrival.schedule;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;
import java.time.OffsetDateTime;
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

    private final GtfsScheduleImportRepository repository;
    private final Clock clock;

    public GtfsScheduleImportWriter(GtfsScheduleImportRepository repository, Clock clock) {
        this.repository = repository;
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
        repository.insertServices(importId, prepared.services());
        repository.insertServiceExceptions(importId, prepared.serviceExceptions());
        repository.insertTrips(importId, prepared.trips());

        StopTimeBatcher batcher = new StopTimeBatcher(
            repository,
            importId,
            prepared.rapidTransitTripIds()
        );
        streamStopTimes(zipPath, batcher::accept);
        batcher.finish();

        repository.insertStationStops(importId, prepared.stationStops());
        repository.activateImport(importId);

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
