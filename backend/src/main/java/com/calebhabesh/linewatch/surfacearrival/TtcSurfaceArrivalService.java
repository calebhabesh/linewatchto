package com.calebhabesh.linewatch.surfacearrival;

import com.calebhabesh.linewatch.station.StationEntity;
import com.calebhabesh.linewatch.station.StationNotFoundException;
import com.calebhabesh.linewatch.station.StationRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class TtcSurfaceArrivalService {
    private final StationRepository stations;
    private final TtcSurfaceArrivalCache cache;
    private final SurfaceArrivalProperties properties;
    private final Clock clock;

    public TtcSurfaceArrivalService(
        StationRepository stations,
        TtcSurfaceArrivalCache cache,
        SurfaceArrivalProperties properties,
        Clock clock
    ) {
        this.stations = stations;
        this.cache = cache;
        this.properties = properties;
        this.clock = clock;
    }

    public SurfaceArrivalResponses.SnapshotResponse arrivals(String stationId) {
        StationEntity station = stations.findById(stationId)
            .orElseThrow(() -> new StationNotFoundException(stationId));
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!properties.isTtcEnabled()) {
            return snapshot(station, "disabled", now, null, "TTC GTFS-RT",
                "TTC surface connections are disabled.", List.of());
        }

        List<TtcSurfaceArrivalSnapshot> available = List.of("bus", "streetcar").stream()
            .map(cache::get).flatMap(java.util.Optional::stream).toList();
        List<TtcSurfaceArrivalSnapshot> fresh = available.stream()
            .filter(item -> fresh(item.sourceUpdatedAt(), now, properties.getTtcMaxSourceAge()))
            .toList();
        if (fresh.isEmpty()) {
            String message = available.isEmpty()
                ? "TTC bus and streetcar predictions have not been received yet."
                : available.stream().anyMatch(TtcSurfaceArrivalSnapshot::catalogAvailable)
                    ? "The latest TTC bus and streetcar predictions are stale or unavailable."
                    : "An active TTC GTFS schedule import is required to link surface stops to stations.";
            return snapshot(station, "unavailable", now, null, "TTC GTFS-RT", message, List.of());
        }

        boolean mapped = fresh.stream().anyMatch(item -> item.mappedStationIds().contains(stationId));
        List<SurfaceArrivalRecord> visible = fresh.stream()
            .flatMap(item -> item.arrivals().stream())
            .filter(item -> stationId.equals(item.stationId()))
            .filter(item -> !item.predictedAt().isBefore(now.minusMinutes(1)))
            .filter(item -> !item.predictedAt().isAfter(now.plus(properties.getHorizon())))
            .sorted(Comparator.comparing(SurfaceArrivalRecord::predictedAt))
            .toList();
        List<SurfaceArrivalRecord> bounded = bound(visible);
        OffsetDateTime updatedAt = fresh.stream().map(TtcSurfaceArrivalSnapshot::sourceUpdatedAt)
            .max(OffsetDateTime::compareTo).orElse(null);
        if (bounded.isEmpty()) {
            String message = mapped
                ? "No TTC bus or streetcar predictions are available at this station right now."
                : "No surface connections originating at this station.";
            return snapshot(station, "no-service", now, updatedAt,
                TtcSurfaceArrivalIndexer.SOURCE, message, List.of());
        }
        return snapshot(station, "available", now, updatedAt,
            TtcSurfaceArrivalIndexer.SOURCE,
            "Fresh TTC estimates for parent-linked station stops. Bay or platform is shown only when TTC publishes it.",
            bounded);
    }

    private List<SurfaceArrivalRecord> bound(List<SurfaceArrivalRecord> rows) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        List<SurfaceArrivalRecord> result = new ArrayList<>();
        for (SurfaceArrivalRecord row : rows) {
            String key = row.mode() + ":" + row.route() + ":" + row.destination();
            int count = counts.getOrDefault(key, 0);
            if (count < Math.max(1, properties.getMaxArrivalsPerRoute())) {
                result.add(row);
                counts.put(key, count + 1);
            }
        }
        return List.copyOf(result);
    }

    private boolean fresh(OffsetDateTime updatedAt, OffsetDateTime now, Duration maxAge) {
        if (updatedAt == null) return false;
        Duration age = Duration.between(updatedAt, now);
        return age.isNegative() || age.compareTo(maxAge) <= 0;
    }

    private SurfaceArrivalResponses.SnapshotResponse snapshot(
        StationEntity station,
        String availability,
        OffsetDateTime now,
        OffsetDateTime updatedAt,
        String source,
        String message,
        List<SurfaceArrivalRecord> rows
    ) {
        return new SurfaceArrivalResponses.SnapshotResponse(
            "ttc", station.getId(), station.getName(), availability, now, updatedAt, source, message,
            rows.stream().map(row -> new SurfaceArrivalResponses.ArrivalResponse(
                row.agency(), row.mode(), row.route(), row.routeName(), row.destination(),
                Math.max(0, (int) Math.ceil(Duration.between(now, row.predictedAt()).toSeconds() / 60.0)),
                row.predictedAt(), row.scheduledAt(), row.bayPlatform(), row.stopName(), row.tripId(),
                row.source(), row.status()
            )).toList()
        );
    }
}
