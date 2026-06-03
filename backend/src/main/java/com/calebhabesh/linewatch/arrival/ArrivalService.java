package com.calebhabesh.linewatch.arrival;

import com.calebhabesh.linewatch.station.StationResponses;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

@Service
public class ArrivalService implements ArrivalProvider {
    private final PublicArrivalClient arrivalClient;
    private final ArrivalProperties properties;
    private final Clock clock;
    private final Map<StationLineKey, List<StopMapping>> mappings = new HashMap<>();

    public ArrivalService(
        PublicArrivalClient arrivalClient,
        ArrivalProperties properties,
        Clock clock
    ) {
        this.arrivalClient = arrivalClient;
        this.properties = properties;
        this.clock = clock;
        loadMappings();
    }

    private void loadMappings() {
        try (BufferedReader br = new BufferedReader(new InputStreamReader(
                new ClassPathResource("arrival/ttc-arrival-stop-map.csv").getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            boolean isFirst = true;
            while ((line = br.readLine()) != null) {
                if (isFirst) {
                    isFirst = false;
                    continue;
                }
                String[] parts = line.split(",");
                if (parts.length >= 4) {
                    String stationId = parts[0].trim();
                    String lineId = parts[1].trim();
                    String stopId = parts[2].trim();
                    String direction = parts[3].trim();
                    StationLineKey key = new StationLineKey(stationId, lineId);
                    mappings.computeIfAbsent(key, k -> new ArrayList<>())
                            .add(new StopMapping(stopId, direction));
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to load ttc-arrival-stop-map.csv", e);
        }
    }

    @Override
    public List<ArrivalPrediction> arrivalsFor(String stationId, List<StationResponses.StationLineResponse> lines) {
        if (!properties.isEnabled()) {
            return getDemoPredictions(lines);
        }

        List<ArrivalPrediction> allPredictions = new ArrayList<>();
        boolean anyClientSuccess = false;
        boolean clientAttempted = false;

        for (StationResponses.StationLineResponse line : lines) {
            StationLineKey key = new StationLineKey(stationId, line.id());
            List<StopMapping> stopMappings = mappings.get(key);
            if (stopMappings == null || stopMappings.isEmpty()) {
                continue;
            }

            for (StopMapping mapping : stopMappings) {
                clientAttempted = true;
                try {
                    List<ArrivalPrediction> predictions = arrivalClient.fetchArrivals(mapping.stopId());
                    anyClientSuccess = true;
                    if (predictions != null) {
                        for (ArrivalPrediction pred : predictions) {
                            if (pred.lineId().equals(line.id()) && pred.direction().equalsIgnoreCase(mapping.direction())) {
                                if (isFresh(pred.predictedAt())) {
                                    allPredictions.add(pred);
                                }
                            }
                        }
                    }
                } catch (Exception e) {
                    // Log error, continue fetching other stop mappings
                }
            }
        }

        if (clientAttempted && !anyClientSuccess) {
            return getUnavailablePredictions(lines);
        }

        allPredictions.sort(Comparator.comparing(ArrivalPrediction::lineId)
            .thenComparing(ArrivalPrediction::minutes, Comparator.nullsLast(Comparator.naturalOrder())));

        return allPredictions;
    }

    private boolean isFresh(OffsetDateTime predictedAt) {
        if (predictedAt == null) {
            return false;
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        return predictedAt.isAfter(now.minus(properties.getMaxAge()));
    }

    private List<ArrivalPrediction> getDemoPredictions(List<StationResponses.StationLineResponse> lines) {
        List<ArrivalPrediction> predictions = new ArrayList<>();
        OffsetDateTime now = OffsetDateTime.now(clock);
        for (StationResponses.StationLineResponse line : lines) {
            predictions.add(new ArrivalPrediction(line.id(), "Northbound / Eastbound", 2, now, "Demo estimates", "demo"));
            predictions.add(new ArrivalPrediction(line.id(), "Southbound / Westbound", 5, now, "Demo estimates", "demo"));
        }
        return predictions;
    }

    private List<ArrivalPrediction> getUnavailablePredictions(List<StationResponses.StationLineResponse> lines) {
        List<ArrivalPrediction> predictions = new ArrayList<>();
        for (StationResponses.StationLineResponse line : lines) {
            predictions.add(new ArrivalPrediction(line.id(), "Northbound / Eastbound", null, null, "Arrival source unavailable", "unavailable"));
            predictions.add(new ArrivalPrediction(line.id(), "Southbound / Westbound", null, null, "Arrival source unavailable", "unavailable"));
        }
        return predictions;
    }

    private record StationLineKey(String stationId, String lineId) {}
    private record StopMapping(String stopId, String direction) {}
}
