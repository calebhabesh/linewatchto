package com.calebhabesh.linewatch.regional;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class RegionalTrainMarkerService {
    public static final String DISCLAIMER = "Estimated regional train markers are schematic placements derived from Metrolinx GTFS-RT vehicle positions and LineWatchTO topology. They are not exact physical train locations.";

    private record Cached(OffsetDateTime expiresAt, Snapshot snapshot) {}
    public record Snapshot(boolean fresh, String availability, String source, String message,
                           String disclaimer, OffsetDateTime feedCreatedAt, OffsetDateTime generatedAt,
                           List<RegionalTrainMarkerRecord> markers) {}

    private final MetrolinxVehiclePositionClient client;
    private final RegionalTrainMarkerProperties properties;
    private final Clock clock;
    private volatile Cached cache;

    public RegionalTrainMarkerService(MetrolinxVehiclePositionClient client, RegionalTrainMarkerProperties properties, Clock clock) {
        this.client = client;
        this.properties = properties;
        this.clock = clock;
    }

    public Snapshot markers() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!properties.isEnabled()) return unavailable("disabled", "Regional estimated train markers are disabled.", now);
        Cached current = cache;
        if (current != null && current.expiresAt().isAfter(now)) return projected(current.snapshot(), now);
        Snapshot refreshed = refresh(now);
        cache = new Cached(now.plus(properties.getCacheTtl()), refreshed);
        return projected(refreshed, now);
    }

    private Snapshot refresh(OffsetDateTime now) {
        List<RegionalTrainMarkerFeed> feeds = new ArrayList<>();
        int failed = 0;
        try { feeds.add(client.fetchGo()); } catch (MetrolinxClientException ignored) { failed++; }
        try { feeds.add(client.fetchUp()); } catch (MetrolinxClientException ignored) { failed++; }
        List<RegionalTrainMarkerFeed> freshFeeds = feeds.stream().filter(feed -> fresh(feed, now)).toList();
        if (freshFeeds.isEmpty()) {
            return unavailable(failed == 2 ? "unavailable" : "stale",
                failed == 2 ? "Metrolinx regional vehicle positions are temporarily unavailable."
                    : "The latest Metrolinx regional vehicle-position data is stale.", now);
        }
        List<RegionalTrainMarkerRecord> markers = freshFeeds.stream().flatMap(feed -> feed.markers().stream())
            .filter(marker -> marker.updatedAt() == null || fresh(marker.updatedAt(), now))
            .sorted(Comparator.comparing(RegionalTrainMarkerRecord::lineId).thenComparing(RegionalTrainMarkerRecord::id))
            .limit(Math.max(1, properties.getMaxMarkers())).toList();
        OffsetDateTime feedCreatedAt = freshFeeds.stream().map(RegionalTrainMarkerFeed::sourceUpdatedAt)
            .max(OffsetDateTime::compareTo).orElse(null);
        String source = freshFeeds.stream().map(RegionalTrainMarkerFeed::source).distinct()
            .reduce((left, right) -> left + " / " + right).orElse("Metrolinx GTFS-RT vehicle positions");
        String availability = failed > 0 || freshFeeds.size() < 2 ? "partial-source" : "available";
        String message = markers.isEmpty() ? "No mappable regional train positions were returned."
            : "partial-source".equals(availability) ? "Showing fresh markers from the available regional vehicle-position source."
            : "Fresh schematic regional train markers.";
        return new Snapshot(true, availability, source, message, DISCLAIMER, feedCreatedAt, now, markers);
    }

    private boolean fresh(RegionalTrainMarkerFeed feed, OffsetDateTime now) {
        return feed.sourceUpdatedAt() != null && fresh(feed.sourceUpdatedAt(), now);
    }

    private boolean fresh(OffsetDateTime timestamp, OffsetDateTime now) {
        Duration age = Duration.between(timestamp, now);
        return age.isNegative() || age.compareTo(properties.getMaxSourceAge()) <= 0;
    }

    private Snapshot projected(Snapshot snapshot, OffsetDateTime now) {
        if (!snapshot.fresh() || snapshot.markers().isEmpty()) {
            return snapshot;
        }
        List<RegionalTrainMarkerRecord> markers = snapshot.markers().stream()
            .map(marker -> projected(marker, now))
            .toList();
        return new Snapshot(
            snapshot.fresh(), snapshot.availability(), snapshot.source(), snapshot.message(),
            snapshot.disclaimer(), snapshot.feedCreatedAt(), now, markers
        );
    }

    private RegionalTrainMarkerRecord projected(RegionalTrainMarkerRecord marker, OffsetDateTime now) {
        if (!marker.moving() || marker.predictedAt() == null || marker.segmentTravelSeconds() <= 0) {
            return marker;
        }
        long secondsToNext = Math.max(0, Duration.between(now, marker.predictedAt()).toSeconds());
        double estimatedProgress = (marker.segmentTravelSeconds() - secondsToNext)
            / (double) marker.segmentTravelSeconds();
        double progress = Math.max(marker.progress(), Math.min(0.95, estimatedProgress));
        return new RegionalTrainMarkerRecord(
            marker.id(), marker.lineId(), marker.direction(), marker.travelDirection(), marker.segmentId(),
            marker.fromStationId(), marker.toStationId(), marker.nextStationId(), progress,
            marker.segmentTravelSeconds(), marker.predictedAt(), marker.moving(), marker.vehicleId(),
            marker.tripId(), marker.updatedAt(), marker.source()
        );
    }

    private Snapshot unavailable(String availability, String message, OffsetDateTime now) {
        return new Snapshot(false, availability, "Metrolinx GTFS-RT vehicle positions", message,
            DISCLAIMER, null, now, List.of());
    }
}
