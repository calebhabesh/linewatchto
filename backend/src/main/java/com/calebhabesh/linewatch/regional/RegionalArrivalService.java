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
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class RegionalArrivalService {
    private static final Duration PAST_TOLERANCE = Duration.ofMinutes(1);

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

        List<RegionalArrivalRecord> realtime = freshFeeds.stream()
            .flatMap(feed -> feed.arrivals().stream())
            .filter(arrival -> !arrival.predictedAt().isBefore(now.minus(PAST_TOLERANCE)))
            .filter(arrival -> !arrival.predictedAt().isAfter(now.plus(properties.getHorizon())))
            .toList();
        List<RegionalArrivalRecord> visible = merge(realtime, scheduled).stream()
            .sorted(Comparator.comparing(RegionalArrivalRecord::predictedAt)
                .thenComparing(RegionalArrivalRecord::lineId)
                .thenComparing(RegionalArrivalRecord::tripNumber))
            .toList();
        List<RegionalArrivalRecord> bounded = boundPerLine(visible);
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
        List<RegionalArrivalRecord> realtime,
        List<RegionalArrivalRecord> scheduled
    ) {
        List<RegionalArrivalRecord> result = new ArrayList<>(realtime);
        for (RegionalArrivalRecord candidate : scheduled) {
            boolean represented = realtime.stream().anyMatch(live ->
                live.lineId().equals(candidate.lineId())
                    && ((!live.tripNumber().isBlank() && live.tripNumber().equals(candidate.tripNumber()))
                    || (live.direction().equalsIgnoreCase(candidate.direction())
                    && Math.abs(Duration.between(live.scheduledAt(), candidate.scheduledAt()).toMinutes()) <= 5))
            );
            if (!represented) result.add(candidate);
        }
        return List.copyOf(result);
    }

    private boolean isFresh(RegionalArrivalFeed feed, OffsetDateTime now) {
        if (feed.sourceUpdatedAt() == null) return false;
        Duration age = Duration.between(feed.sourceUpdatedAt(), now);
        return age.isNegative() || age.compareTo(properties.getMaxSourceAge()) <= 0;
    }

    private List<RegionalArrivalRecord> boundPerLine(List<RegionalArrivalRecord> arrivals) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        List<RegionalArrivalRecord> result = new ArrayList<>();
        int maximum = Math.max(1, properties.getMaxArrivalsPerLine());
        for (RegionalArrivalRecord arrival : arrivals) {
            int count = counts.getOrDefault(arrival.lineId(), 0);
            if (count < maximum) {
                result.add(arrival);
                counts.put(arrival.lineId(), count + 1);
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
