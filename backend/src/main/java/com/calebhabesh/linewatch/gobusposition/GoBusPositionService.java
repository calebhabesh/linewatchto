package com.calebhabesh.linewatch.gobusposition;

import com.calebhabesh.linewatch.gobusposition.GoBusPositionResponses.PositionsResponse;
import com.calebhabesh.linewatch.gobusposition.GoBusPositionResponses.Vehicle;
import com.calebhabesh.linewatch.regional.MetrolinxClientException;
import com.calebhabesh.linewatch.regional.MetrolinxGoVehiclePositionSnapshots;
import com.calebhabesh.linewatch.streetcarposition.BusPositionResponses.Bounds;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/**
 * Live GO bus positions (plan 13, S9), read on request from the GO VehiclePosition snapshot the
 * train markers share: no polling of its own, and nothing read while the flag is off. A bus whose
 * trip has not reached its scheduled start is left out (usually laid over or running to its first
 * stop, often on a report an hour old). GO buses say nothing about GO/UP rail service.
 */
@Service
public class GoBusPositionService {
    private static final Logger log = LoggerFactory.getLogger(GoBusPositionService.class);
    private static final Duration FAILURE_LOG_INTERVAL = Duration.ofMinutes(1);

    private record Indexed(JsonNode feed, GoBusPositionSnapshot snapshot) {}

    private final GoBusPositionProperties properties;
    private final MetrolinxGoVehiclePositionSnapshots feeds;
    private final GoBusPositionIndexer indexer;
    private final Clock clock;
    private final AtomicReference<Indexed> lastIndexed = new AtomicReference<>();
    private volatile OffsetDateTime lastFailureLog;

    public GoBusPositionService(
        GoBusPositionProperties properties,
        MetrolinxGoVehiclePositionSnapshots feeds,
        GoBusPositionIndexer indexer,
        Clock clock
    ) {
        this.properties = properties;
        this.feeds = feeds;
        this.indexer = indexer;
        this.clock = clock;
    }

    /** {@code bounds} null: every bus. */
    public PositionsResponse positions(Bounds bounds) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!properties.isEnabled()) return response("disabled", now, null, List.of());
        GoBusPositionSnapshot snapshot;
        try {
            snapshot = index(feeds.go());
        } catch (MetrolinxClientException failure) {
            logFailure(failure, now);
            return response("unavailable", now, null, List.of());
        }
        boolean sourceStale = snapshot.sourceUpdatedAt() == null
            || Duration.between(snapshot.sourceUpdatedAt(), now).compareTo(properties.getMaxSourceAge()) > 0;
        long staleAfter = properties.getVehicleStaleAfter().toSeconds();
        long maxAge = properties.getVehicleMaxAge().toSeconds();
        List<Vehicle> vehicles = snapshot.buses().stream()
            .filter(bus -> bus.startsAt() == null || !bus.startsAt().isAfter(now))
            .filter(bus -> bounds == null || bounds.contains(bus.latitude(), bus.longitude()))
            .map(bus -> {
                long age = Math.max(0, Duration.between(bus.reportedAt(), now).toSeconds());
                if (age > maxAge) return null;
                return new Vehicle(bus.vehicleId(), bus.tripId(), bus.route(), bus.destination(), bus.latitude(),
                    bus.longitude(), bus.reportedAt(), age, sourceStale || age > staleAfter, bus.nextStopCode());
            })
            .filter(Objects::nonNull)
            .toList();
        return response(sourceStale ? "stale" : "live", now, snapshot.sourceUpdatedAt(), vehicles);
    }

    /** The shared read changes at most every few seconds; index each read once. */
    private GoBusPositionSnapshot index(JsonNode feed) {
        Indexed current = lastIndexed.get();
        if (current != null && current.feed() == feed) return current.snapshot();
        GoBusPositionSnapshot snapshot = indexer.index(feed);
        lastIndexed.set(new Indexed(feed, snapshot));
        return snapshot;
    }

    /** Once a minute; the message never carries the request URL. */
    private void logFailure(MetrolinxClientException failure, OffsetDateTime now) {
        OffsetDateTime previous = lastFailureLog;
        if (previous != null && Duration.between(previous, now).compareTo(FAILURE_LOG_INTERVAL) < 0) return;
        lastFailureLog = now;
        log.warn("GO bus positions unavailable this request: {}", failure.getMessage());
    }

    private PositionsResponse response(String state, OffsetDateTime now, OffsetDateTime sourceUpdatedAt, List<Vehicle> vehicles) {
        return new PositionsResponse("regional", state, MetrolinxGoVehiclePositionSnapshots.GO_SOURCE, now, sourceUpdatedAt,
            properties.getMaxSourceAge().toSeconds(), properties.getVehicleStaleAfter().toSeconds(),
            properties.getVehicleMaxAge().toSeconds(), properties.getRefreshInterval().toSeconds(), vehicles);
    }
}
