package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import com.calebhabesh.linewatch.reliability.ReliabilityResponses.ReliabilityMetric;
import com.calebhabesh.linewatch.reliability.ReliabilityResponses.ReliabilityResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class ReliabilityService {
    private static final int PERIOD_DAYS = 30;
    private final ReliabilityRepository repository;
    private final Clock clock;

    public ReliabilityService(ReliabilityRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public ReliabilityResponse lines(String requestedNetwork) {
        return response(normalizeNetwork(requestedNetwork), null);
    }

    public ReliabilityResponse station(String requestedNetwork, String stationId) {
        if (stationId == null || stationId.isBlank()) {
            throw new IllegalArgumentException("stationId is required");
        }
        return response(normalizeNetwork(requestedNetwork), stationId.trim());
    }

    private ReliabilityResponse response(String networkId, String stationId) {
        OffsetDateTime until = OffsetDateTime.now(clock);
        OffsetDateTime since = until.minusDays(PERIOD_DAYS);
        OffsetDateTime firstSnapshot = repository.firstSnapshot(networkId);
        int observedDays = firstSnapshot == null ? 0 : (int) Math.min(PERIOD_DAYS,
            Math.max(1, Duration.between(firstSnapshot, until).toDays() + 1));
        String confidence = confidence(observedDays);
        List<ReliabilityRepository.AggregateRow> rows = stationId == null
            ? repository.aggregateLines(networkId, since, until)
            : repository.aggregateStation(networkId, stationId, since, until);
        if ("regional".equals(networkId) && stationId == null) {
            Map<String, ReliabilityRepository.AggregateRow> byId = rows.stream()
                .collect(Collectors.toMap(ReliabilityRepository.AggregateRow::id, Function.identity()));
            rows = RegionalNetworkCatalog.routes().stream()
                .map(route -> byId.getOrDefault(route.id(), new ReliabilityRepository.AggregateRow(
                    route.id(), route.number(), route.name(), 0, 0, null, 0
                )))
                .toList();
        }
        List<ReliabilityMetric> metrics = rows.stream()
            .map(row -> metric(networkId, row, confidence))
            .toList();
        String scope = stationId == null ? "line and corridor" : "station";
        String coverage = observedDays == 0 ? "No observed history"
            : observedDays + " of " + PERIOD_DAYS + " days observed";
        String message = observedDays == 0
            ? "No retained alert lifecycle history is available yet."
            : "Observed " + scope + " disruption history from normalized service alerts. "
                + "Counts reflect source-published incidents, not all causes of service variance.";
        return new ReliabilityResponse(
            networkId, "30d", since, until,
            "regional".equals(networkId) ? "Metrolinx alert history" : "LineWatch TTC alert history",
            observedDays, confidence, coverage, message, metrics
        );
    }

    private ReliabilityMetric metric(
        String networkId, ReliabilityRepository.AggregateRow row, String confidence
    ) {
        String number = row.number();
        String label = row.label();
        if ("regional".equals(networkId)) {
            RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(row.id()).orElse(null);
            if (route != null) {
                number = route.number();
                label = route.name();
            }
        }
        return new ReliabilityMetric(
            row.id(), number, label, row.incidents(), row.activeIncidents(),
            row.medianDurationMinutes(), row.observedDisruptionMinutes(), confidence
        );
    }

    private String normalizeNetwork(String network) {
        return "regional".equalsIgnoreCase(network) ? "regional" : "ttc";
    }

    private String confidence(int observedDays) {
        if (observedDays >= 28) return "high";
        if (observedDays >= 14) return "medium";
        return "low";
    }
}
