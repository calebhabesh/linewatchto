package com.calebhabesh.linewatch.surfacearrival;

import com.calebhabesh.linewatch.surfacearrival.TtcSurfaceStopResponses.Departure;
import com.calebhabesh.linewatch.surfacearrival.TtcSurfaceStopResponses.LiveSource;
import com.calebhabesh.linewatch.surfacearrival.TtcSurfaceStopResponses.RouteDepartures;
import com.calebhabesh.linewatch.surfacearrival.TtcSurfaceStopResponses.ScheduleSource;
import com.calebhabesh.linewatch.surfacearrival.TtcSurfaceStopResponses.StopArrivalsResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Departures by stop code for any TTC surface stop. Fresh live predictions come first; scheduled
 * departures fill the rest and are labelled as such. A stale or missing live source is reported
 * in {@code live.state}; its predictions are never returned.
 */
@Service
public class TtcSurfaceStopArrivalService {
    private static final Pattern STOP_CODE = Pattern.compile("[0-9A-Za-z]{1,12}");
    private static final List<String> MODES = List.of("bus", "streetcar");
    /**
     * A route with nothing in the horizon (a night route by day) shows its next scheduled
     * departures within this window rather than an empty row.
     */
    static final Duration NEXT_SCHEDULED_LOOKAHEAD = Duration.ofHours(24);

    private final TtcSurfaceStopRepository stops;
    private final TtcSurfaceArrivalCache cache;
    private final TtcSurfaceScheduledArrivalRepository scheduled;
    private final SurfaceArrivalProperties properties;
    private final Clock clock;

    public TtcSurfaceStopArrivalService(
        TtcSurfaceStopRepository stops,
        TtcSurfaceArrivalCache cache,
        TtcSurfaceScheduledArrivalRepository scheduled,
        SurfaceArrivalProperties properties,
        Clock clock
    ) {
        this.stops = stops;
        this.cache = cache;
        this.scheduled = scheduled;
        this.properties = properties;
        this.clock = clock;
    }

    /** Empty when the stop code is malformed or no retained TTC schedule has it (HTTP 404). */
    public Optional<StopArrivalsResponse> arrivals(String stopCode) {
        if (stopCode == null || !STOP_CODE.matcher(stopCode).matches()) return Optional.empty();
        OffsetDateTime now = OffsetDateTime.now(clock);
        int horizonMinutes = (int) properties.getHorizon().toMinutes();
        Optional<TtcSurfaceStopRepository.ActiveCatalog> catalog = stops.activeCatalog();
        if (catalog.isEmpty() || !catalog.get().stopCatalogAvailable()) {
            return Optional.of(new StopArrivalsResponse("ttc", stopCode, null, null, null, null, null,
                "unavailable", "TTC stop data has not loaded yet.", now, horizonMinutes,
                liveSource(now, Set.copyOf(MODES)), new ScheduleSource("unavailable", null, null,
                    TtcSurfaceScheduledArrivalRepository.SOURCE), List.of()));
        }
        TtcSurfaceStopRepository.ActiveCatalog active = catalog.get();
        Optional<TtcSurfaceStopRepository.Stop> found = stops.findStop(active.importId(), stopCode);
        if (found.isEmpty()) {
            return stops.findStopInOtherImport(active.importId(), stopCode).map(stop -> new StopArrivalsResponse(
                "ttc", stopCode, stop.stopId(), stop.stopName(), stop.stationId(), stop.latitude(), stop.longitude(),
                "not-in-schedule", "This stop is not in the current TTC schedule.", now, horizonMinutes,
                liveSource(now, Set.copyOf(MODES)), new ScheduleSource("unavailable", active.serviceStart(),
                    active.serviceEnd(), TtcSurfaceScheduledArrivalRepository.SOURCE), List.of()));
        }
        TtcSurfaceStopRepository.Stop stop = found.get();
        List<TtcSurfaceStopRepository.StopRoute> routes = stops.routes(active.importId(), stop.stopId());
        Set<String> modes = new HashSet<>();
        routes.forEach(route -> modes.add(route.mode()));
        if (modes.isEmpty()) modes.addAll(MODES);
        ScheduleSource schedule = new ScheduleSource("available", active.serviceStart(), active.serviceEnd(),
            TtcSurfaceScheduledArrivalRepository.SOURCE);

        if (!properties.isTtcEnabled()) {
            return Optional.of(response(stop, "disabled", "TTC stop departures are turned off.", now, horizonMinutes,
                new LiveSource("disabled", null, properties.getTtcMaxSourceAge().toSeconds(), TtcSurfaceArrivalIndexer.SOURCE),
                schedule, groups(routes, List.of(), List.of(), List.of(), now)));
        }

        LiveSource live = liveSource(now, modes);
        List<TtcSurfaceStopArrival> liveRows = new ArrayList<>();
        if ("live".equals(live.state())) {
            Set<String> seen = new HashSet<>();
            for (String mode : MODES) {
                cache.get(mode).ifPresent(snapshot -> snapshot.arrivalsAt(stop.stopId()).stream()
                    .filter(row -> inWindow(row.predictedAt(), now))
                    .filter(row -> seen.add(row.tripId().isBlank() ? row.routeId() + ":" + row.predictedAt() : row.tripId()))
                    .forEach(liveRows::add));
            }
        }
        Duration lookahead = properties.getHorizon().compareTo(NEXT_SCHEDULED_LOOKAHEAD) >= 0
            ? properties.getHorizon() : NEXT_SCHEDULED_LOOKAHEAD;
        List<TtcSurfaceStopArrival> upcoming = scheduled.stopArrivals(stop.stopId(), now, lookahead).stream()
            .filter(row -> row.scheduledAt() != null && !row.scheduledAt().isBefore(now.minusMinutes(1)))
            .toList();
        List<TtcSurfaceStopArrival> scheduledRows = upcoming.stream().filter(row -> inWindow(row.scheduledAt(), now)).toList();
        List<TtcSurfaceStopArrival> laterRows = upcoming.stream()
            .filter(row -> row.scheduledAt().isAfter(now.plus(properties.getHorizon()))).toList();
        List<RouteDepartures> grouped = groups(routes, liveRows, scheduledRows, laterRows, now);
        boolean any = grouped.stream().anyMatch(group -> !group.departures().isEmpty());
        String message = any ? null : "No departures in the next " + horizonLabel(horizonMinutes) + ".";
        return Optional.of(response(stop, any ? "available" : "no-departures", message, now, horizonMinutes,
            live, schedule, grouped));
    }

    private LiveSource liveSource(OffsetDateTime now, Set<String> modes) {
        long maxAge = properties.getTtcMaxSourceAge().toSeconds();
        if (!properties.isTtcEnabled()) {
            return new LiveSource("disabled", null, maxAge, TtcSurfaceArrivalIndexer.SOURCE);
        }
        List<TtcSurfaceArrivalSnapshot> snapshots = modes.stream().map(cache::get).flatMap(Optional::stream).toList();
        if (snapshots.isEmpty()) return new LiveSource("unavailable", null, maxAge, TtcSurfaceArrivalIndexer.SOURCE);
        OffsetDateTime oldest = snapshots.stream().map(TtcSurfaceArrivalSnapshot::sourceUpdatedAt)
            .min(Comparator.nullsFirst(Comparator.naturalOrder())).orElse(null);
        // Both modes come from one feed; a stop is live only if every mode it serves is fresh.
        boolean fresh = snapshots.size() == modes.size() && oldest != null
            && Duration.between(oldest, now).compareTo(properties.getTtcMaxSourceAge()) <= 0;
        return new LiveSource(fresh ? "live" : "stale", oldest, maxAge, TtcSurfaceArrivalIndexer.SOURCE);
    }

    private boolean inWindow(OffsetDateTime at, OffsetDateTime now) {
        return at != null && !at.isBefore(now.minusMinutes(1)) && !at.isAfter(now.plus(properties.getHorizon()));
    }

    private List<RouteDepartures> groups(
        List<TtcSurfaceStopRepository.StopRoute> routes,
        List<TtcSurfaceStopArrival> liveRows,
        List<TtcSurfaceStopArrival> scheduledRows,
        List<TtcSurfaceStopArrival> laterRows,
        OffsetDateTime now
    ) {
        Map<String, Group> groups = new LinkedHashMap<>();
        for (TtcSurfaceStopRepository.StopRoute route : routes) {
            groups.computeIfAbsent(key(route.routeId(), route.destination()), ignored ->
                new Group(route.route(), route.routeName(), route.mode(), route.destination()));
        }
        Set<String> liveTrips = new HashSet<>();
        for (TtcSurfaceStopArrival row : liveRows) {
            if (!row.tripId().isBlank()) liveTrips.add(row.tripId());
            group(groups, row).live.add(row);
        }
        for (TtcSurfaceStopArrival row : scheduledRows) {
            if (liveTrips.contains(row.tripId())) continue;
            group(groups, row).scheduled.add(row);
        }
        for (TtcSurfaceStopArrival row : laterRows) {
            group(groups, row).later.add(row);
        }
        int limit = Math.max(1, properties.getMaxArrivalsPerRoute());
        List<RouteDepartures> result = new ArrayList<>();
        for (Group group : groups.values()) {
            List<TtcSurfaceStopArrival> rows = new ArrayList<>(group.live);
            // Where a direction has predictions, a timetable trip without one before the last
            // prediction is most likely not running as scheduled; keep only later ones.
            OffsetDateTime lastLive = group.live.stream().map(TtcSurfaceStopArrival::predictedAt)
                .max(Comparator.naturalOrder()).orElse(null);
            group.scheduled.stream()
                .filter(row -> lastLive == null || row.scheduledAt().isAfter(lastLive))
                .forEach(rows::add);
            // Nothing in the horizon: the next scheduled departures, still labelled scheduled.
            if (rows.isEmpty()) rows.addAll(group.later);
            rows.sort(Comparator.comparing(TtcSurfaceStopArrival::eventTime));
            List<Departure> departures = rows.stream().limit(limit).map(row -> new Departure(
                row.status(), row.eventTime(), row.predictedAt(), row.scheduledAt(),
                Math.max(0, (int) Math.ceil(Duration.between(now, row.eventTime()).toSeconds() / 60.0))
            )).toList();
            result.add(new RouteDepartures(group.route, group.routeName, group.mode,
                group.destination.isBlank() ? group.routeName : group.destination, departures));
        }
        result.sort(Comparator
            .comparing((RouteDepartures group) -> group.departures().isEmpty() ? null : group.departures().getFirst().at(),
                Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(RouteDepartures::route, TtcSurfaceStopArrivalService::compareRoutes)
            .thenComparing(RouteDepartures::destination));
        return List.copyOf(result);
    }

    private Group group(Map<String, Group> groups, TtcSurfaceStopArrival row) {
        String destination = row.destination();
        if (destination.isBlank()) {
            // A realtime-only trip has no static headsign: use the route's only direction here, if one.
            List<String> matches = groups.entrySet().stream()
                .filter(entry -> entry.getKey().startsWith(row.routeId() + "\u0000"))
                .map(Map.Entry::getKey).toList();
            if (matches.size() == 1) return groups.get(matches.getFirst());
        }
        return groups.computeIfAbsent(key(row.routeId(), destination), ignored ->
            new Group(row.route(), row.routeName(), row.mode(), destination));
    }

    private static String key(String routeId, String destination) {
        return routeId + "\u0000" + destination;
    }

    static int compareRoutes(String left, String right) {
        String leftDigits = left.replaceAll("\\D.*", "");
        String rightDigits = right.replaceAll("\\D.*", "");
        if (!leftDigits.isEmpty() && !rightDigits.isEmpty() && !leftDigits.equals(rightDigits)) {
            return Integer.compare(Integer.parseInt(leftDigits), Integer.parseInt(rightDigits));
        }
        return left.compareTo(right);
    }

    private static String horizonLabel(int minutes) {
        if (minutes % 60 == 0) return minutes == 60 ? "hour" : (minutes / 60) + " hours";
        return minutes + " minutes";
    }

    private StopArrivalsResponse response(
        TtcSurfaceStopRepository.Stop stop,
        String availability,
        String message,
        OffsetDateTime now,
        int horizonMinutes,
        LiveSource live,
        ScheduleSource schedule,
        List<RouteDepartures> routes
    ) {
        return new StopArrivalsResponse("ttc", stop.stopCode(), stop.stopId(), stop.stopName(), stop.stationId(),
            stop.latitude(), stop.longitude(), availability, message, now, horizonMinutes, live, schedule, routes);
    }

    private static final class Group {
        private final String route;
        private final String routeName;
        private final String mode;
        private final String destination;
        private final List<TtcSurfaceStopArrival> live = new ArrayList<>();
        private final List<TtcSurfaceStopArrival> scheduled = new ArrayList<>();
        private final List<TtcSurfaceStopArrival> later = new ArrayList<>();

        private Group(String route, String routeName, String mode, String destination) {
            this.route = route;
            this.routeName = routeName == null ? "" : routeName;
            this.mode = mode;
            this.destination = destination == null ? "" : destination;
        }
    }
}
