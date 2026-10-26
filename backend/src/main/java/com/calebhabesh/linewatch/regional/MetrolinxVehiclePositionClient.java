package com.calebhabesh.linewatch.regional;

import tools.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.function.Function;
import org.springframework.stereotype.Component;

/**
 * Turns Metrolinx GO and UP VehiclePosition feeds into schematic markers on
 * reviewed adjacent links. A train's progress along its link comes from the
 * predicted arrival at its next stop in the shared TripUpdates snapshot (the
 * same prediction station arrivals show), so the marker reaches the station
 * when the arrival tile says it is due. Trains without a prediction fall back
 * to a coarse placement from their reported status.
 */
@Component
public class MetrolinxVehiclePositionClient {
    static final String GO_SOURCE = "Metrolinx GO GTFS-RT VehiclePosition";
    static final String UP_SOURCE = "Metrolinx UP Express GTFS-RT VehiclePosition reconciled with TripUpdates";
    private static final String GO_PATH = "api/V1/Gtfs/Feed/VehiclePosition";
    private static final String UP_PATH = "api/V1/UP/Gtfs/Feed/VehiclePosition";
    private static final Duration MAX_UP_FEED_SKEW = Duration.ofMinutes(2);
    /** A timed marker stops short of the station until the feed reports the train there. */
    static final double MAX_TIMED_PROGRESS = 0.95;
    static final double STOPPED_AT_STATION_PROGRESS = 0.98;
    static final double INCOMING_MIN_PROGRESS = 0.85;
    static final double UNTIMED_PROGRESS = 0.5;

    private final MetrolinxFeedFetcher fetcher;
    private final MetrolinxTripUpdateSnapshots tripUpdates;

    public MetrolinxVehiclePositionClient(MetrolinxFeedFetcher fetcher, MetrolinxTripUpdateSnapshots tripUpdates) {
        this.fetcher = fetcher;
        this.tripUpdates = tripUpdates;
    }

    public RegionalTrainMarkerFeed fetchGo() {
        JsonNode vehiclePositions = fetcher.fetch(GO_PATH, GO_SOURCE);
        // Timing is optional for GO: without trip updates, markers keep their
        // status placement rather than disappearing.
        GoTripUpdateFeed goTrips;
        try {
            goTrips = tripUpdates.go();
        } catch (MetrolinxClientException unavailable) {
            goTrips = null;
        }
        GoTripUpdateFeed trips = goTrips;
        return parseVehiclePositions(vehiclePositions, GO_SOURCE, false, null,
            tripId -> trips == null ? Optional.empty()
                : trips.findTrip(tripId).map(found -> (Function<String, Optional<UpTripUpdateFeed.StopTime>>) found::stopTime));
    }

    public RegionalTrainMarkerFeed fetchUp() {
        JsonNode vehiclePositions = fetcher.fetch(UP_PATH, UP_SOURCE);
        UpTripUpdateFeed upTrips = tripUpdates.up();
        OffsetDateTime vehicleUpdatedAt = epoch(vehiclePositions.path("header").get("timestamp"));
        if (vehicleUpdatedAt == null || upTrips.sourceUpdatedAt() == null
            || Duration.between(vehicleUpdatedAt, upTrips.sourceUpdatedAt()).abs().compareTo(MAX_UP_FEED_SKEW) > 0) {
            throw new MetrolinxClientException("UP vehicle-position and trip-update snapshots are not aligned");
        }
        return parseVehiclePositions(vehiclePositions, UP_SOURCE, true, upTrips,
            tripId -> upTrips.findTrip(tripId)
                .map(found -> (Function<String, Optional<UpTripUpdateFeed.StopTime>>) found::stopTime));
    }

    private RegionalTrainMarkerFeed parseVehiclePositions(
        JsonNode root,
        String source,
        boolean upFeed,
        UpTripUpdateFeed upTripUpdates,
        Function<String, Optional<Function<String, Optional<UpTripUpdateFeed.StopTime>>>> stopTimesForTrip
    ) {
        if (!"FULL_DATASET".equalsIgnoreCase(root.path("header").path("incrementality").asText(""))
            || !root.path("entity").isArray()) {
            throw new MetrolinxClientException(source + " response was not a full dataset");
        }
        OffsetDateTime sourceUpdatedAt = epoch(root.path("header").get("timestamp"));
        List<RegionalTrainMarkerRecord> markers = new ArrayList<>();
        for (JsonNode entity : root.path("entity")) {
            JsonNode vehicle = entity.path("vehicle");
            JsonNode trip = vehicle.path("trip");
            String lineId = resolveLineId(trip.path("route_id").asText(""), upFeed);
            String stopStationId = RegionalNetworkCatalog.stationIdForStopCode(
                vehicle.path("stop_id").asText("")
            ).orElse(null);
            if (lineId == null || stopStationId == null) continue;
            RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(lineId).orElse(null);
            if (route == null) continue;
            String vehicleTripId = trip.path("trip_id").asText("").trim();
            UpTripUpdateFeed.Trip matchedUpTrip = upFeed && upTripUpdates != null
                ? upTripUpdates.findTrip(vehicleTripId).orElse(null)
                : null;
            // UP direction and identity need the matching trip (direction_id
            // conventions have differed across UP datasets).
            if (upFeed && matchedUpTrip == null) continue;
            JsonNode directionValue = trip.get("direction_id");
            Boolean inbound = matchedUpTrip != null
                ? matchedUpTrip.inbound()
                : directionValue == null || !directionValue.canConvertToInt()
                    ? null
                    : RegionalNetworkCatalog.isInboundDirection(lineId, directionValue.asInt()).orElse(null);
            String direction = matchedUpTrip != null
                ? matchedUpTrip.direction()
                : directionValue == null || !directionValue.canConvertToInt()
                    ? null
                    : RegionalNetworkCatalog.directionLabel(lineId, directionValue.asInt()).orElse(null);
            if (inbound == null || direction == null) continue;
            String status = vehicle.path("current_status").asText("").toUpperCase(Locale.CANADA);
            boolean stopped = "STOPPED_AT".equals(status);

            // Metrolinx's Union-bound direction ID varies by corridor. Resolve the
            // unique adjacent approach on the correct side of the topology instead
            // of assuming the flat station-list neighbor is physically connected.
            String fromStationId = RegionalNetworkCatalog.approachingFromStation(
                lineId, stopStationId, inbound
            ).orElse(null);
            String nextStationId = stopStationId;
            boolean waitingAtOrigin = false;
            if (fromStationId == null && stopped) {
                // Stopped at its first station (a terminal): show it at that
                // platform, at the start of the link it will leave on.
                nextStationId = RegionalNetworkCatalog.approachingFromStation(lineId, stopStationId, !inbound)
                    .orElse(null);
                fromStationId = stopStationId;
                waitingAtOrigin = true;
            }
            if (fromStationId == null || nextStationId == null) continue;
            RegionalNetworkCatalog.Segment segment = RegionalNetworkCatalog.segmentBetween(
                lineId, fromStationId, nextStationId
            ).orElse(null);
            if (segment == null) continue;
            String travelDirection = segment.stationAId().equals(fromStationId) ? "forward" : "reverse";
            String vehicleId = preferred(
                vehicle.path("vehicle").path("id").asText(""),
                matchedUpTrip == null ? entity.path("id").asText("") : matchedUpTrip.vehicleId()
            );
            String tripId = matchedUpTrip == null ? vehicleTripId : matchedUpTrip.tripId();
            OffsetDateTime updatedAt = epoch(vehicle.get("timestamp"));
            if (updatedAt == null) updatedAt = sourceUpdatedAt;

            Function<String, Optional<UpTripUpdateFeed.StopTime>> stopTimes =
                stopTimesForTrip.apply(vehicleTripId).orElse(stopCode -> Optional.empty());
            String fromStopCode = RegionalNetworkCatalog.stopCodeForStationId(fromStationId).orElse(null);
            String nextStopCode = RegionalNetworkCatalog.stopCodeForStationId(nextStationId).orElse(null);
            UpTripUpdateFeed.StopTime fromStop = stopTimes.apply(fromStopCode).orElse(null);
            UpTripUpdateFeed.StopTime nextStop = stopTimes.apply(nextStopCode).orElse(null);
            int segmentTravelSeconds = segmentTravelSeconds(lineId, fromStop, nextStop);
            OffsetDateTime arrivesAt = nextStop == null ? null : nextStop.reachedAt();

            double progress;
            boolean timed = false;
            if (waitingAtOrigin) {
                progress = 0;
            } else if (stopped) {
                progress = STOPPED_AT_STATION_PROGRESS;
            } else if (arrivesAt != null && updatedAt != null) {
                long remainingSeconds = Duration.between(updatedAt, arrivesAt).toSeconds();
                // A prediction further out than the whole link means the train
                // has not left yet: hold it at the station it is leaving.
                progress = clamp(1 - remainingSeconds / (double) Math.max(1, segmentTravelSeconds), 0, MAX_TIMED_PROGRESS);
                timed = true;
            } else {
                progress = UNTIMED_PROGRESS;
            }
            if ("INCOMING_AT".equals(status)) progress = Math.max(INCOMING_MIN_PROGRESS, progress);

            OffsetDateTime predictedAt = arrivesAt;
            if (predictedAt == null && updatedAt != null) {
                predictedAt = updatedAt.plusSeconds(Math.max(1, Math.round((1 - progress) * segmentTravelSeconds)));
            }
            markers.add(new RegionalTrainMarkerRecord(
                preferred(entity.path("id").asText(""), lineId + ":" + tripId + ":" + vehicleId),
                lineId, direction, travelDirection, segment.id(),
                fromStationId, nextStationId, nextStationId, progress, segmentTravelSeconds, predictedAt,
                !stopped, timed, vehicleId, tripId, updatedAt, source
            ));
        }
        return new RegionalTrainMarkerFeed(sourceUpdatedAt, source, List.copyOf(markers));
    }

    /** Departure from the previous stop to arrival at the next, else a typical link time. */
    private int segmentTravelSeconds(
        String lineId,
        UpTripUpdateFeed.StopTime fromStop,
        UpTripUpdateFeed.StopTime nextStop
    ) {
        int fallback = "regional-up".equals(lineId) ? 300 : 420;
        if (fromStop == null || nextStop == null) return fallback;
        long seconds = Duration.between(fromStop.predictedAt(), nextStop.reachedAt()).toSeconds();
        return seconds >= 60 && seconds <= 1_200 ? (int) seconds : fallback;
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private String resolveLineId(String routeId, boolean upFeed) {
        if (upFeed) return "regional-up";
        String normalized = routeId == null ? "" : routeId.trim();
        String lineId = RegionalNetworkCatalog.lineIdForSourceCode(normalized).orElse(null);
        if (lineId != null) return lineId;

        int separator = normalized.lastIndexOf('-');
        if (separator < 0 || separator == normalized.length() - 1) return null;
        return RegionalNetworkCatalog.lineIdForSourceCode(normalized.substring(separator + 1)).orElse(null);
    }

    private OffsetDateTime epoch(JsonNode value) {
        return value == null || !value.canConvertToLong() ? null
            : OffsetDateTime.ofInstant(Instant.ofEpochSecond(value.asLong()), ZoneOffset.UTC);
    }

    private String preferred(String first, String second) {
        String primary = first == null ? "" : first.trim();
        return primary.isEmpty() ? (second == null ? "" : second.trim()) : primary;
    }
}
