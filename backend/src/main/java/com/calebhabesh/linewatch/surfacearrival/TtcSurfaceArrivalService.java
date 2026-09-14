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
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class TtcSurfaceArrivalService {
    private final StationRepository stations;
    private final TtcSurfaceArrivalCache cache;
    private final TtcSurfaceScheduleCatalog catalogRepository;
    private final SurfaceArrivalProperties properties;
    private final Clock clock;
    private final TtcSurfaceScheduledArrivalRepository scheduled;

    public TtcSurfaceArrivalService(
        StationRepository stations,
        TtcSurfaceArrivalCache cache,
        TtcSurfaceScheduleCatalog catalogRepository,
        SurfaceArrivalProperties properties,
        Clock clock,
        TtcSurfaceScheduledArrivalRepository scheduled
    ) {
        this.stations = stations;
        this.cache = cache;
        this.catalogRepository = catalogRepository;
        this.properties = properties;
        this.clock = clock;
        this.scheduled = scheduled;
    }

    public SurfaceArrivalResponses.SnapshotResponse arrivals(String stationId) {
        StationEntity station = stations.findById(stationId)
            .orElseThrow(() -> new StationNotFoundException(stationId));
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!properties.isTtcEnabled()) {
            return snapshot(station, "disabled", now, null, "TTC GTFS-RT",
                "TTC surface connections are disabled.", List.of());
        }

        TtcSurfaceScheduleCatalog.Catalog catalog = catalogRepository.active();
        List<TtcSurfaceArrivalSnapshot> available = List.of("bus", "streetcar").stream()
            .map(cache::get).flatMap(java.util.Optional::stream).toList();
        List<TtcSurfaceArrivalSnapshot> fresh = available.stream()
            .filter(item -> fresh(item.sourceUpdatedAt(), now, properties.getTtcMaxSourceAge()))
            .toList();
        List<SurfaceArrivalRecord> visible = fresh.stream()
            .flatMap(item -> item.arrivals().stream())
            .filter(item -> stationId.equals(item.stationId()))
            .filter(item -> !item.predictedAt().isBefore(now.minusMinutes(1)))
            .filter(item -> !item.predictedAt().isAfter(now.plus(properties.getHorizon())))
            .sorted(Comparator.comparing(SurfaceArrivalRecord::predictedAt))
            .toList();

        List<SurfaceArrivalRecord> merged = new ArrayList<>(visible);
        // Without an exact realtime trip match, avoid duplicate timetable tiles for a
        // direction/bay that already has predictions. Other directions remain scheduled.
        java.util.Set<String> liveGroups = visible.stream().map(this::connectionKey).collect(Collectors.toSet());
        java.util.Set<String> liveTrips = visible.stream().map(SurfaceArrivalRecord::tripId)
            .filter(id -> id != null && !id.isBlank()).collect(Collectors.toSet());
        for (SurfaceArrivalRecord row : scheduled.arrivals(stationId, now, properties.getHorizon())) {
            if (!liveGroups.contains(connectionKey(row)) && !liveTrips.contains(row.tripId())) merged.add(row);
        }
        java.util.Set<String> seen = merged.stream().map(this::connectionKey).collect(Collectors.toSet());
        for (TtcSurfaceScheduleCatalog.Connection conn : catalog.connectionsFor(stationId)) {
            SurfaceArrivalRecord placeholder = new SurfaceArrivalRecord(
                stationId, "TTC", conn.mode(), conn.routeShortName(), conn.routeLongName(),
                conn.destination(), null, null, conn.bayPlatform(), conn.stopName(), "",
                "TTC published station connections", "scheduled");
            if (seen.add(connectionKey(placeholder))) merged.add(placeholder);
        }
        merged.sort(Comparator.comparing(this::eventTime, Comparator.nullsLast(Comparator.naturalOrder())));

        List<SurfaceArrivalRecord> bounded = bound(merged);
        OffsetDateTime updatedAt = fresh.stream().map(TtcSurfaceArrivalSnapshot::sourceUpdatedAt)
            .max(OffsetDateTime::compareTo).orElse(null);
        if (bounded.isEmpty()) {
            String message = fresh.isEmpty() ? "Surface predictions and scheduled departures are unavailable."
                : "No surface connections originating at this station.";
            return snapshot(station, fresh.isEmpty() ? "unavailable" : "no-service", now, updatedAt,
                TtcSurfaceArrivalIndexer.SOURCE, message, List.of());
        }
        return snapshot(station, "available", now, visible.isEmpty() ? null : updatedAt,
            visible.isEmpty() ? TtcSurfaceScheduledArrivalRepository.SOURCE : TtcSurfaceArrivalIndexer.SOURCE,
            "TTC bus and streetcar connections for this station. Bay or platform is shown only when TTC publishes it.",
            bounded);
    }

    private OffsetDateTime eventTime(SurfaceArrivalRecord row) {
        return row.predictedAt() != null ? row.predictedAt() : row.scheduledAt();
    }

    private String connectionKey(SurfaceArrivalRecord row) {
        // Bay identifies boarding direction even when realtime NEW trips lack headsigns.
        return row.mode() + ":" + row.route() + ":" + row.stopName() + ":" + row.bayPlatform();
    }

    private List<SurfaceArrivalRecord> bound(List<SurfaceArrivalRecord> rows) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        List<SurfaceArrivalRecord> result = new ArrayList<>();
        for (SurfaceArrivalRecord row : rows) {
            String key = connectionKey(row) + ":" + row.destination();
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
                eventTime(row) != null
                    ? Math.max(0, (int) Math.ceil(Duration.between(now, eventTime(row)).toSeconds() / 60.0))
                    : null,
                row.predictedAt(), row.scheduledAt(), row.bayPlatform(), row.stopName(), row.tripId(),
                row.source(), row.status()
            )).toList()
        );
    }
}
