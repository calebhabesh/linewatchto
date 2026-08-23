package com.calebhabesh.linewatch.reliability;

import java.time.OffsetDateTime;
import java.util.List;

public final class ReliabilityResponses {
    private ReliabilityResponses() {}

    public record ReliabilityResponse(
        String networkId,
        String period,
        OffsetDateTime since,
        OffsetDateTime until,
        String source,
        int observedDays,
        long observationMinutes,
        double coveragePercentage,
        String confidence,
        String coverageLabel,
        String serviceWindowBasis,
        boolean scheduleBacked,
        double scheduleCoveragePercentage,
        String message,
        List<ReliabilityMetric> metrics,
        List<AlertTypeBreakdown> breakdown
    ) {}

    public record ReliabilityMetric(
        String id,
        String number,
        String label,
        long incidents,
        long activeIncidents,
        Long medianDurationMinutes,
        long serviceImpactMinutes,
        long observedServiceMinutes,
        long incidentDisruptionMinutes,
        double serviceImpactPercentage,
        String confidence
    ) {}

    public record AlertTypeBreakdown(
        String impactKind,
        String label,
        long incidents,
        long incidentDisruptionMinutes,
        double percentage
    ) {}
}
