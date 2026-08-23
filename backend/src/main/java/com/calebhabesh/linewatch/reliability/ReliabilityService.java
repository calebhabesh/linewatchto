package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import com.calebhabesh.linewatch.reliability.ReliabilityResponses.ReliabilityMetric;
import com.calebhabesh.linewatch.reliability.ReliabilityResponses.ReliabilityResponse;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
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
        ReliabilityRepository.ReliabilityAggregation aggregation =
            repository.aggregate(networkId, stationId, since, until);
        double effectiveCoverage = Math.min(
            aggregation.coveragePercentage(),
            aggregation.scheduleCoveragePercentage()
        );
        int observedDays = (int) Math.min(PERIOD_DAYS,
            Math.round(PERIOD_DAYS * effectiveCoverage / 100.0));
        String confidence = confidence(effectiveCoverage);
        List<ReliabilityRepository.AggregateRow> rows = aggregation.rows();
        List<ReliabilityMetric> metrics = rows.stream()
            .map(row -> metric(networkId, row, confidence))
            .toList();
        List<ReliabilityResponses.AlertTypeBreakdown> breakdown = breakdown(aggregation.breakdown());
        String coverage = coverageLabel(networkId, aggregation);
        String message = aggregation.coveragePercentage() == 0
            ? "No retained alert lifecycle history is available yet."
            : preamble(networkId, stationId, aggregation);
        return new ReliabilityResponse(
            networkId, "30d", since, until,
            "regional".equals(networkId) ? "Metrolinx Alert History" : "LineWatch TTC Alert History",
            observedDays, aggregation.observationMinutes(), aggregation.coveragePercentage(),
            confidence, coverage, aggregation.serviceWindowBasis(), aggregation.scheduleBacked(),
            aggregation.scheduleCoveragePercentage(),
            message, metrics, breakdown
        );
    }

    private String coverageLabel(
        String networkId,
        ReliabilityRepository.ReliabilityAggregation aggregation
    ) {
        if (aggregation.coveragePercentage() == 0) return "No verified polling coverage";
        if (aggregation.scheduleCoveragePercentage() == 0) {
            return String.format(java.util.Locale.CANADA,
                "%.1f%% polling · no schedule-date coverage", aggregation.coveragePercentage());
        }
        String scheduleLabel = "regional".equals(networkId)
            ? "minimum GO/UP schedule-date coverage"
            : "schedule-date coverage";
        return String.format(java.util.Locale.CANADA,
            "%.1f%% polling · %.1f%% %s",
            aggregation.coveragePercentage(), aggregation.scheduleCoveragePercentage(), scheduleLabel);
    }

    private String preamble(
        String networkId,
        String stationId,
        ReliabilityRepository.ReliabilityAggregation aggregation
    ) {
        if (!aggregation.scheduleBacked()) {
            return "Published " + ("regional".equals(networkId) ? "GO/UP" : "TTC")
                + " schedule coverage is unavailable, so service-hour totals are withheld.";
        }
        if ("regional".equals(networkId)) {
            return "Observed GO/UP alerts during scheduled train service and successful polling. "
                + (stationId == null
                    ? "A corridor counts as affected when there is an alert anywhere on it; 100% does not mean the entire corridor was disrupted. Incident-hours add overlapping alerts."
                    : "A station counts as affected when any linked alert exists; incident-hours add overlapping alerts.");
        }
        return "Observed TTC alerts during scheduled subway service and successful polling. "
            + (stationId == null
                ? "A line counts as affected when there is an alert anywhere on it; 100% does not mean the entire line was disrupted. Incident-hours add overlapping alerts."
                : "A station counts as affected when any linked alert exists; incident-hours add overlapping alerts.");
    }

    private List<ReliabilityResponses.AlertTypeBreakdown> breakdown(
        List<ReliabilityRepository.BreakdownRow> rows
    ) {
        long totalDisruptionMinutes = rows.stream().mapToLong(ReliabilityRepository.BreakdownRow::incidentMinutes).sum();
        long totalIncidents = rows.stream().mapToLong(ReliabilityRepository.BreakdownRow::incidents).sum();
        return rows.stream()
            .map(row -> {
                double pct = totalDisruptionMinutes > 0
                    ? Math.round((row.incidentMinutes() * 1000.0) / totalDisruptionMinutes) / 10.0
                    : (totalIncidents > 0 ? Math.round((row.incidents() * 1000.0) / totalIncidents) / 10.0 : 0.0);
                return new ReliabilityResponses.AlertTypeBreakdown(
                    row.impactKind(),
                    formatImpactKindLabel(row.impactKind()),
                    row.incidents(),
                    row.incidentMinutes(),
                    pct
                );
            })
            .toList();
    }

    private String formatImpactKindLabel(String impactKind) {
        if (impactKind == null) return "Service Notices";
        return switch (impactKind.toLowerCase().replace('_', '-')) {
            case "delay" -> "Delays";
            case "reduced-speed-zone", "rsz" -> "Reduced Speed Zones";
            case "planned-closure", "closure" -> "Planned Closures";
            case "suspension" -> "Active Alerts";
            case "cancellation" -> "Train Cancellations";
            default -> "Service Notices";
        };
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
            row.medianDurationMinutes(), row.serviceImpactMinutes(),
            row.observedServiceMinutes(), row.incidentDisruptionMinutes(),
            row.serviceImpactPercentage(), confidence
        );
    }

    private String normalizeNetwork(String network) {
        return "regional".equalsIgnoreCase(network) ? "regional" : "ttc";
    }

    private String confidence(double coveragePercentage) {
        if (coveragePercentage >= 95.0) return "high";
        if (coveragePercentage >= 75.0) return "medium";
        return "low";
    }
}
