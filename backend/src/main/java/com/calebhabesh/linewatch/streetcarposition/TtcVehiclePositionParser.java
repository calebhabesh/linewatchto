package com.calebhabesh.linewatch.streetcarposition;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Reads the GTFS-RT VehiclePosition feed in protobuf text format, line by line. A feed
 * without a header timestamp is rejected, so the poller keeps its last-good snapshot.
 */
@Component
public class TtcVehiclePositionParser {

    public Feed parse(String text) {
        if (text == null || text.isBlank()) throw new IllegalArgumentException("Empty TTC vehicle position feed");
        Deque<String> path = new ArrayDeque<>();
        Long headerTimestamp = null;
        List<Vehicle> vehicles = new ArrayList<>();
        Builder current = null;
        for (String raw : text.split("\n")) {
            String line = raw.strip();
            if (line.isEmpty()) continue;
            if (line.endsWith("{")) {
                String name = line.substring(0, line.length() - 1).strip();
                path.push(name);
                if (path.size() == 1 && "entity".equals(name)) current = new Builder();
                continue;
            }
            if (line.equals("}")) {
                if (path.isEmpty()) throw new IllegalArgumentException("Unbalanced TTC vehicle position feed");
                String closed = path.pop();
                if (path.isEmpty() && "entity".equals(closed) && current != null) {
                    Vehicle vehicle = current.build();
                    if (vehicle != null) vehicles.add(vehicle);
                    current = null;
                }
                continue;
            }
            int colon = line.indexOf(':');
            if (colon < 0) continue;
            String key = line.substring(0, colon).strip();
            String value = line.substring(colon + 1).strip();
            String scope = scope(path);
            if ("header".equals(scope) && "timestamp".equals(key)) {
                headerTimestamp = parseLong(value);
            } else if (current != null) {
                current.accept(scope, key, value);
            }
        }
        if (!path.isEmpty()) throw new IllegalArgumentException("Truncated TTC vehicle position feed");
        if (headerTimestamp == null) throw new IllegalArgumentException("TTC vehicle position feed has no header timestamp");
        return new Feed(epoch(headerTimestamp), List.copyOf(vehicles));
    }

    /** The open blocks from the outermost, joined by '/': "entity/vehicle/trip". */
    private static String scope(Deque<String> path) {
        StringBuilder result = new StringBuilder();
        var iterator = path.descendingIterator();
        while (iterator.hasNext()) {
            if (!result.isEmpty()) result.append('/');
            result.append(iterator.next());
        }
        return result.toString();
    }

    private static String unquote(String value) {
        if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            return value.substring(1, value.length() - 1).replace("\\\"", "\"").replace("\\\\", "\\");
        }
        return value;
    }

    private static Long parseLong(String value) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static Double parseDouble(String value) {
        try {
            double parsed = Double.parseDouble(value);
            return Double.isFinite(parsed) ? parsed : null;
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static OffsetDateTime epoch(Long seconds) {
        return seconds == null ? null : OffsetDateTime.ofInstant(Instant.ofEpochSecond(seconds), ZoneOffset.UTC);
    }

    private static final class Builder {
        private String tripId;
        private String routeId;
        private String tripRelationship;
        private Double latitude;
        private Double longitude;
        private Double bearing;
        private Long timestamp;
        private String stopId;
        private String currentStatus;
        private String vehicleId;

        void accept(String scope, String key, String value) {
            switch (scope) {
                case "entity/vehicle/trip" -> {
                    if ("trip_id".equals(key)) tripId = unquote(value);
                    else if ("route_id".equals(key)) routeId = unquote(value);
                    else if ("schedule_relationship".equals(key)) tripRelationship = value;
                }
                case "entity/vehicle/position" -> {
                    if ("latitude".equals(key)) latitude = parseDouble(value);
                    else if ("longitude".equals(key)) longitude = parseDouble(value);
                    else if ("bearing".equals(key)) bearing = parseDouble(value);
                }
                case "entity/vehicle" -> {
                    if ("timestamp".equals(key)) timestamp = parseLong(value);
                    else if ("stop_id".equals(key)) stopId = unquote(value);
                    else if ("current_status".equals(key)) currentStatus = value;
                }
                case "entity/vehicle/vehicle" -> {
                    if ("id".equals(key)) vehicleId = unquote(value);
                }
                default -> {
                }
            }
        }

        Vehicle build() {
            if (latitude == null || longitude == null) return null;
            return new Vehicle(vehicleId, tripId, routeId, tripRelationship, latitude, longitude, bearing,
                epoch(timestamp), stopId, currentStatus);
        }
    }

    public record Feed(OffsetDateTime sourceUpdatedAt, List<Vehicle> vehicles) {
    }

    public record Vehicle(
        String vehicleId,
        String tripId,
        String routeId,
        String tripRelationship,
        double latitude,
        double longitude,
        Double bearing,
        OffsetDateTime reportedAt,
        String stopId,
        String currentStatus
    ) {
    }
}
