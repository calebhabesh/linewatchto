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

    private record RefreshResult(
        RegionalArrivalResponses.SnapshotResponse response,
        OffsetDateTime cacheUntil
    ) {}

    private record RealtimeDirectionKey(String stationId, String lineId, String directionFamily) {}

    private record RetainedRealtimeDirection(
        List<RegionalArrivalRecord> arrivals,
        OffsetDateTime lastSeenAt,
        OffsetDateTime sourceUpdatedAt
    ) {}

    private record RealtimeResolution(
        List<RegionalArrivalRecord> arrivals,
        int heldArrivalCount,
        OffsetDateTime latestSourceUpdatedAt,
        OffsetDateTime cacheUntil
    ) {}

    private final MetrolinxArrivalClient client;
    private final RegionalScheduledArrivalProvider scheduledProvider;
    private final RegionalArrivalProperties properties;
    private final Clock clock;
    private final Map<String, CachedSnapshot> cache = new ConcurrentHashMap<>();
    private final Map<String, Object> refreshLocks = new ConcurrentHashMap<>();
    private final Map<RealtimeDirectionKey, RetainedRealtimeDirection> retainedRealtimeDirections =
        new ConcurrentHashMap<>();

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
            clearRetainedRealtime(station.id());
            return unavailable(station, "disabled", now,
                "Regional station arrivals are disabled.");
        }
        if (!properties.isEnabled()) {
            clearRetainedRealtime(station.id());
        }

        CachedSnapshot cached = cache.get(station.id());
        if (cached != null && cached.expiresAt().isAfter(now)) {
            return cached.response();
        }

        synchronized (refreshLocks.computeIfAbsent(station.id(), ignored -> new Object())) {
            now = OffsetDateTime.now(clock);
            cached = cache.get(station.id());
            if (cached != null && cached.expiresAt().isAfter(now)) {
                return cached.response();
            }

            RefreshResult refreshed = refresh(station, now);
            OffsetDateTime expiresAt = earlier(
                now.plus(nonNegative(properties.getCacheTtl())),
                refreshed.cacheUntil()
            );
            cache.put(station.id(), new CachedSnapshot(expiresAt, refreshed.response()));
            return refreshed.response();
        }
    }

    private RefreshResult refresh(
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
        List<RegionalArrivalRecord> currentRealtime = deduplicate(freshFeeds.stream()
            .flatMap(feed -> feed.arrivals().stream())
            .filter(arrival -> !arrival.predictedAt().isBefore(now.minus(PAST_TOLERANCE)))
            .filter(arrival -> !arrival.predictedAt().isAfter(now.plus(properties.getHorizon())))
            .toList());
        RealtimeResolution realtime = properties.isEnabled()
            ? retainMissingRealtimeDirections(
                station.id(), station.lineIds(), currentRealtime, freshFeeds, now
            )
            : new RealtimeResolution(List.of(), 0, null, null);
        List<RegionalArrivalRecord> scheduled = scheduledProvider.arrivals(station.id(), station.lineIds());
        boolean scheduleAvailable = scheduledProvider.hasActiveSchedule(station.lineIds());
        if (realtime.arrivals().isEmpty() && scheduled.isEmpty() && !scheduleAvailable) {
            String message = requestedFeeds > 0 && failedFeeds == requestedFeeds
                ? "Metrolinx station arrivals are temporarily unavailable."
                : properties.isScheduleEnabled()
                    ? "No current regional GTFS schedule import covers this station."
                    : "The latest Metrolinx station-arrival data is stale.";
            return new RefreshResult(
                unavailable(station, "unavailable", now, message),
                realtime.cacheUntil()
            );
        }

        List<RegionalArrivalRecord> visible = merge(station.id(), realtime.arrivals(), deduplicate(scheduled)).stream()
            .sorted(Comparator.comparing(RegionalArrivalRecord::predictedAt)
                .thenComparing(RegionalArrivalRecord::lineId)
                .thenComparing(RegionalArrivalRecord::tripNumber))
            .toList();
        List<RegionalArrivalRecord> bounded = boundPerDirection(station.id(), visible);
        OffsetDateTime sourceUpdatedAt = java.util.Optional.ofNullable(realtime.latestSourceUpdatedAt())
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
            : realtime.heldArrivalCount() > 0 && freshFeeds.isEmpty()
                ? "The Metrolinx arrival source is temporarily unavailable; briefly holding last-seen live estimates."
            : realtime.heldArrivalCount() > 0
                ? "Fresh Metrolinx data is available; briefly holding last-seen live estimates through a partial source gap."
            : hasLive && hasScheduled
                ? "Fresh estimates with published schedule fallback."
                : hasScheduled
                    ? "Published regional train schedule."
            : failedFeeds > 0
                ? "Showing the available fresh regional arrival source; another source is temporarily unavailable."
                : "Fresh Metrolinx regional train estimates.";

        return new RefreshResult(
            new RegionalArrivalResponses.SnapshotResponse(
                station.id(), station.name(), availability, now, sourceUpdatedAt, source, message,
                bounded.stream().map(arrival -> response(arrival, now)).toList()
            ),
            realtime.cacheUntil()
        );
    }

    private RealtimeResolution retainMissingRealtimeDirections(
        String stationId,
        List<String> lineIds,
        List<RegionalArrivalRecord> currentRealtime,
        List<RegionalArrivalFeed> freshFeeds,
        OffsetDateTime now
    ) {
        Duration retention = nonNegative(properties.getLiveArrivalRetention());
        retainedRealtimeDirections.entrySet().removeIf(entry -> retainedExpired(entry.getValue(), now, retention));
        if (retention.isZero()) {
            clearRetainedRealtime(stationId);
            return new RealtimeResolution(
                currentRealtime,
                0,
                latestSourceUpdatedAt(freshFeeds),
                null
            );
        }

        Map<RealtimeDirectionKey, List<RegionalArrivalRecord>> currentByDirection = currentRealtime.stream()
            .collect(java.util.stream.Collectors.groupingBy(
                arrival -> realtimeDirectionKey(stationId, arrival),
                LinkedHashMap::new,
                java.util.stream.Collectors.toList()
            ));
        currentByDirection.forEach((key, arrivals) -> retainedRealtimeDirections.put(
            key,
            new RetainedRealtimeDirection(
                List.copyOf(arrivals),
                now,
                sourceUpdatedAtForLine(freshFeeds, key.lineId())
            )
        ));

        List<RegionalArrivalRecord> resolved = new ArrayList<>(currentRealtime);
        int heldArrivalCount = 0;
        OffsetDateTime heldUntil = null;
        OffsetDateTime latestSourceUpdatedAt = latestSourceUpdatedAt(freshFeeds);
        for (Map.Entry<RealtimeDirectionKey, RetainedRealtimeDirection> entry
                : retainedRealtimeDirections.entrySet()) {
            RealtimeDirectionKey key = entry.getKey();
            RetainedRealtimeDirection retained = entry.getValue();
            if (!key.stationId().equals(stationId)
                    || !lineIds.contains(key.lineId())
                    || currentByDirection.containsKey(key)) {
                continue;
            }

            List<RegionalArrivalRecord> visibleHeld = retained.arrivals().stream()
                .filter(arrival -> !arrival.predictedAt().isBefore(now.minus(PAST_TOLERANCE)))
                .filter(arrival -> !arrival.predictedAt().isAfter(now.plus(properties.getHorizon())))
                .toList();
            if (visibleHeld.isEmpty()) {
                retainedRealtimeDirections.remove(key, retained);
                continue;
            }

            resolved.addAll(visibleHeld);
            heldArrivalCount += visibleHeld.size();
            OffsetDateTime expiresAt = retainedExpiresAt(retained, retention);
            heldUntil = earlier(heldUntil, expiresAt);
            latestSourceUpdatedAt = later(latestSourceUpdatedAt, retained.sourceUpdatedAt());
        }

        return new RealtimeResolution(
            List.copyOf(resolved),
            heldArrivalCount,
            latestSourceUpdatedAt,
            heldUntil
        );
    }

    private RealtimeDirectionKey realtimeDirectionKey(String stationId, RegionalArrivalRecord arrival) {
        String family = directionFamily(stationId, arrival);
        return new RealtimeDirectionKey(
            stationId,
            arrival.lineId(),
            family.isBlank() ? normalize(arrival.direction()) : family
        );
    }

    private boolean retainedExpired(
        RetainedRealtimeDirection retained,
        OffsetDateTime now,
        Duration retention
    ) {
        return retention.isZero() || !retainedExpiresAt(retained, retention).isAfter(now);
    }

    private OffsetDateTime retainedExpiresAt(
        RetainedRealtimeDirection retained,
        Duration retention
    ) {
        OffsetDateTime retentionExpiry = retained.lastSeenAt().plus(retention);
        if (retained.sourceUpdatedAt() == null) {
            return retentionExpiry;
        }
        return earlier(
            retentionExpiry,
            retained.sourceUpdatedAt().plus(nonNegative(properties.getMaxSourceAge()))
        );
    }

    private OffsetDateTime sourceUpdatedAtForLine(
        List<RegionalArrivalFeed> freshFeeds,
        String lineId
    ) {
        return freshFeeds.stream()
            .filter(feed -> feed.arrivals().stream().anyMatch(arrival -> arrival.lineId().equals(lineId)))
            .map(RegionalArrivalFeed::sourceUpdatedAt)
            .max(OffsetDateTime::compareTo)
            .orElse(null);
    }

    private OffsetDateTime latestSourceUpdatedAt(List<RegionalArrivalFeed> freshFeeds) {
        return freshFeeds.stream()
            .map(RegionalArrivalFeed::sourceUpdatedAt)
            .max(OffsetDateTime::compareTo)
            .orElse(null);
    }

    private void clearRetainedRealtime(String stationId) {
        retainedRealtimeDirections.keySet().removeIf(key -> key.stationId().equals(stationId));
    }

    private Duration nonNegative(Duration duration) {
        return duration == null || duration.isNegative() ? Duration.ZERO : duration;
    }

    private OffsetDateTime earlier(OffsetDateTime left, OffsetDateTime right) {
        if (left == null) return right;
        if (right == null) return left;
        return left.isBefore(right) ? left : right;
    }

    private OffsetDateTime later(OffsetDateTime left, OffsetDateTime right) {
        if (left == null) return right;
        if (right == null) return left;
        return left.isAfter(right) ? left : right;
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
