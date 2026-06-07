package com.calebhabesh.linewatch.performance;

import java.time.OffsetDateTime;
import java.util.List;

public final class TtcPerformanceResponses {
    private TtcPerformanceResponses() {}

    public record SnapshotResponse(
        String status,
        String source,
        String sourceUrl,
        String title,
        String updatedLabel,
        OffsetDateTime fetchedAt,
        boolean stale,
        String message,
        List<MetricResponse> metrics
    ) {}

    public record MetricResponse(
        String id,
        String label,
        String category,
        Integer percentage,
        Integer target,
        String valueLabel,
        String note
    ) {}
}
