package com.calebhabesh.linewatch.surfacearrival;

import com.calebhabesh.linewatch.regional.MetrolinxArrivalClient;
import com.calebhabesh.linewatch.regional.MetrolinxClientException;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/**
 * Departures at one GO bus stop on the GO/UP Map View (plan 13, S6), from
 * Metrolinx GO Next Service for that stop's number: the same API, key and
 * enablement ({@code linewatch.surface-arrivals.regional-enabled}) as GO Bus
 * departures at GO/UP stations. Only stop numbers in {@link GoBusStopCatalog}
 * are fetched, each at most once per cache window, and all stops together
 * within a per-minute budget, so the map can never drive unbounded upstream
 * calls. GO bus departures never affect GO/UP rail status.
 */
@Service
public class GoBusStopDepartureService {
    static final String SOURCE = "Metrolinx GO Next Service";

    private record Cached(OffsetDateTime expiresAt, OffsetDateTime sourceUpdatedAt, List<SurfaceArrivalRecord> rows, boolean failed) {
    }

    private final GoBusStopCatalog catalog;
    private final MetrolinxArrivalClient client;
    private final SurfaceArrivalProperties properties;
    private final Clock clock;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();
    private final Deque<OffsetDateTime> recentFetches = new ArrayDeque<>();

    public GoBusStopDepartureService(
        GoBusStopCatalog catalog,
        MetrolinxArrivalClient client,
        SurfaceArrivalProperties properties,
        Clock clock
    ) {
        this.catalog = catalog;
        this.client = client;
        this.properties = properties;
        this.clock = clock;
    }

    /** Empty when the stop number is not a GO bus stop the map draws. */
    public Optional<GoBusStopResponses.StopDeparturesResponse> departures(String stopCode) {
        Optional<GoBusStopCatalog.Stop> found = catalog.find(stopCode == null ? null : stopCode.trim());
        if (found.isEmpty()) return Optional.empty();
        GoBusStopCatalog.Stop stop = found.get();
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!properties.isRegionalEnabled()) {
            return Optional.of(response(stop, "disabled", "GO bus stop departures are turned off.", now, null, List.of()));
        }

        Cached current = cache.get(stop.stopCode());
        if (current == null || !current.expiresAt().isAfter(now)) {
            if (!takeFetchBudget(now)) {
                return Optional.of(response(stop, "unavailable",
                    "GO bus departures are busy right now. LineWatchTO will try again.", now, null, List.of()));
            }
            current = fetch(stop.stopCode(), now);
            cache.put(stop.stopCode(), current);
        }

        if (current.failed()) {
            return Optional.of(response(stop, "unavailable",
                "GO bus departures are temporarily unavailable.", now, null, List.of()));
        }
        if (current.sourceUpdatedAt() != null && !fresh(current.sourceUpdatedAt(), now)) {
            return Optional.of(response(stop, "unavailable",
                "The latest GO bus departure data is stale.", now, current.sourceUpdatedAt(), List.of()));
        }
        List<GoBusStopResponses.DepartureResponse> departures = bound(current.rows().stream()
            .map(row -> departure(row, now))
            .flatMap(Optional::stream)
            .filter(row -> !row.at().isBefore(now.minusMinutes(1)))
            .filter(row -> !row.at().isAfter(now.plus(properties.getHorizon())))
            .sorted(Comparator.comparing(GoBusStopResponses.DepartureResponse::at))
            .toList());
        OffsetDateTime sourceUpdatedAt = current.sourceUpdatedAt();
        return Optional.of(departures.isEmpty()
            ? response(stop, "no-departures", "No GO bus departures are listed here in the next "
                + horizonLabel() + ".", now, sourceUpdatedAt, List.of())
            : response(stop, "available", null, now, sourceUpdatedAt, departures));
    }

    private Cached fetch(String stopCode, OffsetDateTime now) {
        OffsetDateTime expiresAt = now.plus(properties.getRegionalCacheTtl());
        try {
            RegionalSurfaceArrivalFeed feed = client.fetchGoBusNextService(stopCode, List.of(stopCode));
            return new Cached(expiresAt, feed.sourceUpdatedAt(), feed.arrivals(), false);
        } catch (MetrolinxClientException exception) {
            return new Cached(expiresAt, null, List.of(), true);
        }
    }

    /** At most {@code regionalStopFetchesPerMinute} upstream reads across all stops. */
    private synchronized boolean takeFetchBudget(OffsetDateTime now) {
        OffsetDateTime windowStart = now.minusMinutes(1);
        while (!recentFetches.isEmpty() && !recentFetches.peekFirst().isAfter(windowStart)) recentFetches.removeFirst();
        if (recentFetches.size() >= Math.max(1, properties.getRegionalStopFetchesPerMinute())) return false;
        recentFetches.addLast(now);
        return true;
    }

    /**
     * Live only when Metrolinx computed a time that differs from the schedule.
     * Next Service often repeats the scheduled time as the computed one before
     * a trip is tracked; that is a schedule, not a prediction. A row without a
     * scheduled time cannot be labelled honestly and is left out.
     */
    static Optional<GoBusStopResponses.DepartureResponse> departure(SurfaceArrivalRecord row, OffsetDateTime now) {
        OffsetDateTime scheduledAt = row.scheduledAt();
        if (scheduledAt == null) return Optional.empty();
        boolean computed = "live".equals(row.status()) && row.predictedAt() != null;
        boolean live = computed && !row.predictedAt().isEqual(scheduledAt);
        OffsetDateTime at = live ? row.predictedAt() : scheduledAt;
        int minutes = Math.max(0, (int) Math.ceil(Duration.between(now, at).toSeconds() / 60.0));
        return Optional.of(new GoBusStopResponses.DepartureResponse(
            row.route(), row.routeName(), row.destination(), minutes, at,
            live ? row.predictedAt() : null, scheduledAt, row.bayPlatform(), row.tripId(),
            live ? "live" : "scheduled"
        ));
    }

    private List<GoBusStopResponses.DepartureResponse> bound(List<GoBusStopResponses.DepartureResponse> rows) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        List<GoBusStopResponses.DepartureResponse> result = new ArrayList<>();
        for (GoBusStopResponses.DepartureResponse row : rows) {
            String key = row.route() + ":" + row.destination();
            int count = counts.getOrDefault(key, 0);
            if (count < Math.max(1, properties.getMaxArrivalsPerRoute())) {
                result.add(row);
                counts.put(key, count + 1);
            }
        }
        return List.copyOf(result);
    }

    private boolean fresh(OffsetDateTime updatedAt, OffsetDateTime now) {
        Duration age = Duration.between(updatedAt, now);
        return age.isNegative() || age.compareTo(properties.getRegionalMaxSourceAge()) <= 0;
    }

    private String horizonLabel() {
        long minutes = properties.getHorizon().toMinutes();
        return minutes % 60 == 0 ? (minutes / 60) + (minutes == 60 ? " hour" : " hours") : minutes + " minutes";
    }

    private GoBusStopResponses.StopDeparturesResponse response(
        GoBusStopCatalog.Stop stop,
        String availability,
        String message,
        OffsetDateTime now,
        OffsetDateTime sourceUpdatedAt,
        List<GoBusStopResponses.DepartureResponse> departures
    ) {
        return new GoBusStopResponses.StopDeparturesResponse(
            "regional", stop.stopCode(), stop.name(), stop.routes(), availability, message, now,
            sourceUpdatedAt, SOURCE, (int) properties.getHorizon().toMinutes(), departures
        );
    }
}
