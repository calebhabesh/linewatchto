package com.calebhabesh.linewatch.regional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class MetrolinxVehiclePositionClient {
    static final String GO_SOURCE = "Metrolinx GO GTFS-RT VehiclePosition";
    static final String UP_SOURCE = "Metrolinx UP Express GTFS-RT VehiclePosition";
    private static final String GO_PATH = "api/V1/Gtfs/Feed/VehiclePosition";
    private static final String UP_PATH = "api/V1/UP/Gtfs/Feed/VehiclePosition";

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final MetrolinxProperties properties;

    public MetrolinxVehiclePositionClient(
        RestClient metrolinxRestClient,
        ObjectMapper objectMapper,
        MetrolinxProperties properties
    ) {
        this.restClient = metrolinxRestClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public RegionalTrainMarkerFeed fetchGo() { return fetch(GO_PATH, GO_SOURCE, false); }
    public RegionalTrainMarkerFeed fetchUp() { return fetch(UP_PATH, UP_SOURCE, true); }

    private RegionalTrainMarkerFeed fetch(String path, String source, boolean upFeed) {
        JsonNode root = fetchJson(path, source);
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
            int directionId = trip.path("direction_id").asInt(0);
            int nextIndex = route.stationIds().indexOf(nextStationId);
            int previousIndex = directionId == 1 ? nextIndex + 1 : nextIndex - 1;
            if (nextIndex < 0 || previousIndex < 0 || previousIndex >= route.stationIds().size()) continue;
            String fromStationId = route.stationIds().get(previousIndex);
            RegionalNetworkCatalog.Segment segment = RegionalNetworkCatalog.segmentBetween(
                lineId, fromStationId, nextStationId
            ).orElse(null);
            if (segment == null) continue;
            String vehicleId = preferred(vehicle.path("vehicle").path("id").asText(""), entity.path("id").asText(""));
            String tripId = trip.path("trip_id").asText("").trim();
            String status = vehicle.path("current_status").asText("").toUpperCase(Locale.CANADA);
            double progress = "INCOMING_AT".equals(status) ? 0.85 : "STOPPED_AT".equals(status) ? 0.98 : 0.5;
            int segmentTravelSeconds = "regional-up".equals(lineId) ? 300 : 420;
            boolean moving = !"STOPPED_AT".equals(status);
            OffsetDateTime updatedAt = epoch(vehicle.get("timestamp"));
            if (updatedAt == null) updatedAt = sourceUpdatedAt;
            OffsetDateTime predictedAt = updatedAt == null ? null : updatedAt.plusSeconds(
                Math.max(1, Math.round((1 - progress) * segmentTravelSeconds))
            );
            String direction = directionId == 1 ? "Inbound" : "Outbound";
            markers.add(new RegionalTrainMarkerRecord(
                preferred(entity.path("id").asText(""), lineId + ":" + tripId + ":" + vehicleId),
                lineId, direction, directionId == 1 ? "reverse" : "forward", segment.id(),
                fromStationId, nextStationId, nextStationId, progress, segmentTravelSeconds, predictedAt,
                moving, vehicleId, tripId, updatedAt, source
            ));
        }
        return new RegionalTrainMarkerFeed(sourceUpdatedAt, source, List.copyOf(markers));
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
