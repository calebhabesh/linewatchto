package com.calebhabesh.linewatch.arrival.schedule;

import java.io.BufferedReader;
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
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import org.springframework.stereotype.Service;

@Service
public class GtfsScheduleImportService {
    private final GtfsScheduleImportRepository repository;
    private final Clock clock;

    public GtfsScheduleImportService(GtfsScheduleImportRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public ImportSummary importZip(Path zipPath, String sourceUrl) throws IOException {
        DateTimeFormatter dateGen = DateTimeFormatter.ofPattern("yyyyMMdd");
        List<GtfsImportModels.RouteRow> routes = new ArrayList<>();
        List<GtfsImportModels.StopRow> stops = new ArrayList<>();
        List<GtfsImportModels.ServiceRow> services = new ArrayList<>();
        List<GtfsImportModels.ServiceExceptionRow> serviceExceptions = new ArrayList<>();
        List<GtfsImportModels.TripRow> trips = new ArrayList<>();
        List<GtfsImportModels.StopTimeRow> stopTimes = new ArrayList<>();
        List<GtfsImportModels.StationStopRow> stationStops = new ArrayList<>();

        Set<String> rapidTransitRouteIds = new HashSet<>();
        Map<String, String> routeIdToLineId = new HashMap<>();
        Set<String> rapidTransitTripIds = new HashSet<>();
        Set<String> rapidTransitServiceIds = new HashSet<>();
        Set<String> rapidTransitStopIds = new HashSet<>();

        try (ZipFile zipFile = new ZipFile(zipPath.toFile())) {
            // 1. Process routes.txt
            ZipEntry routesEntry = zipFile.getEntry("routes.txt");
            if (routesEntry != null) {
                try (InputStream is = zipFile.getInputStream(routesEntry);
                     InputStreamReader isr = new InputStreamReader(is, StandardCharsets.UTF_8)) {
                    List<GtfsCsvReader.Row> rows = GtfsCsvReader.read(isr);
                    for (GtfsCsvReader.Row row : rows) {
                        String routeShortName = row.value("route_short_name");
                        if (routeShortName.equals("1") || routeShortName.equals("2") ||
                            routeShortName.equals("4") || routeShortName.equals("5") ||
                            routeShortName.equals("6")) {
                            String lineId = "line-" + routeShortName;
                            String routeId = row.value("route_id");
                            rapidTransitRouteIds.add(routeId);
                            routeIdToLineId.put(routeId, lineId);
                            routes.add(new GtfsImportModels.RouteRow(
                                routeId,
                                lineId,
                                routeShortName,
                                row.value("route_long_name")
                            ));
                        }
                    }
                }
            }

            // 2. Process trips.txt
            ZipEntry tripsEntry = zipFile.getEntry("trips.txt");
            if (tripsEntry != null) {
                try (InputStream is = zipFile.getInputStream(tripsEntry);
                     InputStreamReader isr = new InputStreamReader(is, StandardCharsets.UTF_8)) {
                    List<GtfsCsvReader.Row> rows = GtfsCsvReader.read(isr);
                    for (GtfsCsvReader.Row row : rows) {
                        String routeId = row.value("route_id");
                        if (rapidTransitRouteIds.contains(routeId)) {
                            String tripId = row.value("trip_id");
                            String serviceId = row.value("service_id");
                            rapidTransitTripIds.add(tripId);
                            rapidTransitServiceIds.add(serviceId);
                            Integer directionId = null;
                            String dirVal = row.value("direction_id");
                            if (!dirVal.isEmpty()) {
                                try {
                                    directionId = Integer.parseInt(dirVal);
                                } catch (NumberFormatException ignored) {}
                            }
                            trips.add(new GtfsImportModels.TripRow(
                                tripId,
                                routeId,
                                serviceId,
                                row.value("trip_headsign"),
                                directionId
                            ));
                        }
                    }
                }
            }

            // 3. Process stop_times.txt
            ZipEntry stopTimesEntry = zipFile.getEntry("stop_times.txt");
            if (stopTimesEntry != null) {
                try (InputStream is = zipFile.getInputStream(stopTimesEntry);
                     InputStreamReader isr = new InputStreamReader(is, StandardCharsets.UTF_8)) {
                    List<GtfsCsvReader.Row> rows = GtfsCsvReader.read(isr);
                    for (GtfsCsvReader.Row row : rows) {
                        String tripId = row.value("trip_id");
                        if (rapidTransitTripIds.contains(tripId)) {
                            String stopId = row.value("stop_id");
                            rapidTransitStopIds.add(stopId);
                            stopTimes.add(new GtfsImportModels.StopTimeRow(
                                tripId,
                                stopId,
                                GtfsCsvReader.seconds(row.value("arrival_time")),
                                GtfsCsvReader.seconds(row.value("departure_time")),
                                Integer.parseInt(row.value("stop_sequence"))
                            ));
                        }
                    }
                }
            }

            // 4. Process stops.txt
            Map<String, GtfsImportModels.StopRow> allStopsById = new HashMap<>();
            ZipEntry stopsEntry = zipFile.getEntry("stops.txt");
            if (stopsEntry != null) {
                try (InputStream is = zipFile.getInputStream(stopsEntry);
                     InputStreamReader isr = new InputStreamReader(is, StandardCharsets.UTF_8)) {
                    List<GtfsCsvReader.Row> rows = GtfsCsvReader.read(isr);
                    for (GtfsCsvReader.Row row : rows) {
                        String stopId = row.value("stop_id");
                        allStopsById.put(stopId, new GtfsImportModels.StopRow(
                            stopId,
                            row.value("stop_name"),
                            row.value("parent_station")
                        ));
                    }
                }
            }

            // Filter stops and parent stations
            Set<String> stopsToKeep = new HashSet<>(rapidTransitStopIds);
            for (String stopId : rapidTransitStopIds) {
                GtfsImportModels.StopRow r = allStopsById.get(stopId);
                if (r != null && !r.parentStation().isEmpty()) {
                    stopsToKeep.add(r.parentStation());
                }
            }
            for (String stopId : stopsToKeep) {
                GtfsImportModels.StopRow r = allStopsById.get(stopId);
                if (r != null) {
                    stops.add(r);
                }
            }

            // Load station-line aliases
            Map<String, Set<StationLineKey>> normalizedAliasToStationLine = new HashMap<>();
            try (InputStream is = getClass().getResourceAsStream("/arrival/rapid-transit-station-aliases.csv")) {
                if (is != null) {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                        String header = reader.readLine(); // skip header
                        String line;
                        while ((line = reader.readLine()) != null) {
                            String[] parts = line.split(",", 3);
                            if (parts.length == 3) {
                                String stationId = parts[0];
                                String lineId = parts[1];
                                String[] aliases = parts[2].split("\\|");
                                for (String alias : aliases) {
                                    String norm = GtfsCsvReader.normalizeStationName(alias);
                                    if (!norm.isEmpty()) {
                                        normalizedAliasToStationLine.computeIfAbsent(norm, k -> new HashSet<>())
                                            .add(new StationLineKey(stationId, lineId));
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Resolve station stops
            Set<String> addedStationStops = new HashSet<>();
            for (String stopId : rapidTransitStopIds) {
                GtfsImportModels.StopRow stopRow = allStopsById.get(stopId);
                if (stopRow != null) {
                    String normStopName = GtfsCsvReader.normalizeStationName(stopRow.stopName());
                    String normParentName = "";
                    if (!stopRow.parentStation().isEmpty()) {
                        GtfsImportModels.StopRow parentRow = allStopsById.get(stopRow.parentStation());
                        if (parentRow != null) {
                            normParentName = GtfsCsvReader.normalizeStationName(parentRow.stopName());
                        }
                    }

                    Set<StationLineKey> matches = new HashSet<>();
                    if (normalizedAliasToStationLine.containsKey(normStopName)) {
                        matches.addAll(normalizedAliasToStationLine.get(normStopName));
                    }
                    if (!normParentName.isEmpty() && normalizedAliasToStationLine.containsKey(normParentName)) {
                        matches.addAll(normalizedAliasToStationLine.get(normParentName));
                    }

                    for (StationLineKey match : matches) {
                        String key = match.stationId() + "|" + match.lineId() + "|" + stopId;
                        if (!addedStationStops.contains(key)) {
                            addedStationStops.add(key);
                            stationStops.add(new GtfsImportModels.StationStopRow(
                                match.stationId(),
                                match.lineId(),
                                stopId
                            ));
                        }
                    }
                }
            }

            // 5. Process calendar.txt
            LocalDate serviceStart = null;
            LocalDate serviceEnd = null;
            ZipEntry calendarEntry = zipFile.getEntry("calendar.txt");
            if (calendarEntry != null) {
                try (InputStream is = zipFile.getInputStream(calendarEntry);
                     InputStreamReader isr = new InputStreamReader(is, StandardCharsets.UTF_8)) {
                    List<GtfsCsvReader.Row> rows = GtfsCsvReader.read(isr);
                    for (GtfsCsvReader.Row row : rows) {
                        String serviceId = row.value("service_id");
                        if (rapidTransitServiceIds.contains(serviceId)) {
                            LocalDate start = LocalDate.parse(row.value("start_date"), dateGen);
                            LocalDate end = LocalDate.parse(row.value("end_date"), dateGen);
                            if (serviceStart == null || start.isBefore(serviceStart)) {
                                serviceStart = start;
                            }
                            if (serviceEnd == null || end.isAfter(serviceEnd)) {
                                serviceEnd = end;
                            }
                            services.add(new GtfsImportModels.ServiceRow(
                                serviceId,
                                row.value("monday").equals("1"),
                                row.value("tuesday").equals("1"),
                                row.value("wednesday").equals("1"),
                                row.value("thursday").equals("1"),
                                row.value("friday").equals("1"),
                                row.value("saturday").equals("1"),
                                row.value("sunday").equals("1"),
                                start,
                                end
                            ));
                        }
                    }
                }
            }

            // 6. Process calendar_dates.txt
            ZipEntry calendarDatesEntry = zipFile.getEntry("calendar_dates.txt");
            if (calendarDatesEntry != null) {
                try (InputStream is = zipFile.getInputStream(calendarDatesEntry);
                     InputStreamReader isr = new InputStreamReader(is, StandardCharsets.UTF_8)) {
                    List<GtfsCsvReader.Row> rows = GtfsCsvReader.read(isr);
                    for (GtfsCsvReader.Row row : rows) {
                        String serviceId = row.value("service_id");
                        if (rapidTransitServiceIds.contains(serviceId)) {
                            serviceExceptions.add(new GtfsImportModels.ServiceExceptionRow(
                                serviceId,
                                LocalDate.parse(row.value("date"), dateGen),
                                Integer.parseInt(row.value("exception_type"))
                            ));
                        }
                    }
                }
            }

            // Database Insertion
            long importId = repository.beginReplacementImport(
                "TTC merged GTFS schedule",
                sourceUrl,
                OffsetDateTime.now(clock),
                serviceStart,
                serviceEnd
            );

            repository.insertRoutes(importId, routes);
            repository.insertStops(importId, stops);
            repository.insertServices(importId, services);
            repository.insertServiceExceptions(importId, serviceExceptions);
            repository.insertTrips(importId, trips);
            repository.insertStopTimes(importId, stopTimes);
            repository.insertStationStops(importId, stationStops);
            repository.activateImport(importId);

            return new GtfsScheduleImportService.ImportSummary(
                importId,
                routes.size(),
                stops.size(),
                services.size(),
                serviceExceptions.size(),
                trips.size(),
                stopTimes.size(),
                stationStops.size()
            );
        }
    }

    private record StationLineKey(String stationId, String lineId) {
    }

    public record ImportSummary(
        long importId,
        int routes,
        int stops,
        int services,
        int serviceExceptions,
        int trips,
        int stopTimes,
        int stationStops
    ) {
    }
}
