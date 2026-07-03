package com.calebhabesh.linewatch.arrival.live;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class GtfsRtSubwayTripUpdateTextParser {
    private static final Pattern HEADER_TIMESTAMP = Pattern.compile("\\btimestamp:\\s*(\\d+)");
    private static final Pattern QUOTED_ID = Pattern.compile("\\bid:\\s*\"((?:\\\\.|[^\"])*)\"");
    private static final Pattern TRIP_ID = Pattern.compile("\\btrip_id:\\s*\"((?:\\\\.|[^\"])*)\"");
    private static final Pattern ROUTE_ID = Pattern.compile("\\broute_id:\\s*\"((?:\\\\.|[^\"])*)\"");
    private static final Pattern STOP_ID = Pattern.compile("\\bstop_id:\\s*\"((?:\\\\.|[^\"])*)\"");
    private static final Pattern STOP_SEQUENCE = Pattern.compile("\\bstop_sequence:\\s*(\\d+)");
    private static final Pattern TIME = Pattern.compile("\\btime:\\s*(\\d+)");
    private static final Pattern SCHEDULE_RELATIONSHIP = Pattern.compile("\\bschedule_relationship:\\s*([A-Z_]+)");

    public GtfsRtSubwayTripUpdateFeed parse(String body) {
        if (body == null || body.isBlank()) {
            return new GtfsRtSubwayTripUpdateFeed(null, List.of());
        }

        OffsetDateTime feedCreatedAt = feedCreatedAt(body).orElse(null);
        List<GtfsRtSubwayTripUpdate> trips = new ArrayList<>();
        for (String entity : blocks(body, "entity")) {
            GtfsRtSubwayTripUpdate trip = parseEntity(entity);
            if (trip != null) {
                trips.add(trip);
            }
        }
        return new GtfsRtSubwayTripUpdateFeed(feedCreatedAt, trips);
    }

    public Optional<OffsetDateTime> feedCreatedAt(String body) {
        if (body == null || body.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(epoch(findLong(HEADER_TIMESTAMP, body)));
    }

    private GtfsRtSubwayTripUpdate parseEntity(String entity) {
        String tripUpdate = firstBlock(entity, "trip_update");
        if (tripUpdate == null) {
            return null;
        }

        String tripDescriptor = firstBlock(tripUpdate, "trip");
        if (tripDescriptor == null) {
            return null;
        }

        String routeId = firstQuoted(ROUTE_ID, tripDescriptor);
        String lineId = lineIdForRoute(routeId);
        if (lineId == null) {
            return null;
        }

        String entityId = firstQuoted(QUOTED_ID, entity);
        String direction = directionFromEntityId(entityId);
        if (direction == null) {
            return null;
        }

        List<GtfsRtSubwayStopTimeUpdate> stopUpdates = new ArrayList<>();
        for (String stopTimeUpdate : blocks(tripUpdate, "stop_time_update")) {
            GtfsRtSubwayStopTimeUpdate parsed = parseStopTimeUpdate(stopTimeUpdate);
            if (parsed != null) {
                stopUpdates.add(parsed);
            }
        }
        if (stopUpdates.isEmpty()) {
            return null;
        }

        return new GtfsRtSubwayTripUpdate(
            entityId,
            firstQuoted(TRIP_ID, tripDescriptor),
            routeId,
            lineId,
            direction,
            vehicleId(tripUpdate),
            stopUpdates
        );
    }

    private GtfsRtSubwayStopTimeUpdate parseStopTimeUpdate(String stopTimeUpdate) {
        String relationship = firstToken(SCHEDULE_RELATIONSHIP, stopTimeUpdate);
        if ("SKIPPED".equals(relationship) || "NO_DATA".equals(relationship)) {
            return null;
        }

        String stopId = firstQuoted(STOP_ID, stopTimeUpdate);
        Long arrivalEpoch = timeInBlock(stopTimeUpdate, "arrival");
        Long departureEpoch = timeInBlock(stopTimeUpdate, "departure");
        if (stopId == null || (arrivalEpoch == null && departureEpoch == null)) {
            return null;
        }
        Long sequence = findLong(STOP_SEQUENCE, stopTimeUpdate);
        return new GtfsRtSubwayStopTimeUpdate(
            stopId,
            sequence == null ? 0 : sequence.intValue(),
            arrivalEpoch == null ? null : epoch(arrivalEpoch),
            departureEpoch == null ? null : epoch(departureEpoch)
        );
    }

    private Long timeInBlock(String stopTimeUpdate, String blockName) {
        String block = firstBlock(stopTimeUpdate, blockName);
        return block == null ? null : findLong(TIME, block);
    }

    private String vehicleId(String tripUpdate) {
        String vehicle = firstBlock(tripUpdate, "vehicle");
        return vehicle == null ? null : firstQuoted(QUOTED_ID, vehicle);
    }

    private String lineIdForRoute(String routeId) {
        if (routeId == null) {
            return null;
        }
        return switch (routeId) {
            case "1" -> "line-1";
            case "2" -> "line-2";
            case "4" -> "line-4";
            case "5" -> "line-5";
            case "6" -> "line-6";
            default -> null;
        };
    }

    private String directionFromEntityId(String entityId) {
        if (entityId == null || !entityId.contains("|")) {
            return null;
        }
        String suffix = entityId.substring(entityId.lastIndexOf('|') + 1).trim();
        return switch (suffix.toLowerCase()) {
            case "north", "northbound" -> "Northbound";
            case "south", "southbound" -> "Southbound";
            case "east", "eastbound" -> "Eastbound";
            case "west", "westbound" -> "Westbound";
            default -> null;
        };
    }

    private List<String> blocks(String text, String name) {
        List<String> result = new ArrayList<>();
        String marker = name + " {";
        int searchAt = 0;
        while (searchAt < text.length()) {
            int start = text.indexOf(marker, searchAt);
            if (start < 0) {
                break;
            }
            int openBrace = start + name.length() + 1;
            int end = matchingBrace(text, openBrace);
            if (end < 0) {
                break;
            }
            result.add(text.substring(start, end + 1));
            searchAt = end + 1;
        }
        return result;
    }

    private String firstBlock(String text, String name) {
        List<String> found = blocks(text, name);
        return found.isEmpty() ? null : found.getFirst();
    }

    private int matchingBrace(String text, int openBrace) {
        int depth = 0;
        for (int i = openBrace; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '{') {
                depth++;
            } else if (ch == '}') {
                depth--;
                if (depth == 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    private String firstQuoted(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? unescape(matcher.group(1)) : null;
    }

    private String firstToken(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? matcher.group(1) : null;
    }

    private Long findLong(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? Long.parseLong(matcher.group(1)) : null;
    }

    private OffsetDateTime epoch(Long epochSeconds) {
        return epochSeconds == null
            ? null
            : OffsetDateTime.ofInstant(Instant.ofEpochSecond(epochSeconds), ZoneOffset.UTC);
    }

    private String unescape(String value) {
        return value
            .replace("\\\"", "\"")
            .replace("\\\\", "\\");
    }
}
