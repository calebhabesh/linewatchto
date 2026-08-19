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
    private final GtfsRtSubwayArrivalCache cache;
    private final ScheduledArrivalProvider scheduledArrivalProvider;
    private final ArrivalProperties properties;
    private final Clock clock;
    private final SubwayOperatingWindow operatingWindow;

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
            return scheduledArrivalProvider.arrivalsFor(stationId, lines);
        }
        List<String> lineIds = lines.stream().map(StationResponses.StationLineResponse::id).toList();
        List<ArrivalPrediction> livePredictions = limitPerDirection(
            cache.arrivalsFor(stationId, lineIds)
                .stream()
                .map(this::toPrediction)
                .toList()
        );
        if (livePredictions.isEmpty()) {
            return scheduledArrivalProvider.arrivalsFor(stationId, lines);
        }

        List<ArrivalPrediction> scheduledPredictions = scheduledArrivalProvider.arrivalsFor(stationId, lines);
        Set<String> liveDirectionKeys = livePredictions.stream()
            .map(prediction -> directionKey(prediction.lineId(), prediction.direction()))
            .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<String> liveLineIds = livePredictions.stream()
            .map(ArrivalPrediction::lineId)
            .collect(Collectors.toSet());

        List<ArrivalPrediction> result = new ArrayList<>(livePredictions);
        for (ArrivalPrediction scheduled : scheduledPredictions) {
            String family = directionFamily(scheduled.lineId(), scheduled.direction());
            if (family.isBlank()) {
                if (!liveLineIds.contains(scheduled.lineId())) {
                    result.add(scheduled);
                }
                continue;
            }
            if (!liveDirectionKeys.contains(directionKey(scheduled.lineId(), scheduled.direction()))) {
                result.add(scheduled);
            }
        }

        Map<String, Integer> lineRank = new LinkedHashMap<>();
        for (int i = 0; i < lines.size(); i++) {
            lineRank.put(lines.get(i).id(), i);
        }

        result.sort(Comparator
            .comparing((ArrivalPrediction prediction) -> lineRank.getOrDefault(prediction.lineId(), Integer.MAX_VALUE))
            .thenComparing(prediction -> directionRank(prediction.lineId(), prediction.direction()))
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

    private List<ArrivalPrediction> limitPerDirection(List<ArrivalPrediction> predictions) {
        return predictions.stream()
            .collect(Collectors.groupingBy(
                prediction -> directionKey(prediction.lineId(), prediction.direction()),
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

    private String directionKey(String lineId, String direction) {
        return lineId + "|" + directionFamily(lineId, direction);
    }

    private String directionFamily(String lineId, String direction) {
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

        return terminalDirectionFamily(lineId, normalized);
    }

    private String terminalDirectionFamily(String lineId, String normalizedDirection) {
        String destination = destinationFromHeadsign(normalizedDirection);
        return switch (lineId) {
            case "line-1" -> terminalDirectionFamily(
                destination,
                "finch", "Northbound",
                "vaughan metropolitan centre", "Southbound"
            );
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

    private int directionRank(String lineId, String direction) {
        return switch (directionFamily(lineId, direction)) {
            case "Northbound", "Eastbound" -> 10;
            case "Southbound", "Westbound" -> 20;
            default -> 99;
        };
    }
}
