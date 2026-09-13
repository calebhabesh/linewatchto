package com.calebhabesh.linewatch.surfacearrival;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class TtcSurfaceTripUpdateParser {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern HEADER_TIMESTAMP = Pattern.compile("\\btimestamp:\\s*(\\d+)");
    private static final Pattern TRIP_ID = Pattern.compile("\\btrip_id:\\s*\"((?:\\\\.|[^\"])*)\"");
    private static final Pattern ROUTE_ID = Pattern.compile("\\broute_id:\\s*\"((?:\\\\.|[^\"])*)\"");
    private static final Pattern STOP_ID = Pattern.compile("\\bstop_id:\\s*\"((?:\\\\.|[^\"])*)\"");
    private static final Pattern TIME = Pattern.compile("\\btime:\\s*(\\d+)");
    private static final Pattern DELAY = Pattern.compile("\\bdelay:\\s*(-?\\d+)");
    private static final Pattern RELATIONSHIP = Pattern.compile("\\bschedule_relationship:\\s*([A-Z_]+)");

    public Feed parse(String text) {
        if (text == null || text.isBlank()) return new Feed(null, List.of());
        if (text.stripLeading().startsWith("{")) return parseJson(text);
        List<TripUpdate> trips = new ArrayList<>();
        for (String entity : blocks(text, "entity")) {
            String update = firstBlock(entity, "trip_update");
            String descriptor = update == null ? null : firstBlock(update, "trip");
            if (descriptor == null || "CANCELED".equals(token(RELATIONSHIP, descriptor))) continue;
            String tripId = quoted(TRIP_ID, descriptor);
            String routeId = quoted(ROUTE_ID, descriptor);
            if (tripId == null && routeId == null) continue;
            List<StopUpdate> stops = new ArrayList<>();
            for (String stop : blocks(update, "stop_time_update")) {
                String relationship = token(RELATIONSHIP, stop);
                if ("SKIPPED".equals(relationship) || "NO_DATA".equals(relationship)) continue;
                String stopId = quoted(STOP_ID, stop);
                Event arrival = event(stop, "arrival");
                Event departure = event(stop, "departure");
                Event preferred = arrival != null ? arrival : departure;
                if (stopId != null && preferred != null) stops.add(new StopUpdate(stopId, preferred));
            }
            if (!stops.isEmpty()) trips.add(new TripUpdate(tripId, routeId, List.copyOf(stops)));
        }
        return new Feed(epoch(number(HEADER_TIMESTAMP, text)), List.copyOf(trips));
    }

    // The TTC endpoint can return protobuf JSON even when format=text is requested.
    private Feed parseJson(String text) {
        try {
            JsonNode root = JSON.readTree(text);
            if (!root.path("header").hasNonNull("timestamp") || !root.path("entity").isArray()) {
                throw new IllegalArgumentException("Invalid TTC surface TripUpdates JSON feed");
            }
            List<TripUpdate> trips = new ArrayList<>();
            for (JsonNode entity : root.path("entity")) {
                JsonNode update = entity.path("tripUpdate");
                JsonNode trip = update.path("trip");
                if ("CANCELED".equals(trip.path("scheduleRelationship").asText())) continue;
                String tripId = trip.path("tripId").asText(null);
                String routeId = trip.path("routeId").asText(null);
                if (tripId == null && routeId == null) continue;
                List<StopUpdate> stops = new ArrayList<>();
                for (JsonNode stop : update.path("stopTimeUpdate")) {
                    String relationship = stop.path("scheduleRelationship").asText();
                    if ("SKIPPED".equals(relationship) || "NO_DATA".equals(relationship)) continue;
                    String stopId = stop.path("stopId").asText(null);
                    Event arrival = jsonEvent(stop.path("arrival"));
                    Event preferred = arrival != null ? arrival : jsonEvent(stop.path("departure"));
                    if (stopId != null && preferred != null) stops.add(new StopUpdate(stopId, preferred));
                }
                if (!stops.isEmpty()) trips.add(new TripUpdate(tripId, routeId, List.copyOf(stops)));
            }
            return new Feed(epoch(Long.parseLong(root.path("header").path("timestamp").asText())), List.copyOf(trips));
        } catch (java.io.IOException exception) {
            throw new IllegalArgumentException("Invalid TTC surface TripUpdates JSON feed", exception);
        }
    }

    private Event jsonEvent(JsonNode event) {
        if (!event.hasNonNull("time")) return null;
        return new Event(epoch(Long.parseLong(event.path("time").asText())),
            event.hasNonNull("delay") ? Integer.valueOf(event.path("delay").asText()) : null);
    }

    private Event event(String text, String name) {
        String block = firstBlock(text, name);
        if (block == null) return null;
        Long time = number(TIME, block);
        if (time == null) return null;
        Long delay = number(DELAY, block);
        return new Event(epoch(time), delay == null ? null : delay.intValue());
    }

    private List<String> blocks(String text, String name) {
        List<String> result = new ArrayList<>();
        String marker = name + " {";
        int at = 0;
        while (at < text.length()) {
            int start = text.indexOf(marker, at);
            if (start < 0) break;
            int open = start + name.length() + 1;
            int end = matchingBrace(text, open);
            if (end < 0) break;
            result.add(text.substring(start, end + 1));
            at = end + 1;
        }
        return result;
    }

    private String firstBlock(String text, String name) {
        List<String> found = blocks(text, name);
        return found.isEmpty() ? null : found.getFirst();
    }

    private int matchingBrace(String text, int open) {
        int depth = 0;
        for (int i = open; i < text.length(); i++) {
            if (text.charAt(i) == '{') depth++;
            if (text.charAt(i) == '}' && --depth == 0) return i;
        }
        return -1;
    }

    private String quoted(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? matcher.group(1).replace("\\\"", "\"").replace("\\\\", "\\") : null;
    }

    private String token(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? matcher.group(1) : null;
    }

    private Long number(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? Long.parseLong(matcher.group(1)) : null;
    }

    private OffsetDateTime epoch(Long value) {
        return value == null ? null : OffsetDateTime.ofInstant(Instant.ofEpochSecond(value), ZoneOffset.UTC);
    }

    public record Feed(OffsetDateTime sourceUpdatedAt, List<TripUpdate> trips) {
    }
    public record TripUpdate(String tripId, String routeId, List<StopUpdate> stops) {
    }
    public record StopUpdate(String stopId, Event event) {
    }
    public record Event(OffsetDateTime predictedAt, Integer delaySeconds) {
        OffsetDateTime scheduledAt() {
            return delaySeconds == null ? null : predictedAt.minusSeconds(delaySeconds);
        }
    }
}
