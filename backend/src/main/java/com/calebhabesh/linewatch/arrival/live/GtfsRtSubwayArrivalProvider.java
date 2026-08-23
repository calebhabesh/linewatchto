package com.calebhabesh.linewatch.arrival.live;

import com.calebhabesh.linewatch.arrival.ArrivalPrediction;
import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.arrival.ArrivalProvider;
import com.calebhabesh.linewatch.arrival.schedule.ScheduledArrivalProvider;
import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class GtfsRtSubwayArrivalProvider implements ArrivalProvider {
    private static final List<String> LINE_1_STATION_ORDER = List.of(
        "vaughan-metropolitan-centre", "highway-407", "pioneer-village",
        "york-university", "finch-west", "downsview-park", "sheppard-west",
        "wilson", "yorkdale", "lawrence-west", "glencairn", "cedarvale",
        "st-clair-west", "dupont", "spadina", "st-george", "museum",
        "queens-park", "st-patrick", "osgoode", "st-andrew", "union", "king",
        "queen", "tmu", "college", "wellesley", "bloor-yonge", "rosedale",
        "summerhill", "st-clair", "davisville", "eglinton", "lawrence",
        "york-mills", "sheppard-yonge", "north-york-centre", "finch"
    );
    private static final int LINE_1_UNION_INDEX = LINE_1_STATION_ORDER.indexOf("union");

    private final GtfsRtSubwayArrivalCache cache;
    private final ScheduledArrivalProvider scheduledArrivalProvider;
    private final ArrivalProperties properties;
    private final Clock clock;
    private final SubwayOperatingWindow operatingWindow;
    private final Map<LiveDirectionKey, RetainedLiveDirection> retainedLiveDirections = new LinkedHashMap<>();

    public GtfsRtSubwayArrivalProvider(
        GtfsRtSubwayArrivalCache cache,
        ScheduledArrivalProvider scheduledArrivalProvider,
        ArrivalProperties properties,
        Clock clock,
        SubwayOperatingWindow operatingWindow
    ) {
        this.cache = cache;
        this.scheduledArrivalProvider = scheduledArrivalProvider;
        this.properties = properties;
        this.clock = clock;
        this.operatingWindow = operatingWindow;
    }

    @Override
    public List<ArrivalPrediction> arrivalsFor(String stationId, List<StationResponses.StationLineResponse> lines) {
        if (!operatingWindow.isOpen()) {
            clearRetainedLiveDirections(stationId);
            return scheduledArrivalProvider.arrivalsFor(stationId, lines);
        }
        List<String> lineIds = lines.stream().map(StationResponses.StationLineResponse::id).toList();
        boolean hasFreshSnapshot = cache.freshSnapshot().isPresent();
        List<ArrivalPrediction> livePredictions = retainMissingLiveDirections(
            stationId,
            lineIds,
            limitPerDirection(
                stationId,
                cache.arrivalsFor(stationId, lineIds)
                    .stream()
                    .map(this::toPrediction)
                    .toList()
            ),
            hasFreshSnapshot
        );
        if (livePredictions.isEmpty()) {
            return scheduledArrivalProvider.arrivalsFor(stationId, lines);
        }

        List<ArrivalPrediction> scheduledPredictions = scheduledArrivalProvider.arrivalsFor(stationId, lines);
        Set<String> liveDirectionKeys = livePredictions.stream()
            .map(prediction -> directionKey(stationId, prediction.lineId(), prediction.direction()))
            .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<String> liveLineIds = livePredictions.stream()
            .map(ArrivalPrediction::lineId)
            .collect(Collectors.toSet());

        List<ArrivalPrediction> result = new ArrayList<>(livePredictions);
        for (ArrivalPrediction scheduled : scheduledPredictions) {
            String family = directionFamily(stationId, scheduled.lineId(), scheduled.direction());
            if (family.isBlank()) {
                if (!liveLineIds.contains(scheduled.lineId())) {
                    result.add(scheduled);
                }
                continue;
            }
            if (!liveDirectionKeys.contains(directionKey(stationId, scheduled.lineId(), scheduled.direction()))) {
                result.add(scheduled);
            }
        }

        Map<String, Integer> lineRank = new LinkedHashMap<>();
        for (int i = 0; i < lines.size(); i++) {
            lineRank.put(lines.get(i).id(), i);
        }

        result.sort(Comparator
            .comparing((ArrivalPrediction prediction) -> lineRank.getOrDefault(prediction.lineId(), Integer.MAX_VALUE))
            .thenComparing(prediction -> directionRank(stationId, prediction.lineId(), prediction.direction()))
            .thenComparing(ArrivalPrediction::predictedAt, Comparator.nullsLast(Comparator.naturalOrder())));
        return result;
    }

    private ArrivalPrediction toPrediction(GtfsRtSubwayStationArrival arrival) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        long diffSeconds = Duration.between(now, arrival.predictedAt()).toSeconds();
        int minutes = (int) Math.max(0, Math.round(diffSeconds / 60.0));
        return ArrivalPrediction.live(
            arrival.lineId(),
            arrival.direction(),
            minutes,
            arrival.predictedAt(),
            properties.getLiveSourceName()
        );
    }

    private List<ArrivalPrediction> limitPerDirection(String stationId, List<ArrivalPrediction> predictions) {
        return predictions.stream()
            .collect(Collectors.groupingBy(
                prediction -> directionKey(stationId, prediction.lineId(), prediction.direction()),
                LinkedHashMap::new,
                Collectors.toList()
            ))
            .values()
            .stream()
            .flatMap(rows -> rows.stream()
                .sorted(Comparator.comparing(ArrivalPrediction::predictedAt, Comparator.nullsLast(Comparator.naturalOrder())))
                .limit(properties.getMaxArrivalsPerLine()))
            .toList();
    }

    private synchronized List<ArrivalPrediction> retainMissingLiveDirections(
        String stationId,
        List<String> lineIds,
        List<ArrivalPrediction> currentPredictions,
        boolean hasFreshSnapshot
    ) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        Duration retention = liveArrivalRetention();
        retainedLiveDirections.entrySet().removeIf(entry -> isExpired(entry.getValue(), now, retention));

        if (!hasFreshSnapshot || retention.isZero()) {
            retainedLiveDirections.keySet().removeIf(key -> key.stationId().equals(stationId));
            return currentPredictions;
        }

        Map<LiveDirectionKey, List<ArrivalPrediction>> currentByDirection = currentPredictions.stream()
            .collect(Collectors.groupingBy(
                prediction -> liveDirectionKey(stationId, prediction),
                LinkedHashMap::new,
                Collectors.toList()
            ));
        currentByDirection.forEach((key, predictions) -> retainedLiveDirections.put(
            key,
            new RetainedLiveDirection(List.copyOf(predictions), now)
        ));

        List<ArrivalPrediction> resolved = new ArrayList<>(currentPredictions);
        retainedLiveDirections.forEach((key, retained) -> {
            if (!key.stationId().equals(stationId)
                    || !lineIds.contains(key.lineId())
                    || currentByDirection.containsKey(key)) {
                return;
            }
            retained.predictions().stream()
                .map(prediction -> refreshLiveCountdown(prediction, now))
                .forEach(resolved::add);
        });
        return List.copyOf(resolved);
    }

    private ArrivalPrediction refreshLiveCountdown(ArrivalPrediction prediction, OffsetDateTime now) {
        if (prediction.predictedAt() == null) {
            return prediction;
        }
        long diffSeconds = Duration.between(now, prediction.predictedAt()).toSeconds();
        int minutes = (int) Math.max(0, Math.round(diffSeconds / 60.0));
        return ArrivalPrediction.live(
            prediction.lineId(),
            prediction.direction(),
            minutes,
            prediction.predictedAt(),
            prediction.source()
        );
    }

    private Duration liveArrivalRetention() {
        Duration configured = properties.getLiveArrivalRetention();
        return configured == null || configured.isNegative() ? Duration.ZERO : configured;
    }

    private boolean isExpired(RetainedLiveDirection retained, OffsetDateTime now, Duration retention) {
        return retention.isZero() || retained.lastSeenAt().plus(retention).isBefore(now);
    }

    private synchronized void clearRetainedLiveDirections(String stationId) {
        retainedLiveDirections.keySet().removeIf(key -> key.stationId().equals(stationId));
    }

    private LiveDirectionKey liveDirectionKey(String stationId, ArrivalPrediction prediction) {
        return new LiveDirectionKey(
            stationId,
            prediction.lineId(),
            directionFamily(stationId, prediction.lineId(), prediction.direction())
        );
    }

    private String directionKey(String stationId, String lineId, String direction) {
        return lineId + "|" + directionFamily(stationId, lineId, direction);
    }

    private String directionFamily(String stationId, String lineId, String direction) {
        if (direction == null) {
            return "";
        }
        String normalized = direction.trim()
            .toLowerCase(java.util.Locale.ROOT)
            .replace('-', ' ')
            .replaceAll("\\s+", " ");
        if (normalized.startsWith("northbound")) return "Northbound";
        if (normalized.startsWith("southbound")) return "Southbound";
        if (normalized.startsWith("eastbound")) return "Eastbound";
        if (normalized.startsWith("westbound")) return "Westbound";

        return terminalDirectionFamily(stationId, lineId, normalized);
    }

    private String terminalDirectionFamily(String stationId, String lineId, String normalizedDirection) {
        String destination = destinationFromHeadsign(normalizedDirection);
        return switch (lineId) {
            case "line-1" -> line1TerminalDirectionFamily(stationId, destination);
            case "line-2" -> terminalDirectionFamily(
                destination,
                "kennedy", "Eastbound",
                "kipling", "Westbound"
            );
            case "line-4" -> terminalDirectionFamily(
                destination,
                "don mills", "Eastbound",
                "sheppard yonge", "Westbound"
            );
            case "line-5" -> terminalDirectionFamily(
                destination,
                "kennedy", "Eastbound",
                "mount dennis", "Westbound"
            );
            case "line-6" -> terminalDirectionFamily(
                destination,
                "finch west", "Eastbound",
                "humber college", "Westbound"
            );
            default -> "";
        };
    }

    private String line1TerminalDirectionFamily(String stationId, String destination) {
        int stationIndex = LINE_1_STATION_ORDER.indexOf(stationId);
        if (stationIndex >= 0 && stationIndex < LINE_1_UNION_INDEX) {
            return terminalDirectionFamily(
                destination,
                "vaughan metropolitan centre", "Northbound",
                "finch", "Southbound"
            );
        }
        return terminalDirectionFamily(
            destination,
            "finch", "Northbound",
            "vaughan metropolitan centre", "Southbound"
        );
    }

    private String destinationFromHeadsign(String normalizedDirection) {
        int towardsIndex = normalizedDirection.lastIndexOf(" towards ");
        if (towardsIndex >= 0) {
            return normalizedDirection.substring(towardsIndex + " towards ".length());
        }

        int toIndex = normalizedDirection.lastIndexOf(" to ");
        if (toIndex >= 0) {
            return normalizedDirection.substring(toIndex + " to ".length());
        }

        return normalizedDirection;
    }

    private String terminalDirectionFamily(
        String normalizedDirection,
        String firstTerminal,
        String firstDirection,
        String secondTerminal,
        String secondDirection
    ) {
        if (normalizedDirection.contains(firstTerminal)) {
            return firstDirection;
        }
        if (normalizedDirection.contains(secondTerminal)) {
            return secondDirection;
        }
        return "";
    }

    private int directionRank(String stationId, String lineId, String direction) {
        return switch (directionFamily(stationId, lineId, direction)) {
            case "Northbound", "Eastbound" -> 10;
            case "Southbound", "Westbound" -> 20;
            default -> 99;
        };
    }

    private record LiveDirectionKey(String stationId, String lineId, String directionFamily) {}

    private record RetainedLiveDirection(List<ArrivalPrediction> predictions, OffsetDateTime lastSeenAt) {}
}
