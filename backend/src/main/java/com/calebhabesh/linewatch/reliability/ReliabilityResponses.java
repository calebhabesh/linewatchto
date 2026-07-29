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
        String confidence,
        String coverageLabel,
        String message,
        List<ReliabilityMetric> metrics
    ) {}

    public record ReliabilityMetric(
        String id,
        String number,
        String label,
        long incidents,
        long activeIncidents,
        Long medianDurationMinutes,
        long observedDisruptionMinutes,
        String confidence
    ) {}
}
