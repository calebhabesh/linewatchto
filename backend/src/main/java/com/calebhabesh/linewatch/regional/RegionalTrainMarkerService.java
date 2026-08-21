package com.calebhabesh.linewatch.regional;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class RegionalTrainMarkerService {
    public static final String DISCLAIMER = "Estimated regional train markers are schematic placements derived from Metrolinx GTFS-RT vehicle positions and LineWatchTO topology. UP Express direction and station timing are reconciled with the matching TripUpdates trip. Markers are not exact physical train locations.";

    private record Cached(OffsetDateTime expiresAt, Snapshot snapshot) {}
    private record RetainedMarker(RegionalTrainMarkerRecord marker, OffsetDateTime lastSeenAt) {}
    public record Snapshot(boolean fresh, String availability, String source, String message,
                           String disclaimer, OffsetDateTime feedCreatedAt, OffsetDateTime generatedAt,
                           List<RegionalTrainMarkerRecord> markers) {}

    private final MetrolinxVehiclePositionClient client;
    private final RegionalTrainMarkerProperties properties;
    private final Clock clock;
    private volatile Cached cache;
    private volatile Map<String, RetainedMarker> retainedMarkers = Map.of();

    public RegionalTrainMarkerService(MetrolinxVehiclePositionClient client, RegionalTrainMarkerProperties properties, Clock clock) {
        this.client = client;
        this.properties = properties;
        this.clock = clock;
    }

    public Snapshot markers() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!properties.isEnabled()) {
            retainedMarkers = Map.of();
            return unavailable("disabled", "Regional estimated train markers are disabled.", now, List.of());
        }
        Cached current = cache;
        if (current != null && current.expiresAt().isAfter(now)) return current.snapshot();
        Snapshot refreshed = refresh(now);
        cache = new Cached(now.plus(properties.getCacheTtl()), refreshed);
        return refreshed;
    }

    private synchronized Snapshot refresh(OffsetDateTime now) {
        List<RegionalTrainMarkerFeed> feeds = new ArrayList<>();
        int failed = 0;
        try { feeds.add(client.fetchGo()); } catch (MetrolinxClientException ignored) { failed++; }
        try { feeds.add(client.fetchUp()); } catch (MetrolinxClientException ignored) { failed++; }
        List<RegionalTrainMarkerFeed> freshFeeds = feeds.stream().filter(feed -> fresh(feed, now)).toList();
        if (freshFeeds.isEmpty()) {
            List<RegionalTrainMarkerRecord> heldMarkers = retainRecentMarkers(List.of(), now);
            String message = failed == 2 ? "Metrolinx regional vehicle positions are temporarily unavailable."
                : "The latest Metrolinx regional vehicle-position data is stale.";
            if (!heldMarkers.isEmpty()) {
                message += " Briefly holding the last estimated marker positions.";
            }
            return unavailable(failed == 2 ? "unavailable" : "stale", message, now, heldMarkers);
        }
        List<RegionalTrainMarkerRecord> currentMarkers = freshFeeds.stream().flatMap(feed -> feed.markers().stream())
            .filter(marker -> marker.updatedAt() == null || fresh(marker.updatedAt(), now))
            .toList();
        List<RegionalTrainMarkerRecord> markers = retainRecentMarkers(currentMarkers, now).stream()
            .sorted(Comparator.comparing(RegionalTrainMarkerRecord::lineId).thenComparing(RegionalTrainMarkerRecord::id))
            .limit(Math.max(1, properties.getMaxMarkers())).toList();
        OffsetDateTime feedCreatedAt = freshFeeds.stream().map(RegionalTrainMarkerFeed::sourceUpdatedAt)
            .max(OffsetDateTime::compareTo).orElse(null);
        String source = freshFeeds.stream().map(RegionalTrainMarkerFeed::source).distinct()
            .reduce((left, right) -> left + " / " + right).orElse("Metrolinx GTFS-RT vehicle positions");
        String availability = failed > 0 || freshFeeds.size() < 2 ? "partial-source" : "available";
        Set<String> currentMarkerKeys = currentMarkers.stream()
            .map(this::markerContinuityKey).collect(Collectors.toSet());
        boolean holdingMarkers = markers.stream()
            .anyMatch(marker -> !currentMarkerKeys.contains(markerContinuityKey(marker)));
        String message = markers.isEmpty() ? "No mappable regional train positions were returned."
            : "partial-source".equals(availability) && holdingMarkers
                ? "Showing fresh markers from the available source and briefly holding last positions from the interrupted source."
            : "partial-source".equals(availability) ? "Showing fresh markers from the available regional vehicle-position source."
            : holdingMarkers ? "Fresh regional vehicle-position sources are available; briefly holding last-seen positions for missing rows."
            : "Fresh schematic regional train markers.";
        return new Snapshot(true, availability, source, message, DISCLAIMER, feedCreatedAt, now, markers);
    }

    private List<RegionalTrainMarkerRecord> retainRecentMarkers(
        List<RegionalTrainMarkerRecord> currentMarkers,
        OffsetDateTime now
    ) {
        Map<String, RetainedMarker> next = new LinkedHashMap<>();
        for (RegionalTrainMarkerRecord marker : currentMarkers) {
            String key = markerContinuityKey(marker);
            RegionalTrainMarkerRecord stabilized = stabilizeProgress(retainedMarkers.get(key), marker);
            next.putIfAbsent(key, new RetainedMarker(stabilized, now));
        }
        Duration retention = properties.getRetentionTtl() == null || properties.getRetentionTtl().isNegative()
            ? Duration.ZERO : properties.getRetentionTtl();
        for (Map.Entry<String, RetainedMarker> entry : retainedMarkers.entrySet()) {
            if (next.containsKey(entry.getKey())) continue;
            if (!entry.getValue().lastSeenAt().plus(retention).isBefore(now)) {
                next.put(entry.getKey(), entry.getValue());
            }
        }
        retainedMarkers = Map.copyOf(next);
        return next.values().stream().map(RetainedMarker::marker).toList();
    }

    private String markerContinuityKey(RegionalTrainMarkerRecord marker) {
        String vehicleId = normalize(marker.vehicleId());
        String tripId = normalize(marker.tripId());
        String identity = !vehicleId.isBlank() ? "vehicle:" + vehicleId
            : !tripId.isBlank() ? "trip:" + tripId
            : "marker:" + normalize(marker.id());
        return normalize(marker.lineId()) + "|" + identity;
    }

    private RegionalTrainMarkerRecord stabilizeProgress(
        RetainedMarker previous,
        RegionalTrainMarkerRecord current
    ) {
        if (previous == null
            || !previous.marker().segmentId().equals(current.segmentId())
            || !previous.marker().fromStationId().equals(current.fromStationId())
            || !previous.marker().toStationId().equals(current.toStationId())
            || current.progress() >= previous.marker().progress()) {
            return current;
        }
        return new RegionalTrainMarkerRecord(
            current.id(), current.lineId(), current.direction(), current.travelDirection(), current.segmentId(),
            current.fromStationId(), current.toStationId(), current.nextStationId(), previous.marker().progress(),
            current.segmentTravelSeconds(), current.predictedAt(), current.moving(), current.vehicleId(),
            current.tripId(), current.updatedAt(), current.source()
        );
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private boolean fresh(RegionalTrainMarkerFeed feed, OffsetDateTime now) {
        return feed.sourceUpdatedAt() != null && fresh(feed.sourceUpdatedAt(), now);
    }

    private boolean fresh(OffsetDateTime timestamp, OffsetDateTime now) {
        Duration age = Duration.between(timestamp, now);
        return age.isNegative() || age.compareTo(properties.getMaxSourceAge()) <= 0;
    }

    private Snapshot unavailable(
        String availability,
        String message,
        OffsetDateTime now,
        List<RegionalTrainMarkerRecord> markers
    ) {
        OffsetDateTime feedCreatedAt = markers.stream().map(RegionalTrainMarkerRecord::updatedAt)
            .filter(java.util.Objects::nonNull).max(OffsetDateTime::compareTo).orElse(null);
        return new Snapshot(false, availability, "Metrolinx GTFS-RT vehicle positions", message,
            DISCLAIMER, feedCreatedAt, now, markers);
    }
}
