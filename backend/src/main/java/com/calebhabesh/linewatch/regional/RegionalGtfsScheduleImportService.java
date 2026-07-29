package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.arrival.schedule.GtfsCsvReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import org.springframework.stereotype.Service;

@Service
public class RegionalGtfsScheduleImportService {
    private static final DateTimeFormatter GTFS_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final RegionalGtfsScheduleRepository repository;
    private final Clock clock;

    public RegionalGtfsScheduleImportService(RegionalGtfsScheduleRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public ImportSummary importZip(Path zipPath, String sourceSystem, String sourceUrl) throws IOException {
        if (!Set.of("go", "up").contains(sourceSystem)) {
            throw new IllegalArgumentException("Unsupported regional GTFS source: " + sourceSystem);
        }
        Map<String, RouteInfo> routes = new HashMap<>();
        Map<String, TripInfo> trips = new HashMap<>();
        Map<String, StopInfo> stops = new HashMap<>();
        List<RegionalGtfsScheduleImport.Service> services = new ArrayList<>();
        List<RegionalGtfsScheduleImport.ServiceException> exceptions = new ArrayList<>();
        List<RegionalGtfsScheduleImport.Departure> departures = new ArrayList<>();
        Set<String> serviceIds = new HashSet<>();
        LocalDate[] range = new LocalDate[2];

        try (ZipFile zip = new ZipFile(zipPath.toFile())) {
            forEach(zip, "routes.txt", row -> {
                String lineId = lineId(sourceSystem, row);
                if (lineId != null) {
                    routes.put(row.value("route_id"), new RouteInfo(lineId, row.value("route_long_name")));
                }
            });
            forEach(zip, "trips.txt", row -> {
                RouteInfo route = routes.get(row.value("route_id"));
                if (route != null) {
                    String serviceId = row.value("service_id");
                    serviceIds.add(serviceId);
                    trips.put(row.value("trip_id"), new TripInfo(
                        route.lineId(), serviceId,
                        firstNonBlank(row.value("trip_headsign"), route.name())
                    ));
                }
            });
            forEach(zip, "stops.txt", row -> stops.put(row.value("stop_id"), new StopInfo(
                row.value("stop_code"), row.value("parent_station"), row.value("platform_code")
            )));
            forEachOptional(zip, "calendar.txt", row -> {
                if (!serviceIds.contains(row.value("service_id"))) return;
                LocalDate start = date(row.value("start_date"));
                LocalDate end = date(row.value("end_date"));
                extendRange(range, start);
                extendRange(range, end);
                services.add(new RegionalGtfsScheduleImport.Service(
                    row.value("service_id"),
                    "1".equals(row.value("monday")), "1".equals(row.value("tuesday")),
                    "1".equals(row.value("wednesday")), "1".equals(row.value("thursday")),
                    "1".equals(row.value("friday")), "1".equals(row.value("saturday")),
                    "1".equals(row.value("sunday")), start, end
                ));
            });
            forEachOptional(zip, "calendar_dates.txt", row -> {
                if (!serviceIds.contains(row.value("service_id"))) return;
                LocalDate serviceDate = date(row.value("date"));
                extendRange(range, serviceDate);
                exceptions.add(new RegionalGtfsScheduleImport.ServiceException(
                    row.value("service_id"), serviceDate, Integer.parseInt(row.value("exception_type"))
                ));
            });
            forEach(zip, "stop_times.txt", row -> {
                TripInfo trip = trips.get(row.value("trip_id"));
                StopInfo stop = stops.get(row.value("stop_id"));
                if (trip == null || stop == null) return;
                String stationId = stationId(stop, stops, row.value("stop_id"));
                if (stationId == null || RegionalNetworkCatalog.route(trip.lineId())
                    .map(route -> !route.stationIds().contains(stationId)).orElse(true)) return;
                String departureTime = firstNonBlank(row.value("departure_time"), row.value("arrival_time"));
                if (departureTime.isBlank()) return;
                departures.add(new RegionalGtfsScheduleImport.Departure(
                    stationId, trip.lineId(), trip.serviceId(), row.value("trip_id"),
                    trip.direction(), GtfsCsvReader.seconds(departureTime), stop.platform()
                ));
            });
        }

        if (routes.isEmpty() || trips.isEmpty() || departures.isEmpty() || range[0] == null || range[1] == null) {
            throw new IOException("Regional GTFS feed did not contain mapped rail schedule coverage");
        }
        RegionalGtfsScheduleImport schedule = new RegionalGtfsScheduleImport(
            sourceSystem, sourceUrl, range[0], range[1], services, exceptions, departures
        );
        long importId = repository.replace(schedule, OffsetDateTime.now(clock));
        return new ImportSummary(importId, sourceSystem, routes.size(), trips.size(), departures.size(), range[0], range[1]);
    }

    private String lineId(String sourceSystem, GtfsCsvReader.Row row) {
        if ("up".equals(sourceSystem)) return "regional-up";
        if (!row.value("route_type").isBlank() && !"2".equals(row.value("route_type"))) return null;
        for (String candidate : List.of(row.value("route_short_name"), row.value("route_long_name"), row.value("route_id"))) {
            var direct = RegionalNetworkCatalog.lineIdForSourceCode(candidate);
            if (direct.isPresent() && !"regional-up".equals(direct.get())) return direct.get();
            String normalized = candidate.toLowerCase(Locale.CANADA);
            if (normalized.contains("lakeshore east")) return "regional-le";
            if (normalized.contains("lakeshore west")) return "regional-lw";
            if (normalized.contains("richmond hill")) return "regional-rh";
            if (normalized.contains("kitchener") || normalized.contains("georgetown")) return "regional-ki";
            if (normalized.contains("stouffville")) return "regional-st";
            if (normalized.contains("barrie")) return "regional-br";
            if (normalized.contains("milton")) return "regional-mi";
        }
        return null;
    }

    private String stationId(StopInfo stop, Map<String, StopInfo> stops, String stopId) {
        for (String code : List.of(stop.code(), stopId)) {
            var mapped = RegionalNetworkCatalog.stationIdForStopCode(code);
            if (mapped.isPresent()) return mapped.get();
        }
        StopInfo parent = stops.get(stop.parentId());
        if (parent != null) {
            return RegionalNetworkCatalog.stationIdForStopCode(parent.code())
                .or(() -> RegionalNetworkCatalog.stationIdForStopCode(stop.parentId()))
                .orElse(null);
        }
        return null;
    }

    private void forEach(ZipFile zip, String name, Consumer<GtfsCsvReader.Row> consumer) throws IOException {
        ZipEntry entry = zip.getEntry(name);
        if (entry == null) throw new IOException("Regional GTFS zip did not contain " + name);
        read(zip, entry, consumer);
    }

    private void forEachOptional(ZipFile zip, String name, Consumer<GtfsCsvReader.Row> consumer) throws IOException {
        ZipEntry entry = zip.getEntry(name);
        if (entry != null) read(zip, entry, consumer);
    }

    private void read(ZipFile zip, ZipEntry entry, Consumer<GtfsCsvReader.Row> consumer) throws IOException {
        try (InputStream input = zip.getInputStream(entry);
             InputStreamReader reader = new InputStreamReader(input, StandardCharsets.UTF_8)) {
            GtfsCsvReader.forEachRow(reader, consumer);
        }
    }

    private LocalDate date(String value) {
        return value.isBlank() ? null : LocalDate.parse(value, GTFS_DATE);
    }

    private void extendRange(LocalDate[] range, LocalDate value) {
        if (value == null) return;
        if (range[0] == null || value.isBefore(range[0])) range[0] = value;
        if (range[1] == null || value.isAfter(range[1])) range[1] = value;
    }

    private String firstNonBlank(String first, String second) {
        return first == null || first.isBlank() ? second == null ? "" : second : first;
    }

    private record RouteInfo(String lineId, String name) {}
    private record TripInfo(String lineId, String serviceId, String direction) {}
    private record StopInfo(String code, String parentId, String platform) {}
    public record ImportSummary(
        long importId, String sourceSystem, int routes, int trips, int departures,
        LocalDate serviceStart, LocalDate serviceEnd
    ) {}
}
