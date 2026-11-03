package com.calebhabesh.linewatch.streetcarposition;

import com.calebhabesh.linewatch.streetcarposition.BusPositionResponses.Bounds;
import com.calebhabesh.linewatch.streetcarposition.BusPositionResponses.PositionsResponse;
import com.calebhabesh.linewatch.streetcarposition.BusPositionResponses.Vehicle;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import org.springframework.stereotype.Service;

/** Live bus positions (plan 13, S8), judged by the streetcar positions' freshness limits. */
@Service
public class TtcBusPositionService {
    private final BusPositionProperties busProperties;
    private final StreetcarPositionProperties feedProperties;
    private final TtcBusPositionCache cache;
    private final Clock clock;

    public TtcBusPositionService(
        BusPositionProperties busProperties,
        StreetcarPositionProperties feedProperties,
        TtcBusPositionCache cache,
        Clock clock
    ) {
        this.busProperties = busProperties;
        this.feedProperties = feedProperties;
        this.cache = cache;
        this.clock = clock;
    }

    /** {@code bounds} null: every bus. */
    public PositionsResponse positions(Bounds bounds) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!busProperties.isEnabled()) return response("disabled", now, null, List.of());
        Optional<TtcBusPositionSnapshot> found = cache.get();
        if (found.isEmpty() || !found.get().scheduleAvailable()) {
            return response("unavailable", now, found.map(TtcBusPositionSnapshot::sourceUpdatedAt).orElse(null),
                List.of());
        }
        TtcBusPositionSnapshot snapshot = found.get();
        boolean sourceStale = snapshot.sourceUpdatedAt() == null
            || Duration.between(snapshot.sourceUpdatedAt(), now).compareTo(feedProperties.getMaxSourceAge()) > 0;
        long staleAfter = feedProperties.getVehicleStaleAfter().toSeconds();
        long maxAge = feedProperties.getVehicleMaxAge().toSeconds();
        List<Vehicle> vehicles = snapshot.vehicles().stream()
            .filter(position -> bounds == null || bounds.contains(position.latitude(), position.longitude()))
            .map(position -> {
                long age = Math.max(0, Duration.between(position.reportedAt(), now).toSeconds());
                if (age > maxAge) return null;
                return new Vehicle(position.vehicleId(), position.route(), position.routeName(), position.destination(),
                    position.latitude(), position.longitude(), position.bearing(), position.reportedAt(), age,
                    sourceStale || age > staleAfter, position.replacement());
            })
            .filter(Objects::nonNull)
            .toList();
        return response(sourceStale ? "stale" : "live", now, snapshot.sourceUpdatedAt(), vehicles);
    }

    private PositionsResponse response(String state, OffsetDateTime now, OffsetDateTime sourceUpdatedAt, List<Vehicle> vehicles) {
        return new PositionsResponse("ttc", state, TtcStreetcarPositionService.SOURCE, now, sourceUpdatedAt,
            feedProperties.getMaxSourceAge().toSeconds(), feedProperties.getVehicleStaleAfter().toSeconds(),
            feedProperties.getVehicleMaxAge().toSeconds(), feedProperties.getFixedDelay().toSeconds(), vehicles);
    }
}
