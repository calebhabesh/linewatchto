package com.calebhabesh.linewatch.arrival.schedule;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import org.springframework.stereotype.Service;

@Service
public class GtfsScheduleImportService {
    private static final Pattern BAY_PLATFORM = Pattern.compile(
        "(?i)\\b(Bay\\s+[A-Za-z0-9-]+(?:\\s*,\\s*Platform\\s+[A-Za-z0-9-]+)?|Streetcar\\s+Platform|Platform\\s+[A-Za-z0-9-]+)\\b"
    );
    private final GtfsScheduleImportWriter writer;

    public GtfsScheduleImportService(GtfsScheduleImportWriter writer) {
        this.writer = writer;
    }

    public ImportSummary importZip(Path zipPath, String sourceUrl) throws IOException {
        DateTimeFormatter dateGen = DateTimeFormatter.ofPattern("yyyyMMdd");
        List<GtfsImportModels.RouteRow> routes = new ArrayList<>();
        List<GtfsImportModels.StopRow> stops = new ArrayList<>();
        List<GtfsImportModels.ServiceRow> services = new ArrayList<>();
        List<GtfsImportModels.ServiceExceptionRow> serviceExceptions = new ArrayList<>();
        List<GtfsImportModels.TripRow> trips = new ArrayList<>();
        List<GtfsImportModels.StationStopRow> stationStops = new ArrayList<>();
        List<GtfsImportModels.SurfaceRouteRow> surfaceRoutes = new ArrayList<>();
        List<GtfsImportModels.SurfaceStationStopRow> surfaceStationStops = new ArrayList<>();
        List<GtfsImportModels.SurfaceTripRow> surfaceTrips = new ArrayList<>();
        List<GtfsImportModels.SurfaceStationConnectionRow> surfaceStationConnections = new ArrayList<>();

        Set<String> rapidTransitRouteIds = new HashSet<>();
        Map<String, String> routeIdToLineId = new HashMap<>();
        Set<String> surfaceRouteIds = new HashSet<>();
        Set<String> rapidTransitTripIds = new HashSet<>();
        Set<String> surfaceTripIds = new HashSet<>();
        Map<String, Set<String>> surfaceTripsByStop = new HashMap<>();
        Set<String> rapidTransitServiceIds = new HashSet<>();
        Set<String> rapidTransitStopIds = new HashSet<>();

        final LocalDate[] dateRange = new LocalDate[2]; // 0: start, 1: end

        try (ZipFile zipFile = new ZipFile(zipPath.toFile())) {
            // 1. Process routes.txt
            forEachRow(zipFile, "routes.txt", row -> {
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
                } else {
                    String mode = switch (row.value("route_type")) {
                        case "0" -> "streetcar";
                        case "3" -> "bus";
                        default -> "";
                    };
                    if (!mode.isEmpty()) {
                        String routeId = row.value("route_id");
                        surfaceRouteIds.add(routeId);
                        surfaceRoutes.add(new GtfsImportModels.SurfaceRouteRow(
                            routeId,
                            routeShortName,
                            row.value("route_long_name"),
                            mode
                        ));
                    }
                }
            });

            // 2. Process trips.txt
            forEachRow(zipFile, "trips.txt", row -> {
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
            });

            // 3. Load stops before the first stop-time pass so parent-linked
            // surface stops can be selected without geographic inference.
            Map<String, GtfsImportModels.StopRow> allStopsById = new HashMap<>();
            forEachRow(zipFile, "stops.txt", row -> {
                String stopId = row.value("stop_id");
                allStopsById.put(stopId, new GtfsImportModels.StopRow(
                    stopId,
                    row.value("stop_name"),
                    row.value("parent_station")
                ));
            });

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

            Map<String, Set<String>> normalizedAliasToStations = new HashMap<>();
            normalizedAliasToStationLine.forEach((alias, matches) -> {
                Set<String> stationIds = new HashSet<>();
                matches.forEach(match -> stationIds.add(match.stationId()));
                normalizedAliasToStations.put(alias, stationIds);
            });

            Set<String> mappedSurfaceStopIds = new HashSet<>();
            for (GtfsImportModels.StopRow stop : allStopsById.values()) {
                if (stop.parentStation().isEmpty()) continue;
                GtfsImportModels.StopRow parent = allStopsById.get(stop.parentStation());
                if (parent == null) continue;
                Set<String> stationIds = normalizedAliasToStations.getOrDefault(
                    GtfsCsvReader.normalizeStationName(parent.stopName()), Set.of()
                );
                if (stationIds.size() != 1) continue;
                mappedSurfaceStopIds.add(stop.stopId());
                surfaceStationStops.add(new GtfsImportModels.SurfaceStationStopRow(
                    stop.stopId(),
                    stationIds.iterator().next(),
                    stop.stopName(),
                    stop.parentStation(),
                    bayPlatform(stop.stopName())
                ));
            }

            // 4. First stop-time pass: collect rapid-transit stops and retain
            // only surface trips that actually serve a parent-linked station stop.
            forEachRow(zipFile, "stop_times.txt", row -> {
                String tripId = row.value("trip_id");
                if (rapidTransitTripIds.contains(tripId)) {
                    rapidTransitStopIds.add(row.value("stop_id"));
                }
                if (mappedSurfaceStopIds.contains(row.value("stop_id"))) {
                    surfaceTripIds.add(tripId);
                    surfaceTripsByStop.computeIfAbsent(row.value("stop_id"), ignored -> new HashSet<>())
                        .add(tripId);
                }
            });

            // A second, small trips.txt read avoids retaining every TTC surface
            // trip in heap while the 4.2M-row stop_times.txt is streamed.
            Set<String> validSurfaceTripIds = new HashSet<>();
            forEachRow(zipFile, "trips.txt", row -> {
                if (surfaceTripIds.contains(row.value("trip_id"))
                    && surfaceRouteIds.contains(row.value("route_id"))) {
                    validSurfaceTripIds.add(row.value("trip_id"));
                    surfaceTrips.add(new GtfsImportModels.SurfaceTripRow(
                        row.value("trip_id"),
                        row.value("route_id"),
                        row.value("trip_headsign")
                    ));
                }
            });
            surfaceStationStops.removeIf(stop -> surfaceTripsByStop
                .getOrDefault(stop.stopId(), Set.of())
                .stream()
                .noneMatch(validSurfaceTripIds::contains));

            surfaceStationConnections.clear();
            Map<String, GtfsImportModels.SurfaceRouteRow> routesById = surfaceRoutes.stream()
                .collect(Collectors.toMap(GtfsImportModels.SurfaceRouteRow::routeId, java.util.function.Function.identity(), (a, b) -> a));
            Map<String, GtfsImportModels.SurfaceTripRow> tripsById = surfaceTrips.stream()
                .collect(Collectors.toMap(GtfsImportModels.SurfaceTripRow::tripId, java.util.function.Function.identity(), (a, b) -> a));

            Set<String> uniqueConnections = new HashSet<>();
            for (GtfsImportModels.SurfaceStationStopRow stop : surfaceStationStops) {
                Set<String> tripIds = surfaceTripsByStop.getOrDefault(stop.stopId(), Set.of());
                for (String tripId : tripIds) {
                    GtfsImportModels.SurfaceTripRow trip = tripsById.get(tripId);
                    if (trip == null) continue;
                    GtfsImportModels.SurfaceRouteRow route = routesById.get(trip.routeId());
                    if (route == null) continue;
                    String destination = trip.tripHeadsign() != null && !trip.tripHeadsign().isBlank()
                        ? trip.tripHeadsign()
                        : route.longName();
                    String key = stop.stationId() + ":" + stop.stopId() + ":" + route.routeId() + ":" + destination;
                    if (uniqueConnections.add(key)) {
                        surfaceStationConnections.add(new GtfsImportModels.SurfaceStationConnectionRow(
                            stop.stationId(),
                            stop.stopId(),
                            route.routeId(),
                            route.mode(),
                            route.shortName(),
                            route.longName(),
                            destination,
                            stop.bayPlatform(),
                            stop.stopName()
                        ));
                    }
                }
            }

            // Filter rapid-transit stops and parent stations for the schedule tables.
            Set<String> stopsToKeep = new HashSet<>(rapidTransitStopIds);
            for (String stopId : rapidTransitStopIds) {
                GtfsImportModels.StopRow r = allStopsById.get(stopId);
                if (r != null && !r.parentStation().isEmpty()) {
                    stopsToKeep.add(r.parentStation());
                }
            }
            for (String stopId : stopsToKeep) {
                GtfsImportModels.StopRow r = allStopsById.get(stopId);
                if (r != null) stops.add(r);
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
            forEachRow(zipFile, "calendar.txt", row -> {
                String serviceId = row.value("service_id");
                if (rapidTransitServiceIds.contains(serviceId)) {
                    LocalDate start = LocalDate.parse(row.value("start_date"), dateGen);
                    LocalDate end = LocalDate.parse(row.value("end_date"), dateGen);
                    if (dateRange[0] == null || start.isBefore(dateRange[0])) {
                        dateRange[0] = start;
                    }
                    if (dateRange[1] == null || end.isAfter(dateRange[1])) {
                        dateRange[1] = end;
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
            });

            // 6. Process calendar_dates.txt
            forEachRowOptional(zipFile, "calendar_dates.txt", row -> {
                String serviceId = row.value("service_id");
                if (rapidTransitServiceIds.contains(serviceId)) {
                    serviceExceptions.add(new GtfsImportModels.ServiceExceptionRow(
                        serviceId,
                        LocalDate.parse(row.value("date"), dateGen),
                        Integer.parseInt(row.value("exception_type"))
                    ));
                }
            });
        }

        GtfsSchedulePreparedImport prepared = new GtfsSchedulePreparedImport(
            routes,
            stops,
            services,
            serviceExceptions,
            trips,
            stationStops,
            surfaceRoutes,
            surfaceStationStops,
            surfaceTrips,
            surfaceStationConnections,
            rapidTransitTripIds,
            dateRange[0],
            dateRange[1]
        );

        return writer.write(zipPath, sourceUrl, prepared);
    }

    static String bayPlatform(String stopName) {
        if (stopName == null) return "";
        Matcher matcher = BAY_PLATFORM.matcher(stopName);
        return matcher.find() ? matcher.group(1).replaceAll("\\s+", " ").trim() : "";
    }

    private void forEachRow(
        ZipFile zipFile,
        String entryName,
        Consumer<GtfsCsvReader.Row> consumer
    ) throws IOException {
        ZipEntry entry = zipFile.getEntry(entryName);
        if (entry == null) {
            throw new IOException("TTC GTFS zip did not contain " + entryName);
        }
        try (InputStream input = zipFile.getInputStream(entry);
             InputStreamReader reader = new InputStreamReader(input, StandardCharsets.UTF_8)) {
            GtfsCsvReader.forEachRow(reader, consumer);
        }
    }

    private void forEachRowOptional(
        ZipFile zipFile,
        String entryName,
        Consumer<GtfsCsvReader.Row> consumer
    ) throws IOException {
        ZipEntry entry = zipFile.getEntry(entryName);
        if (entry == null) {
            return;
        }
        try (InputStream input = zipFile.getInputStream(entry);
             InputStreamReader reader = new InputStreamReader(input, StandardCharsets.UTF_8)) {
            GtfsCsvReader.forEachRow(reader, consumer);
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
