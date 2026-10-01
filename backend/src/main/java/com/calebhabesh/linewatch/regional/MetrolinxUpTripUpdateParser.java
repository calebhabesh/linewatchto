package com.calebhabesh.linewatch.regional;

import tools.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;

@Component
public class MetrolinxUpTripUpdateParser {
    public UpTripUpdateFeed parse(JsonNode root) {
        if (!"FULL_DATASET".equalsIgnoreCase(root.path("header").path("incrementality").asText(""))
            || !root.path("entity").isArray()) {
            throw new MetrolinxClientException("Metrolinx UP trip-update response was not a full dataset");
        }

        List<UpTripUpdateFeed.Trip> trips = new ArrayList<>();
        for (JsonNode entity : root.path("entity")) {
            JsonNode tripUpdate = entity.path("trip_update");
            JsonNode tripNode = tripUpdate.path("trip");
            String tripId = preferred(
                tripNode.path("trip_id").asText(""),
                entity.path("id").asText("")
            );
            if (tripId.isBlank()) continue;

            List<UpTripUpdateFeed.StopTime> stopTimes = parseStopTimes(tripUpdate.path("stop_time_update"));
            Boolean sequenceInbound = sequenceInbound(stopTimes);
            Boolean labelInbound = destinationInbound(tripUpdate.path("vehicle").path("label").asText(""));
            Boolean directionIdInbound = directionIdInbound(tripNode.get("direction_id"));
            Boolean inbound = resolvedDirection(sequenceInbound, labelInbound, directionIdInbound);
            if (inbound == null) continue;

            int canonicalDirectionId = inbound ? 1 : 0;
            String direction = RegionalNetworkCatalog.directionLabel("regional-up", canonicalDirectionId).orElse(null);
            String destination = RegionalNetworkCatalog.directionDestination("regional-up", canonicalDirectionId).orElse(null);
            if (direction == null || destination == null) continue;

            trips.add(new UpTripUpdateFeed.Trip(
                tripId,
                tripUpdate.path("vehicle").path("id").asText("").trim(),
                inbound,
                direction,
                destination,
                stopTimes
            ));
        }
        return new UpTripUpdateFeed(epoch(root.path("header").get("timestamp")), List.copyOf(trips));
    }

    private List<UpTripUpdateFeed.StopTime> parseStopTimes(JsonNode updates) {
        if (!updates.isArray()) return List.of();
        List<UpTripUpdateFeed.StopTime> stopTimes = new ArrayList<>();
        for (JsonNode update : updates) {
            String stopCode = update.path("stop_id").asText("").trim();
            if (stopCode.isBlank()) continue;
            JsonNode event = update.path("departure").isObject()
                ? update.path("departure") : update.path("arrival");
            OffsetDateTime predictedAt = epoch(event.get("time"));
            if (predictedAt == null) continue;
            long delay = Math.max(0, event.path("delay").asLong(0));
            stopTimes.add(new UpTripUpdateFeed.StopTime(
                stopCode,
                predictedAt.minusSeconds(delay),
                predictedAt
            ));
        }
        return List.copyOf(stopTimes);
    }

    private Boolean sequenceInbound(List<UpTripUpdateFeed.StopTime> stopTimes) {
        Integer previousIndex = null;
        for (UpTripUpdateFeed.StopTime stopTime : stopTimes) {
            String stationId = RegionalNetworkCatalog.stationIdForStopCode(stopTime.stopCode()).orElse(null);
            if (stationId == null) continue;
            int index = RegionalNetworkCatalog.route("regional-up").orElseThrow().stationIds().indexOf(stationId);
            if (index < 0) continue;
            if (previousIndex != null && index != previousIndex) {
                return index < previousIndex;
            }
            previousIndex = index;
        }
        return null;
    }

    private Boolean destinationInbound(String label) {
        String destination = label == null ? "" : label.toLowerCase(Locale.CANADA)
            .replaceAll("[^a-z0-9]+", " ")
            .trim();
        boolean union = destination.contains("union");
        boolean pearson = destination.contains("pearson");
        if (union == pearson) return null;
        if (union) return true;
        if (pearson) return false;
        return null;
    }

    private Boolean directionIdInbound(JsonNode value) {
        if (value == null || !value.canConvertToInt()) return null;
        return RegionalNetworkCatalog.isInboundDirection("regional-up", value.asInt()).orElse(null);
    }

    private Boolean resolvedDirection(Boolean sequence, Boolean label, Boolean directionId) {
        // Ordered stop updates and the rider-facing destination describe the
        // actual trip. direction_id is only a fallback because its convention
        // has differed across Metrolinx UP datasets in the past.
        if (sequence != null && label != null) return sequence.equals(label) ? sequence : null;
        if (sequence != null) return sequence;
        if (label != null) return label;
        return directionId;
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
