package com.calebhabesh.linewatch.regional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class MetrolinxVehiclePositionClient {
    static final String GO_SOURCE = "Metrolinx GO GTFS-RT VehiclePosition";
    static final String UP_SOURCE = "Metrolinx UP Express GTFS-RT VehiclePosition reconciled with TripUpdates";
    private static final String GO_PATH = "api/V1/Gtfs/Feed/VehiclePosition";
    private static final String UP_PATH = "api/V1/UP/Gtfs/Feed/VehiclePosition";
    private static final Duration MAX_UP_FEED_SKEW = Duration.ofMinutes(2);

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final MetrolinxProperties properties;
    private final MetrolinxUpTripUpdateParser upTripUpdateParser;

    public MetrolinxVehiclePositionClient(
        RestClient metrolinxRestClient,
        ObjectMapper objectMapper,
        MetrolinxProperties properties,
        MetrolinxUpTripUpdateParser upTripUpdateParser
    ) {
        this.restClient = metrolinxRestClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.upTripUpdateParser = upTripUpdateParser;
    }

    public RegionalTrainMarkerFeed fetchGo() {
        return parseVehiclePositions(fetchJson(GO_PATH, GO_SOURCE), GO_SOURCE, false, null);
    }

    public RegionalTrainMarkerFeed fetchUp() {
        JsonNode vehiclePositions = fetchJson(UP_PATH, UP_SOURCE);
        UpTripUpdateFeed tripUpdates = upTripUpdateParser.parse(fetchJson(
            MetrolinxArrivalClient.UP_TRIP_UPDATES_PATH,
            "Metrolinx UP Express GTFS-RT TripUpdates"
        ));
        OffsetDateTime vehicleUpdatedAt = epoch(vehiclePositions.path("header").get("timestamp"));
        if (vehicleUpdatedAt == null || tripUpdates.sourceUpdatedAt() == null
            || Duration.between(vehicleUpdatedAt, tripUpdates.sourceUpdatedAt()).abs().compareTo(MAX_UP_FEED_SKEW) > 0) {
            throw new MetrolinxClientException("UP vehicle-position and trip-update snapshots are not aligned");
        }
        return parseVehiclePositions(vehiclePositions, UP_SOURCE, true, tripUpdates);
    }

    private RegionalTrainMarkerFeed parseVehiclePositions(
        JsonNode root,
        String source,
        boolean upFeed,
        UpTripUpdateFeed upTripUpdates
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
            String nextStationId = RegionalNetworkCatalog.stationIdForStopCode(
                vehicle.path("stop_id").asText("")
            ).orElse(null);
            if (lineId == null || nextStationId == null) continue;
            RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(lineId).orElse(null);
            if (route == null) continue;
            String vehicleTripId = trip.path("trip_id").asText("").trim();
            UpTripUpdateFeed.Trip matchedUpTrip = upFeed && upTripUpdates != null
                ? upTripUpdates.findTrip(vehicleTripId).orElse(null)
                : null;
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
            if (upFeed && matchedUpTrip == null) continue;
            if (inbound == null || direction == null) continue;
            // Metrolinx's Union-bound direction ID varies by corridor. Resolve the
            // unique adjacent approach on the correct side of the topology instead
            // of assuming the flat station-list neighbor is physically connected.
            String fromStationId = RegionalNetworkCatalog.approachingFromStation(
                lineId, nextStationId, inbound
            ).orElse(null);
            if (fromStationId == null) continue;
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
            String status = vehicle.path("current_status").asText("").toUpperCase(Locale.CANADA);
            OffsetDateTime updatedAt = epoch(vehicle.get("timestamp"));
            if (updatedAt == null) updatedAt = sourceUpdatedAt;
            int segmentTravelSeconds = segmentTravelSeconds(lineId, fromStationId, nextStationId, matchedUpTrip);
            OffsetDateTime predictedAt = matchedUpTrip == null ? null
                : matchedUpTrip.stopTime(vehicle.path("stop_id").asText(""))
                    .map(UpTripUpdateFeed.StopTime::predictedAt)
                    .orElse(null);
            if (upFeed && predictedAt == null) continue;
            double progress = markerProgress(status, updatedAt, predictedAt, segmentTravelSeconds);
            if (predictedAt == null && updatedAt != null) {
                predictedAt = updatedAt.plusSeconds(Math.max(1, Math.round((1 - progress) * segmentTravelSeconds)));
            }
            boolean moving = !"STOPPED_AT".equals(status);
            markers.add(new RegionalTrainMarkerRecord(
                preferred(entity.path("id").asText(""), lineId + ":" + tripId + ":" + vehicleId),
                lineId, direction, travelDirection, segment.id(),
                fromStationId, nextStationId, nextStationId, progress, segmentTravelSeconds, predictedAt,
                moving, vehicleId, tripId, updatedAt, source
            ));
        }
        return new RegionalTrainMarkerFeed(sourceUpdatedAt, source, List.copyOf(markers));
    }

    private int segmentTravelSeconds(
        String lineId,
        String fromStationId,
        String nextStationId,
        UpTripUpdateFeed.Trip matchedUpTrip
    ) {
        int fallback = "regional-up".equals(lineId) ? 300 : 420;
        if (matchedUpTrip == null) return fallback;
        String fromStopCode = RegionalNetworkCatalog.stopCodeForStationId(fromStationId).orElse(null);
        String nextStopCode = RegionalNetworkCatalog.stopCodeForStationId(nextStationId).orElse(null);
        OffsetDateTime fromTime = matchedUpTrip.stopTime(fromStopCode)
            .map(UpTripUpdateFeed.StopTime::predictedAt).orElse(null);
        OffsetDateTime nextTime = matchedUpTrip.stopTime(nextStopCode)
            .map(UpTripUpdateFeed.StopTime::predictedAt).orElse(null);
        if (fromTime == null || nextTime == null) return fallback;
        long seconds = Duration.between(fromTime, nextTime).abs().toSeconds();
        return seconds >= 60 && seconds <= 1_200 ? (int) seconds : fallback;
    }

    private double markerProgress(
        String status,
        OffsetDateTime updatedAt,
        OffsetDateTime predictedAt,
        int segmentTravelSeconds
    ) {
        if ("STOPPED_AT".equals(status)) return 0.98;
        double progress = 0.5;
        if (updatedAt != null && predictedAt != null) {
            long remainingSeconds = Duration.between(updatedAt, predictedAt).toSeconds();
            progress = 1 - (remainingSeconds / (double) Math.max(1, segmentTravelSeconds));
        }
        if ("INCOMING_AT".equals(status)) progress = Math.max(0.85, progress);
        return Math.max(0.05, Math.min(0.95, progress));
    }

    private JsonNode fetchJson(String path, String source) {
        if (!properties.isConfigured()) throw new MetrolinxClientException("Metrolinx API key is not configured");
        try {
            String body = restClient.get().uri(uri(path)).retrieve().body(String.class);
            JsonNode root = objectMapper.readTree(body);
            if (root == null || !root.isObject()) throw new IllegalArgumentException("payload is not an object");
            return root;
        } catch (MetrolinxClientException exception) {
            throw exception;
        } catch (Exception ignored) {
            throw new MetrolinxClientException("Unable to fetch " + source);
        }
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

    private URI uri(String path) {
        return UriComponentsBuilder.fromUri(properties.getBaseUrl()).path(path)
            .queryParam("key", properties.getApiKey()).build().encode().toUri();
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
