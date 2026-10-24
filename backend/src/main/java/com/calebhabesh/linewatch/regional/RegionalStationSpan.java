package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.alert.StationSpanFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Derives the travel direction a Metrolinx alert affects.
 *
 * <p>Metrolinx alerts carry no direction field, but their wording implies one. A notice about
 * a named trip ("Stratford GO 6:16 AM - Union Station 8:47 AM") affects that trip's direction.
 * A notice about the track or area ("signal issue between X and Y", closures, speed
 * reductions) affects every train through it, as does a notice of no service between two
 * stations. Anything else stays unspecified.
 */
final class RegionalStationSpan {
    record Span(String displayLocation, String displayDirection) {}

    private record Trip(int originIndex, int destinationIndex, String destinationId) {
        boolean inbound() {
            return destinationIndex < originIndex;
        }
    }

    private static final String CLOCK = "\\d{1,2}:\\d{2}\\s*[ap]\\.?\\s?m\\.?";
    private static final String PLACE = "[\\p{L}][\\p{L}\\p{N} .'’&/-]{0,80}?";
    private static final Pattern TRIP = Pattern.compile(
        "(" + PLACE + ")\\s+" + CLOCK + "\\s*[-–—]\\s*(" + PLACE + ")\\s+" + CLOCK,
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern CLOCK_TIME = Pattern.compile(
        "(?<![\\p{N}])" + CLOCK, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern EXPLICIT_DIRECTION = Pattern.compile(
        "\\b(?:north|south|east|west)bound\\b|\\b\\p{L}+-bound\\b",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern NO_SERVICE_BETWEEN = Pattern.compile(
        "\\bno\\s+(?:(?:GO|UP|Express|train|rail)\\s+){0,3}service\\s+between\\b",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern BOTH_DIRECTIONS = Pattern.compile(
        "\\bboth directions\\b|\\bbidirectional\\b", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private RegionalStationSpan() {}

    static Span describe(RegionalNormalizedAlert alert) {
        RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(alert.lineId()).orElse(null);
        if (route == null) return new Span("Regional line", null);
        String text = String.join(" ", nullToEmpty(alert.title()), nullToEmpty(alert.description()));
        List<Trip> trips = trips(text, route);
        boolean tripDirectionKnown = !trips.isEmpty()
            && trips.stream().allMatch(trip -> trip.inbound() == trips.getFirst().inbound());
        String displayDirection = tripDirectionKnown
            ? "Towards " + destinationName(trips.getFirst().destinationId())
            : null;

        List<String> ordered = alert.stationIds() == null ? List.of()
            : route.stationIds().stream().filter(alert.stationIds()::contains).toList();
        if (ordered.isEmpty()) return new Span(route.displayName(), displayDirection);
        String first = stationName(ordered.getFirst());
        if (ordered.size() == 1) return new Span(first, displayDirection);
        String last = stationName(ordered.getLast());

        if (tripDirectionKnown) {
            // Route station lists start at Union, so inbound travel runs toward lower indexes.
            return new Span(
                trips.getFirst().inbound()
                    ? StationSpanFormatter.oneWay(last, first)
                    : StationSpanFormatter.oneWay(first, last),
                displayDirection
            );
        }
        // "No train service between X and Y" closes the span to every train, even when the
        // notice also lists individual cancelled trips or a westbound bus replacement.
        if (NO_SERVICE_BETWEEN.matcher(text).find()) {
            return new Span(StationSpanFormatter.bothWays(first, last), null);
        }
        if (!trips.isEmpty() || mayDescribeOneTrip(alert, text) || namesOneDirection(text)) {
            return new Span(StationSpanFormatter.unspecified(first, last), null);
        }
        return new Span(StationSpanFormatter.bothWays(first, last), null);
    }

    /** An unplanned notice quoting a clock time may concern a trip we could not resolve. */
    private static boolean mayDescribeOneTrip(RegionalNormalizedAlert alert, String text) {
        return !"planned-closure".equals(alert.impactKind()) && CLOCK_TIME.matcher(text).find();
    }

    private static boolean namesOneDirection(String text) {
        return EXPLICIT_DIRECTION.matcher(text).find() && !BOTH_DIRECTIONS.matcher(text).find();
    }

    private static List<Trip> trips(String text, RegionalNetworkCatalog.Route route) {
        List<Trip> trips = new ArrayList<>();
        Matcher matcher = TRIP.matcher(text);
        while (matcher.find()) {
            // The origin phrase can begin earlier in the sentence; its last station is the origin.
            int origin = lastMentionedStationIndex(matcher.group(1), route);
            int destination = firstMentionedStationIndex(matcher.group(2), route);
            if (origin >= 0 && destination >= 0 && origin != destination) {
                trips.add(new Trip(origin, destination, route.stationIds().get(destination)));
            }
        }
        return trips;
    }

    private static int lastMentionedStationIndex(String phrase, RegionalNetworkCatalog.Route route) {
        int best = -1;
        int bestPosition = -1;
        for (int index = 0; index < route.stationIds().size(); index++) {
            int position = mentionPosition(phrase, route.stationIds().get(index), true);
            if (position > bestPosition) {
                best = index;
                bestPosition = position;
            }
        }
        return best;
    }

    private static int firstMentionedStationIndex(String phrase, RegionalNetworkCatalog.Route route) {
        int best = -1;
        int bestPosition = Integer.MAX_VALUE;
        for (int index = 0; index < route.stationIds().size(); index++) {
            int position = mentionPosition(phrase, route.stationIds().get(index), false);
            if (position >= 0 && position < bestPosition) {
                best = index;
                bestPosition = position;
            }
        }
        return best;
    }

    private static int mentionPosition(String phrase, String stationId, boolean last) {
        int byName = phrasePosition(phrase, stationName(stationId), last);
        int byId = phrasePosition(phrase, stationId.replace('-', ' '), last);
        if (byName < 0) return byId;
        if (byId < 0) return byName;
        return last ? Math.max(byName, byId) : Math.min(byName, byId);
    }

    private static int phrasePosition(String text, String phrase, boolean last) {
        if (phrase == null || phrase.isBlank()) return -1;
        Matcher matcher = Pattern.compile(
            "(?<![\\p{L}\\p{N}])" + Pattern.quote(phrase.trim()) + "(?![\\p{L}\\p{N}])",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
        ).matcher(text);
        int position = -1;
        while (matcher.find()) {
            position = matcher.start();
            if (!last) break;
        }
        return position;
    }

    private static String stationName(String stationId) {
        return RegionalNetworkCatalog.station(stationId).map(station -> station.name()).orElse(stationId);
    }

    private static String destinationName(String stationId) {
        return "union".equals(stationId) ? "Union Station" : stationName(stationId);
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
