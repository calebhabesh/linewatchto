package com.calebhabesh.linewatch.commute;

import java.time.OffsetDateTime;
import java.util.List;

public final class CommuteResponses {
    private CommuteResponses() {}

    public record PathResponse(
        String status,
        List<String> stationIds,
        List<String> segmentIds,
        List<PathSegmentHopResponse> segmentHops,
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

    public record PathSegmentHopResponse(
        String segmentId,
        String lineId,
        String fromStationId,
        String toStationId,
        String travelDirection
    ) {}

    public record ImpactResponse(
        String status,
        String severity,
        String statusLabel,
        String detail,
        List<MatchedImpactResponse> matchedImpacts,
        TravelTimeEstimateResponse travelTimeEstimate
    ) {
        public ImpactResponse(
            String status,
            String severity,
            String statusLabel,
            String detail,
            List<MatchedImpactResponse> matchedImpacts
        ) {
            this(status, severity, statusLabel, detail, matchedImpacts, null);
        }
    }

    public record TravelTimeEstimateResponse(
        String status,
        int baselineSeconds,
        Integer estimatedLowSeconds,
        Integer estimatedHighSeconds,
        Integer extraLowSeconds,
        Integer extraHighSeconds,
        String confidence,
        String summary
    ) {}

    public record CommuteLegResponse(
        String id,
        String routeLabel,
        String fromStationId,
        String fromStationName,
        String toStationId,
        String toStationName,
        PathResponse path,
        ImpactResponse impact
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
        String description,
        String source,
        List<String> matchedSegmentIds,
        List<String> matchedStationIds,
        OffsetDateTime startedAt,
        OffsetDateTime updatedAt,
        String window,
        String timingStatus,
        OffsetDateTime eventStartAt,
        String closureHours,
        String closureDates,
        boolean ignoredByRule,
        @com.fasterxml.jackson.annotation.JsonIgnore String notificationTitle,
        @com.fasterxml.jackson.annotation.JsonIgnore String notificationCause,
        @com.fasterxml.jackson.annotation.JsonIgnore boolean notificationShuttle,
        @com.fasterxml.jackson.annotation.JsonIgnore OffsetDateTime notificationServiceEndAt
    ) {
        public MatchedImpactResponse(
            String id,
            String kind,
            String status,
            String severity,
            String title,
            String lineId,
            String lineNumber,
            String location,
            String displayDirection,
            String description,
            String source,
            List<String> matchedSegmentIds,
            List<String> matchedStationIds,
            OffsetDateTime startedAt,
            OffsetDateTime updatedAt,
            String window,
            String timingStatus,
            OffsetDateTime eventStartAt,
            String closureHours,
            String closureDates,
            boolean ignoredByRule,
            String notificationTitle,
            String notificationCause,
            boolean notificationShuttle
        ) {
            this(
                id, kind, status, severity, title, lineId, lineNumber, location, displayDirection,
                description, source, matchedSegmentIds, matchedStationIds, startedAt, updatedAt,
                window, timingStatus, eventStartAt, closureHours, closureDates, ignoredByRule,
                notificationTitle, notificationCause, notificationShuttle, null
            );
        }

        public MatchedImpactResponse(
            String id,
            String kind,
            String status,
            String severity,
            String title,
            String lineId,
            String lineNumber,
            String location,
            String displayDirection,
            String description,
            String source,
            List<String> matchedSegmentIds,
            List<String> matchedStationIds,
            OffsetDateTime startedAt,
            OffsetDateTime updatedAt,
            String window,
            String timingStatus,
            OffsetDateTime eventStartAt,
            String closureHours,
            String closureDates,
            boolean ignoredByRule
        ) {
            this(
                id, kind, status, severity, title, lineId, lineNumber, location, displayDirection,
                description, source, matchedSegmentIds, matchedStationIds, startedAt, updatedAt,
                window, timingStatus, eventStartAt, closureHours, closureDates, ignoredByRule,
                title, null, false
            );
        }

        public MatchedImpactResponse(
            String id,
            String kind,
            String status,
            String severity,
            String title,
            String lineId,
            String lineNumber,
            String location,
            String displayDirection,
            String description,
            String source,
            List<String> matchedSegmentIds,
            List<String> matchedStationIds,
            OffsetDateTime startedAt,
            OffsetDateTime updatedAt,
            String window,
            String timingStatus,
            OffsetDateTime eventStartAt
        ) {
            this(
                id,
                kind,
                status,
                severity,
                title,
                lineId,
                lineNumber,
                location,
                displayDirection,
                description,
                source,
                matchedSegmentIds,
                matchedStationIds,
                startedAt,
                updatedAt,
                window,
                timingStatus,
                eventStartAt,
                null,
                null,
                false,
                title,
                null,
                false
            );
        }

        public MatchedImpactResponse(
            String id,
            String kind,
            String status,
            String severity,
            String title,
            String lineId,
            String lineNumber,
            String location,
            String displayDirection,
            String description,
            String source,
            List<String> matchedSegmentIds,
            List<String> matchedStationIds,
            OffsetDateTime startedAt,
            OffsetDateTime updatedAt,
            String window,
            String timingStatus,
            OffsetDateTime eventStartAt,
            boolean ignoredByRule
        ) {
            this(
                id,
                kind,
                status,
                severity,
                title,
                lineId,
                lineNumber,
                location,
                displayDirection,
                description,
                source,
                matchedSegmentIds,
                matchedStationIds,
                startedAt,
                updatedAt,
                window,
                timingStatus,
                eventStartAt,
                null,
                null,
                ignoredByRule,
                title,
                null,
                false
            );
        }

        public MatchedImpactResponse withIgnoredByRule(boolean ignoredByRule) {
            return new MatchedImpactResponse(
                id,
                kind,
                status,
                severity,
                title,
                lineId,
                lineNumber,
                location,
                displayDirection,
                description,
                source,
                matchedSegmentIds,
                matchedStationIds,
                startedAt,
                updatedAt,
                window,
                timingStatus,
                eventStartAt,
                closureHours,
                closureDates,
                ignoredByRule,
                notificationTitle,
                notificationCause,
                notificationShuttle,
                notificationServiceEndAt
            );
        }
    }
}
