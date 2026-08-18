package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.station.StationNotFoundException;
import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class RegionalArrivalService {
    private static final Duration PAST_TOLERANCE = Duration.ofMinutes(1);
    private static final Duration SCHEDULE_MATCH_TOLERANCE = Duration.ofMinutes(2);

    private record CachedSnapshot(OffsetDateTime expiresAt, RegionalArrivalResponses.SnapshotResponse response) {
    }

    private final MetrolinxArrivalClient client;
    private final RegionalScheduledArrivalProvider scheduledProvider;
    private final RegionalArrivalProperties properties;
    private final Clock clock;
    private final Map<String, CachedSnapshot> cache = new ConcurrentHashMap<>();

    public RegionalArrivalService(
        MetrolinxArrivalClient client,
        RegionalScheduledArrivalProvider scheduledProvider,
        RegionalArrivalProperties properties,
        Clock clock
    ) {
        this.client = client;
        this.scheduledProvider = scheduledProvider;
        this.properties = properties;
        this.clock = clock;
    }

    public RegionalArrivalResponses.SnapshotResponse arrivals(String stationId) {
        StationResponses.StationSummaryResponse station = RegionalNetworkCatalog.station(stationId)
            .orElseThrow(() -> new StationNotFoundException(stationId));
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!properties.isEnabled() && !properties.isScheduleEnabled()) {
            return unavailable(station, "disabled", now,
                "Regional station arrivals are disabled.");
        }

        CachedSnapshot cached = cache.get(station.id());
        if (cached != null && cached.expiresAt().isAfter(now)) {
            return cached.response();
        }

        RegionalArrivalResponses.SnapshotResponse response = refresh(station, now);
        cache.put(station.id(), new CachedSnapshot(now.plus(properties.getCacheTtl()), response));
        return response;
    }

    private RegionalArrivalResponses.SnapshotResponse refresh(
        StationResponses.StationSummaryResponse station,
        OffsetDateTime now
    ) {
        String stopCode = RegionalNetworkCatalog.stopCodeForStationId(station.id()).orElseThrow();
        List<RegionalArrivalFeed> feeds = new ArrayList<>();
        int requestedFeeds = 0;
        int failedFeeds = 0;

        if (properties.isEnabled() && station.lineIds().stream().anyMatch(lineId -> !"regional-up".equals(lineId))) {
            requestedFeeds++;
            try {
                feeds.add(client.fetchGoNextService(stopCode));
            } catch (MetrolinxClientException ignored) {
                failedFeeds++;
            }
        }
        if (properties.isEnabled() && station.lineIds().contains("regional-up")) {
            requestedFeeds++;
            try {
                feeds.add(client.fetchUpTripUpdates(stopCode));
            } catch (MetrolinxClientException ignored) {
                failedFeeds++;
            }
        }

        List<RegionalArrivalFeed> freshFeeds = feeds.stream().filter(feed -> isFresh(feed, now)).toList();
        List<RegionalArrivalRecord> scheduled = scheduledProvider.arrivals(station.id(), station.lineIds());
        boolean scheduleAvailable = scheduledProvider.hasActiveSchedule(station.lineIds());
        if (freshFeeds.isEmpty() && scheduled.isEmpty() && !scheduleAvailable) {
            String message = requestedFeeds > 0 && failedFeeds == requestedFeeds
                ? "Metrolinx station arrivals are temporarily unavailable."
                : properties.isScheduleEnabled()
                    ? "No current regional GTFS schedule import covers this station."
                    : "The latest Metrolinx station-arrival data is stale.";
            return unavailable(station, "unavailable", now, message);
        }

        List<RegionalArrivalRecord> realtime = deduplicate(freshFeeds.stream()
            .flatMap(feed -> feed.arrivals().stream())
            .filter(arrival -> !arrival.predictedAt().isBefore(now.minus(PAST_TOLERANCE)))
            .filter(arrival -> !arrival.predictedAt().isAfter(now.plus(properties.getHorizon())))
            .toList());
        List<RegionalArrivalRecord> visible = merge(station.id(), realtime, deduplicate(scheduled)).stream()
            .sorted(Comparator.comparing(RegionalArrivalRecord::predictedAt)
                .thenComparing(RegionalArrivalRecord::lineId)
                .thenComparing(RegionalArrivalRecord::tripNumber))
            .toList();
        List<RegionalArrivalRecord> bounded = boundPerDirection(station.id(), visible);
        OffsetDateTime sourceUpdatedAt = freshFeeds.stream()
            .map(RegionalArrivalFeed::sourceUpdatedAt)
            .max(OffsetDateTime::compareTo)
            .or(() -> scheduledProvider.latestImportedAt(station.lineIds()))
            .orElse(null);
        String source = bounded.stream()
            .map(RegionalArrivalRecord::source)
            .distinct()
            .reduce((left, right) -> left + " / " + right)
            .orElse(station.lineIds().contains("regional-up")
                ? MetrolinxArrivalClient.UP_SOURCE : MetrolinxArrivalClient.GO_SOURCE);
        boolean hasLive = bounded.stream().anyMatch(row -> "live".equals(row.status()));
        boolean hasScheduled = bounded.stream().anyMatch(row -> "scheduled".equals(row.status()));
        String availability = bounded.isEmpty() && scheduleAvailable ? "no-service" : "available";
        String message = bounded.isEmpty()
            ? "No scheduled train service was found in the next "
                + properties.getScheduleLookaheadDays() + " days."
            : hasLive && hasScheduled
                ? "Fresh estimates with published schedule fallback."
                : hasScheduled
                    ? "Published regional train schedule."
            : failedFeeds > 0
                ? "Showing the available fresh regional arrival source; another source is temporarily unavailable."
                : "Fresh Metrolinx regional train estimates.";

        return new RegionalArrivalResponses.SnapshotResponse(
            station.id(), station.name(), availability, now, sourceUpdatedAt, source, message,
            bounded.stream().map(arrival -> response(arrival, now)).toList()
        );
    }

    private List<RegionalArrivalRecord> merge(
        String stationId,
        List<RegionalArrivalRecord> realtime,
        List<RegionalArrivalRecord> scheduled
    ) {
        List<RegionalArrivalRecord> result = new ArrayList<>(realtime);
        for (RegionalArrivalRecord candidate : scheduled) {
            boolean replacedByRealtime = realtime.stream()
                .anyMatch(live -> representsSameTrip(stationId, candidate, live));
            if (!replacedByRealtime) {
                result.add(candidate);
            }
        }
        return List.copyOf(result);
    }

    private boolean representsSameTrip(
        String stationId,
        RegionalArrivalRecord scheduled,
        RegionalArrivalRecord realtime
    ) {
        if (!scheduled.lineId().equals(realtime.lineId())) return false;

        String scheduledTrip = normalize(scheduled.tripNumber());
        String realtimeTrip = normalize(realtime.tripNumber());
        if (!scheduledTrip.isBlank() && scheduledTrip.equals(realtimeTrip)) return true;

        String scheduledDirection = directionFamily(stationId, scheduled);
        String realtimeDirection = directionFamily(stationId, realtime);
        boolean sameDirection = !scheduledDirection.isBlank() && !realtimeDirection.isBlank()
            ? scheduledDirection.equals(realtimeDirection)
            : normalize(scheduled.direction()).equals(normalize(realtime.direction()));
        if (!sameDirection || scheduled.scheduledAt() == null || realtime.scheduledAt() == null) {
            return false;
        }

        Duration difference = Duration.between(scheduled.scheduledAt(), realtime.scheduledAt()).abs();
        return difference.compareTo(SCHEDULE_MATCH_TOLERANCE) <= 0;
    }

    private List<RegionalArrivalRecord> deduplicate(List<RegionalArrivalRecord> arrivals) {
        Map<String, RegionalArrivalRecord> unique = new LinkedHashMap<>();
        for (RegionalArrivalRecord arrival : arrivals) {
            String tripIdentity = arrival.tripNumber().isBlank()
                ? normalize(arrival.direction()) + ":" + normalize(arrival.platform())
                : normalize(arrival.tripNumber());
            String key = arrival.lineId() + ":" + tripIdentity + ":" + arrival.predictedAt();
            unique.putIfAbsent(key, arrival);
        }
        return List.copyOf(unique.values());
    }

    private String directionFamily(String stationId, RegionalArrivalRecord arrival) {
        String normalizedDirection = normalize(arrival.direction());
        for (String cardinal : List.of("northbound", "southbound", "eastbound", "westbound")) {
            if (normalizedDirection.startsWith(cardinal)) {
                return cardinal;
            }
        }

        RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(arrival.lineId()).orElse(null);
        if (route == null) return "";
        int currentIndex = route.stationIds().indexOf(stationId);
        if (currentIndex < 0) return "";

        String destinationName = normalize(arrival.direction()
            .replaceFirst("(?i)^\\s*" + route.number() + "\\s*-\\s*", ""));
        int destinationIndex = -1;
        for (String candidateId : route.stationIds()) {
            String candidateName = RegionalNetworkCatalog.station(candidateId)
                .map(station -> normalize(station.name()))
                .orElse("");
            if (candidateName.equals(destinationName)) {
                destinationIndex = route.stationIds().indexOf(candidateId);
                break;
            }
        }

        String outward = switch (route.number()) {
            case "BR", "RH", "ST" -> "northbound";
            case "LE" -> "eastbound";
            case "KI", "LW", "MI", "UP" -> "westbound";
            default -> "";
        };
        String inward = switch (outward) {
            case "northbound" -> "southbound";
            case "eastbound" -> "westbound";
            case "westbound" -> "eastbound";
            default -> "";
        };
        if (destinationIndex >= 0) {
            if (destinationIndex == currentIndex) {
                return currentIndex == 0 ? inward : outward;
            }
            return destinationIndex > currentIndex ? outward : inward;
        }
        return "union".equals(destinationName) ? inward : "";
    }

    private String normalize(String value) {
        if (value == null) return "";
        return value.toLowerCase(Locale.ROOT)
            .replaceAll("\\b(go|station|terminal)\\b", "")
            .replaceAll("[^a-z0-9]+", " ")
            .trim();
    }

    private boolean isFresh(RegionalArrivalFeed feed, OffsetDateTime now) {
        if (feed.sourceUpdatedAt() == null) return false;
        Duration age = Duration.between(feed.sourceUpdatedAt(), now);
        return age.isNegative() || age.compareTo(properties.getMaxSourceAge()) <= 0;
    }

    private List<RegionalArrivalRecord> boundPerDirection(
        String stationId,
        List<RegionalArrivalRecord> arrivals
    ) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        List<RegionalArrivalRecord> result = new ArrayList<>();
        int maximum = Math.max(1, properties.getMaxArrivalsPerLine());
        for (RegionalArrivalRecord arrival : arrivals) {
            String family = directionFamily(stationId, arrival);
            String key = arrival.lineId() + ":" + (family.isBlank()
                ? normalize(arrival.direction())
                : family);
            int count = counts.getOrDefault(key, 0);
            if (count < maximum) {
                result.add(arrival);
                counts.put(key, count + 1);
            }
        }
        return List.copyOf(result);
    }

    private RegionalArrivalResponses.ArrivalResponse response(RegionalArrivalRecord arrival, OffsetDateTime now) {
        RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(arrival.lineId()).orElseThrow();
        int minutes = Math.max(0, (int) Math.ceil(Duration.between(now, arrival.predictedAt()).toSeconds() / 60.0));
        int delayMinutes = Math.max(0, (int) ChronoUnit.MINUTES.between(
            arrival.scheduledAt(), arrival.predictedAt()
        ));
        return new RegionalArrivalResponses.ArrivalResponse(
            route.id(), route.number(), route.name(), arrival.direction(), minutes,
            arrival.predictedAt(), arrival.scheduledAt(), delayMinutes, arrival.platform(),
            arrival.tripNumber(), arrival.source(), arrival.status()
        );
    }

    private RegionalArrivalResponses.SnapshotResponse unavailable(
        StationResponses.StationSummaryResponse station,
        String availability,
        OffsetDateTime now,
        String message
    ) {
        return new RegionalArrivalResponses.SnapshotResponse(
            station.id(), station.name(), availability, now, null, "Metrolinx", message, List.of()
        );
    }
}
