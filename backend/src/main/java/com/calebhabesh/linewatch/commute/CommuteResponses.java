package com.calebhabesh.linewatch.commute;

import java.time.OffsetDateTime;
import java.util.List;

public final class CommuteResponses {
    private CommuteResponses() {}

    public record PathResponse(
        String status,
        List<String> stationIds,
        List<String> segmentIds,
        List<String> lineIds,
        List<String> transferStationIds,
        int estimatedTravelSeconds,
        String weightSource,
        String summary
    ) {
        public boolean available() {
            return "available".equals(status);
        }
    }

    public record ImpactResponse(
        String status,
        String severity,
        String statusLabel,
        String detail,
        List<MatchedImpactResponse> matchedImpacts
    ) {}

    public record MatchedImpactResponse(
        String id,
        String kind,
        String status,
        String severity,
        String title,
        String lineId,
        String lineNumber,
        String location,
        String displayDirection,
        String source,
        List<String> matchedSegmentIds,
        List<String> matchedStationIds,
        OffsetDateTime startedAt,
        OffsetDateTime updatedAt,
        String window,
        String timingStatus
    ) {}
}
