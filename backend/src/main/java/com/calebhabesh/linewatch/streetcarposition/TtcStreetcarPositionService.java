package com.calebhabesh.linewatch.streetcarposition;

import com.calebhabesh.linewatch.streetcarposition.StreetcarPositionResponses.PositionsResponse;
import com.calebhabesh.linewatch.streetcarposition.StreetcarPositionResponses.Vehicle;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;

@Service
public class TtcStreetcarPositionService {
    static final String SOURCE = "TTC GTFS-RT vehicle positions";
    private final StreetcarPositionProperties properties;
    private final TtcStreetcarPositionCache cache;
    private final Clock clock;

    public TtcStreetcarPositionService(StreetcarPositionProperties properties, TtcStreetcarPositionCache cache, Clock clock) {
        this.properties = properties;
        this.cache = cache;
        this.clock = clock;
    }

    public PositionsResponse positions() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!properties.isEnabled()) return response("disabled", now, null, List.of());
        Optional<TtcStreetcarPositionSnapshot> found = cache.get();
        if (found.isEmpty() || !found.get().scheduleAvailable()) {
            return response("unavailable", now, found.map(TtcStreetcarPositionSnapshot::sourceUpdatedAt).orElse(null),
                List.of());
        }
        TtcStreetcarPositionSnapshot snapshot = found.get();
        boolean sourceStale = snapshot.sourceUpdatedAt() == null
            || Duration.between(snapshot.sourceUpdatedAt(), now).compareTo(properties.getMaxSourceAge()) > 0;
        long staleAfter = properties.getVehicleStaleAfter().toSeconds();
        long maxAge = properties.getVehicleMaxAge().toSeconds();
        List<Vehicle> vehicles = snapshot.vehicles().stream()
            .map(position -> {
                long age = Math.max(0, Duration.between(position.reportedAt(), now).toSeconds());
                if (age > maxAge) return null;
                return new Vehicle(position.vehicleId(), position.route(), position.routeName(), position.destination(),
                    position.latitude(), position.longitude(), position.bearing(), position.reportedAt(), age,
                    sourceStale || age > staleAfter);
            })
            .filter(java.util.Objects::nonNull)
            .toList();
        return response(sourceStale ? "stale" : "live", now, snapshot.sourceUpdatedAt(), vehicles);
    }

    private PositionsResponse response(String state, OffsetDateTime now, OffsetDateTime sourceUpdatedAt, List<Vehicle> vehicles) {
        return new PositionsResponse("ttc", state, SOURCE, now, sourceUpdatedAt,
            properties.getMaxSourceAge().toSeconds(), properties.getVehicleStaleAfter().toSeconds(),
            properties.getVehicleMaxAge().toSeconds(), properties.getFixedDelay().toSeconds(), vehicles);
    }
}
