package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.arrival.schedule.GtfsCsvReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RegionalGtfsScheduleImportWriter {
    static final int DEPARTURE_BATCH_SIZE = 1000;

    private final RegionalGtfsScheduleRepository repository;
    private final Clock clock;

    public RegionalGtfsScheduleImportWriter(RegionalGtfsScheduleRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional(rollbackFor = Exception.class)
    public RegionalGtfsScheduleImportService.ImportSummary write(
        Path zipPath,
        RegionalGtfsPreparedImport prepared
    ) throws IOException {
        long importId = repository.beginReplacementImport(
            prepared.sourceSystem(),
            prepared.sourceUrl(),
            OffsetDateTime.now(clock),
            prepared.serviceStart(),
            prepared.serviceEnd()
        );

        repository.insertServices(importId, prepared.services());
        repository.insertServiceExceptions(importId, prepared.exceptions());

        DepartureBatcher batcher = new DepartureBatcher(repository, importId);
        streamStopTimes(zipPath, row -> {
            RegionalGtfsScheduleImportService.TripInfo trip = prepared.trips().get(row.value("trip_id"));
            RegionalGtfsScheduleImportService.StopInfo stop = prepared.stops().get(row.value("stop_id"));
            if (trip == null || stop == null) return;
            String stationId = RegionalGtfsScheduleImportService.stationId(stop, prepared.stops(), row.value("stop_id"));
            if (stationId == null || RegionalNetworkCatalog.route(trip.lineId())
                .map(route -> !route.stationIds().contains(stationId)).orElse(true)) return;
            String departureTime = RegionalGtfsScheduleImportService.firstNonBlank(
                row.value("departure_time"), row.value("arrival_time")
            );
            if (departureTime.isBlank()) return;
            batcher.accept(new RegionalGtfsScheduleImport.Departure(
                stationId, trip.lineId(), trip.serviceId(), row.value("trip_id"), trip.shortName(),
                trip.direction(), GtfsCsvReader.seconds(departureTime), stop.platform(),
                RegionalGtfsScheduleImportService.integer(row.value("stop_sequence"))
            ));
        });
        batcher.finish();

        if (batcher.totalRows() == 0) {
            throw new IOException("Regional GTFS feed did not contain mapped rail schedule coverage");
        }

        repository.activateImport(importId, prepared.sourceSystem());
        repository.pruneInactiveImports(prepared.sourceSystem());
        repository.analyzeTables();

        return new RegionalGtfsScheduleImportService.ImportSummary(
            importId,
            prepared.sourceSystem(),
            prepared.routeCount(),
            prepared.trips().size(),
            batcher.totalRows(),
            prepared.serviceStart(),
            prepared.serviceEnd()
        );
    }

    private void streamStopTimes(Path zipPath, Consumer<GtfsCsvReader.Row> consumer) throws IOException {
        try (ZipFile zipFile = new ZipFile(zipPath.toFile())) {
            ZipEntry entry = zipFile.getEntry("stop_times.txt");
            if (entry == null) {
                throw new IOException("Regional GTFS zip did not contain stop_times.txt");
            }
            try (InputStream input = zipFile.getInputStream(entry);
                 InputStreamReader reader = new InputStreamReader(input, StandardCharsets.UTF_8)) {
                GtfsCsvReader.forEachRow(reader, consumer);
            }
        }
    }

    private static class DepartureBatcher {
        private final RegionalGtfsScheduleRepository repository;
        private final long importId;
        private final List<RegionalGtfsScheduleImport.Departure> batch = new ArrayList<>(DEPARTURE_BATCH_SIZE);
        private int totalRows = 0;

        public DepartureBatcher(RegionalGtfsScheduleRepository repository, long importId) {
            this.repository = repository;
            this.importId = importId;
        }

        public void accept(RegionalGtfsScheduleImport.Departure departure) {
            batch.add(departure);
            if (batch.size() >= DEPARTURE_BATCH_SIZE) {
                flush();
            }
        }

        public void finish() {
            if (!batch.isEmpty()) {
                flush();
            }
        }

        private void flush() {
            repository.insertDepartures(importId, List.copyOf(batch));
            totalRows += batch.size();
            batch.clear();
        }

        public int totalRows() {
            return totalRows;
        }
    }
}
