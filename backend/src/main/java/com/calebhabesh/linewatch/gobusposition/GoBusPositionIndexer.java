package com.calebhabesh.linewatch.gobusposition;

import com.calebhabesh.linewatch.gobusposition.GoBusPositionSnapshot.GoBusPosition;
import com.calebhabesh.linewatch.gobusposition.GoBusPositionSnapshot.Omitted;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * Picks the GO buses out of the GO VehiclePosition feed (plan 13, S9). GO route ids carry a
 * schedule prefix ("09261126-41"); a bus route's number is digits, a rail line's code is letters
 * ("09261126-LE"), and trains are left to the train markers. The feed publishes no heading for
 * buses (bearing and speed are 0 on every bus, 2026-11-03), so none is kept.
 */
@Component
public class GoBusPositionIndexer {
    static final ZoneId TORONTO = ZoneId.of("America/Toronto");
    private static final Pattern BUS_ROUTE = Pattern.compile("^\\d{1,3}[A-Za-z]?$");
    private static final Pattern GTFS_TIME = Pattern.compile("^(\\d{1,2}):(\\d{2}):(\\d{2})$");
    private static final DateTimeFormatter GTFS_DATE = DateTimeFormatter.BASIC_ISO_DATE;

    public GoBusPositionSnapshot index(JsonNode root) {
        OffsetDateTime sourceUpdatedAt = epoch(root.path("header").get("timestamp"));
        List<GoBusPosition> buses = new ArrayList<>();
        int withoutTrip = 0;
        int withoutPosition = 0;
        int withoutTimestamp = 0;
        for (JsonNode entity : root.path("entity")) {
            JsonNode vehicle = entity.path("vehicle");
            if (vehicle.isMissingNode() || vehicle.isNull()) continue;
            JsonNode trip = vehicle.path("trip");
            String route = busRoute(trip.path("route_id").asText(""));
            if (route == null) continue;
            String tripId = trip.path("trip_id").asText("").trim();
            if (tripId.isEmpty()) {
                withoutTrip++;
                continue;
            }
            JsonNode position = vehicle.path("position");
            double latitude = position.path("latitude").asDouble(Double.NaN);
            double longitude = position.path("longitude").asDouble(Double.NaN);
            if (!Double.isFinite(latitude) || !Double.isFinite(longitude) || (latitude == 0 && longitude == 0)) {
                withoutPosition++;
                continue;
            }
            OffsetDateTime reportedAt = epoch(vehicle.get("timestamp"));
            if (reportedAt == null) {
                withoutTimestamp++;
                continue;
            }
            String vehicleId = vehicle.path("vehicle").path("id").asText("").trim();
            String stopCode = vehicle.path("stop_id").asText("").trim();
            buses.add(new GoBusPosition(
                vehicleId.isEmpty() ? entity.path("id").asText(tripId).trim() : vehicleId,
                tripId,
                route,
                destination(vehicle.path("vehicle").path("label").asText(""), route),
                latitude,
                longitude,
                reportedAt,
                scheduledStart(trip.path("start_date").asText(""), trip.path("start_time").asText("")),
                stopCode.isEmpty() ? null : stopCode
            ));
        }
        return new GoBusPositionSnapshot(sourceUpdatedAt, buses, new Omitted(withoutTrip, withoutPosition, withoutTimestamp));
    }

    /** The GO bus route number in a route id, or null for a rail line (or anything else). */
    static String busRoute(String routeId) {
        String value = routeId == null ? "" : routeId.trim();
        int separator = value.lastIndexOf('-');
        String code = separator >= 0 ? value.substring(separator + 1) : value;
        return BUS_ROUTE.matcher(code).matches() ? code.toUpperCase(java.util.Locale.CANADA) : null;
    }

    /** "41 - Hamilton GO" gives "Hamilton GO"; a label without the route prefix is kept whole. */
    static String destination(String label, String route) {
        String value = label == null ? "" : label.trim();
        if (value.isEmpty()) return null;
        String prefix = route + " - ";
        String result = value.startsWith(prefix) ? value.substring(prefix.length()).trim() : value;
        return result.isEmpty() ? null : result;
    }

    /**
     * A trip's scheduled start from GTFS-RT start date and time. GTFS times count from noon minus
     * 12 h on the service date and can pass 24:00 for trips after midnight.
     */
    static OffsetDateTime scheduledStart(String startDate, String startTime) {
        Matcher time = GTFS_TIME.matcher(startTime == null ? "" : startTime.trim());
        if (!time.matches()) return null;
        LocalDate date;
        try {
            date = LocalDate.parse(startDate.trim(), GTFS_DATE);
        } catch (DateTimeParseException | NullPointerException invalid) {
            return null;
        }
        long seconds = Long.parseLong(time.group(1)) * 3600 + Long.parseLong(time.group(2)) * 60
            + Long.parseLong(time.group(3));
        return date.atTime(LocalTime.NOON).atZone(TORONTO).minusHours(12).plusSeconds(seconds)
            .toOffsetDateTime().withOffsetSameInstant(ZoneOffset.UTC);
    }

    private static OffsetDateTime epoch(JsonNode value) {
        return value == null || !value.canConvertToLong() || value.asLong() <= 0 ? null
            : OffsetDateTime.ofInstant(Instant.ofEpochSecond(value.asLong()), ZoneOffset.UTC);
    }
}
