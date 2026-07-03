package com.calebhabesh.linewatch.arrival.live;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

@Component
public class GtfsRtSubwayArrivalCache {
    private static final Duration PAST_TOLERANCE = Duration.ofSeconds(30);

    private final ArrivalProperties properties;
    private final Clock clock;
    private final AtomicReference<GtfsRtSubwayArrivalSnapshot> current;

    public GtfsRtSubwayArrivalCache(ArrivalProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
        this.current = new AtomicReference<>(GtfsRtSubwayArrivalSnapshot.empty(OffsetDateTime.now(clock)));
    }

    public void replace(GtfsRtSubwayArrivalSnapshot snapshot) {
        current.set(snapshot);
    }

    public GtfsRtSubwayArrivalSnapshot snapshot() {
        return current.get();
    }

    public Optional<GtfsRtSubwayArrivalSnapshot> freshSnapshot() {
        GtfsRtSubwayArrivalSnapshot snapshot = current.get();
        return isFresh(snapshot) ? Optional.of(snapshot) : Optional.empty();
    }

    public Optional<OffsetDateTime> feedCreatedAt() {
        return Optional.ofNullable(current.get().feedCreatedAt());
    }

    public List<GtfsRtSubwayStationArrival> arrivalsFor(String stationId, List<String> lineIds) {
        GtfsRtSubwayArrivalSnapshot snapshot = current.get();
        if (!isFresh(snapshot)) {
            return List.of();
        }

        OffsetDateTime now = OffsetDateTime.now(clock);
        OffsetDateTime cutoff = now.minus(PAST_TOLERANCE);
        OffsetDateTime horizon = now.plus(properties.getScheduleHorizon());
        Set<String> requestedLines = Set.copyOf(lineIds);

        return snapshot.arrivals()
            .stream()
            .filter(arrival -> arrival.stationId().equals(stationId))
            .filter(arrival -> requestedLines.contains(arrival.lineId()))
            .filter(arrival -> !arrival.visibleUntil().isBefore(cutoff))
            .filter(arrival -> !arrival.predictedAt().isAfter(horizon))
            .sorted(Comparator.comparing(GtfsRtSubwayStationArrival::lineId)
                .thenComparing(GtfsRtSubwayStationArrival::direction)
                .thenComparing(GtfsRtSubwayStationArrival::predictedAt)
                .thenComparing(GtfsRtSubwayStationArrival::vehicleId, Comparator.nullsLast(Comparator.naturalOrder())))
            .toList();
    }

    private boolean isFresh(GtfsRtSubwayArrivalSnapshot snapshot) {
        if (snapshot.feedCreatedAt() == null) {
            return false;
        }
        Duration age = Duration.between(snapshot.feedCreatedAt(), OffsetDateTime.now(clock));
        return age.compareTo(properties.getMaxAge()) <= 0;
    }
}
