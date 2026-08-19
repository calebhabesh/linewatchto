package com.calebhabesh.linewatch.surfacearrival;

import com.calebhabesh.linewatch.regional.MetrolinxArrivalClient;
import com.calebhabesh.linewatch.regional.MetrolinxClientException;
import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import com.calebhabesh.linewatch.station.StationNotFoundException;
import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class RegionalSurfaceArrivalService {
    private record Cached(OffsetDateTime expiresAt, SurfaceArrivalResponses.SnapshotResponse response) {
    }

    private final MetrolinxArrivalClient client;
    private final SurfaceArrivalProperties properties;
    private final Clock clock;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    public RegionalSurfaceArrivalService(
        MetrolinxArrivalClient client,
        SurfaceArrivalProperties properties,
        Clock clock
    ) {
        this.client = client;
        this.properties = properties;
        this.clock = clock;
    }

    public SurfaceArrivalResponses.SnapshotResponse arrivals(String stationId) {
        StationResponses.StationSummaryResponse station = RegionalNetworkCatalog.station(stationId)
            .orElseThrow(() -> new StationNotFoundException(stationId));
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!properties.isRegionalEnabled()) {
            return snapshot(station, "disabled", now, null, "Metrolinx",
                "GO Bus surface connections are disabled.", List.of());
        }
        Cached current = cache.get(stationId);
        if (current != null && current.expiresAt().isAfter(now)) return current.response();

        SurfaceArrivalResponses.SnapshotResponse response;
        try {
            List<String> stopCodes = RegionalNetworkCatalog.busStopCodesForStationId(stationId);
            RegionalSurfaceArrivalFeed feed = client.fetchGoBusNextService(stationId, stopCodes);
            if (feed.sourceUpdatedAt() != null && !fresh(feed.sourceUpdatedAt(), now)) {
                response = snapshot(station, "unavailable", now, feed.sourceUpdatedAt(),
                    "Metrolinx GO Next Service", "The latest GO Bus station-connection data is stale.", List.of());
            } else {
                List<SurfaceArrivalRecord> visible = feed.arrivals().stream()
                    .filter(row -> !row.predictedAt().isBefore(now.minusMinutes(1)))
                    .filter(row -> !row.predictedAt().isAfter(now.plus(properties.getHorizon())))
                    .sorted(Comparator.comparing(SurfaceArrivalRecord::predictedAt))
                    .toList();
                List<SurfaceArrivalRecord> bounded = bound(visible);
                OffsetDateTime sourceUpdatedAt = feed.sourceUpdatedAt() != null ? feed.sourceUpdatedAt() : now;
                response = snapshot(
                    station,
                    bounded.isEmpty() ? "no-service" : "available",
                    now,
                    sourceUpdatedAt,
                    "Metrolinx GO Next Service",
                    bounded.isEmpty()
                        ? "No GO Bus departures are listed for this station in the current horizon."
                        : "GO Bus departures at this GO/UP station. Bay or platform is shown only when Metrolinx supplies it.",
                    bounded
                );
            }
        } catch (MetrolinxClientException exception) {
            response = snapshot(station, "unavailable", now, null, "Metrolinx",
                "GO Bus station connections are temporarily unavailable.", List.of());
        }
        cache.put(stationId, new Cached(now.plus(properties.getRegionalCacheTtl()), response));
        return response;
    }

    private List<SurfaceArrivalRecord> bound(List<SurfaceArrivalRecord> rows) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        List<SurfaceArrivalRecord> result = new ArrayList<>();
        for (SurfaceArrivalRecord row : rows) {
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
        if (updatedAt == null) return false;
        Duration age = Duration.between(updatedAt, now);
        return age.isNegative() || age.compareTo(properties.getRegionalMaxSourceAge()) <= 0;
    }

    private SurfaceArrivalResponses.SnapshotResponse snapshot(
        StationResponses.StationSummaryResponse station,
        String availability,
        OffsetDateTime now,
        OffsetDateTime updatedAt,
        String source,
        String message,
        List<SurfaceArrivalRecord> rows
    ) {
        return new SurfaceArrivalResponses.SnapshotResponse(
            "regional", station.id(), station.name(), availability, now, updatedAt, source, message,
            rows.stream().map(row -> new SurfaceArrivalResponses.ArrivalResponse(
                row.agency(), row.mode(), row.route(), row.routeName(), row.destination(),
                Math.max(0, (int) Math.ceil(Duration.between(now, row.predictedAt()).toSeconds() / 60.0)),
                row.predictedAt(), row.scheduledAt(), row.bayPlatform(), row.stopName(), row.tripId(),
                row.source(), row.status()
            )).toList()
        );
    }
}
