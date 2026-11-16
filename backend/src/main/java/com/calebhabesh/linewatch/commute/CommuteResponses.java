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

    /**
     * One window a planned closure runs in: datesOnly means whole service days from startsAt's to
     * endsAt's (exclusive); a null endsAt runs on with no stated end.
     */
    public record ServiceWindow(OffsetDateTime startsAt, OffsetDateTime endsAt, boolean datesOnly) {}

    /** The windows an upcoming closure's source lists; complete when they cover every date it names. */
    public record ServiceWindows(List<ServiceWindow> windows, boolean complete) {
        public ServiceWindows {
            windows = windows == null ? List.of() : List.copyOf(windows);
        }
    }

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
        @com.fasterxml.jackson.annotation.JsonIgnore OffsetDateTime notificationServiceEndAt,
        String serviceEffect,
        String relatedPlannedClosureId,
        String displayLocation,
        // The windows an upcoming planned closure still runs in (SavedCommuteTripTimes); null when none are known.
        @com.fasterxml.jackson.annotation.JsonIgnore ServiceWindows serviceWindows,
        // Upcoming planned work whose complete window list misses the leg's trip times (SavedCommuteTripTimes.outside).
        boolean outsideTripTimes
    ) {
        public MatchedImpactResponse(
            String id, String kind, String status, String severity, String title, String lineId,
            String lineNumber, String location, String displayDirection, String description, String source,
            List<String> matchedSegmentIds, List<String> matchedStationIds, OffsetDateTime startedAt,
            OffsetDateTime updatedAt, String window, String timingStatus, OffsetDateTime eventStartAt,
            String closureHours, String closureDates, boolean ignoredByRule, String notificationTitle,
            String notificationCause, boolean notificationShuttle, OffsetDateTime notificationServiceEndAt,
            String serviceEffect, String relatedPlannedClosureId, String displayLocation
        ) {
            this(id, kind, status, severity, title, lineId, lineNumber, location, displayDirection, description, source, matchedSegmentIds, matchedStationIds, startedAt, updatedAt, window, timingStatus, eventStartAt, closureHours, closureDates, ignoredByRule, notificationTitle, notificationCause, notificationShuttle, notificationServiceEndAt, serviceEffect, relatedPlannedClosureId, displayLocation, null, false);
        }

        public MatchedImpactResponse withServiceWindows(ServiceWindows windows) {
            return new MatchedImpactResponse(id, kind, status, severity, title, lineId, lineNumber, location, displayDirection, description, source, matchedSegmentIds, matchedStationIds, startedAt, updatedAt, window, timingStatus, eventStartAt, closureHours, closureDates, ignoredByRule, notificationTitle, notificationCause, notificationShuttle, notificationServiceEndAt, serviceEffect, relatedPlannedClosureId, displayLocation, windows, outsideTripTimes);
        }

        /** The occurrence a commute push is about: the first window meeting the leg's trip times. */
        public MatchedImpactResponse withEventStartAt(OffsetDateTime value) {
            return new MatchedImpactResponse(id, kind, status, severity, title, lineId, lineNumber, location, displayDirection, description, source, matchedSegmentIds, matchedStationIds, startedAt, updatedAt, window, timingStatus, value, closureHours, closureDates, ignoredByRule, notificationTitle, notificationCause, notificationShuttle, notificationServiceEndAt, serviceEffect, relatedPlannedClosureId, displayLocation, serviceWindows, outsideTripTimes);
        }

        public MatchedImpactResponse withOutsideTripTimes(boolean value) {
            return new MatchedImpactResponse(id, kind, status, severity, title, lineId, lineNumber, location, displayDirection, description, source, matchedSegmentIds, matchedStationIds, startedAt, updatedAt, window, timingStatus, eventStartAt, closureHours, closureDates, ignoredByRule, notificationTitle, notificationCause, notificationShuttle, notificationServiceEndAt, serviceEffect, relatedPlannedClosureId, displayLocation, serviceWindows, value);
        }

        public MatchedImpactResponse(
            String id, String kind, String status, String severity, String title, String lineId,
            String lineNumber, String location, String displayDirection, String description, String source,
            List<String> matchedSegmentIds, List<String> matchedStationIds, OffsetDateTime startedAt,
            OffsetDateTime updatedAt, String window, String timingStatus, OffsetDateTime eventStartAt,
            String closureHours, String closureDates, boolean ignoredByRule, String notificationTitle,
            String notificationCause, boolean notificationShuttle, OffsetDateTime notificationServiceEndAt,
            String serviceEffect, String relatedPlannedClosureId
        ) {
            this(id, kind, status, severity, title, lineId, lineNumber, location, displayDirection, description, source, matchedSegmentIds, matchedStationIds, startedAt, updatedAt, window, timingStatus, eventStartAt, closureHours, closureDates, ignoredByRule, notificationTitle, notificationCause, notificationShuttle, notificationServiceEndAt, serviceEffect, relatedPlannedClosureId, null);
        }

        public MatchedImpactResponse withDisplayLocation(String value) {
            return new MatchedImpactResponse(id, kind, status, severity, title, lineId, lineNumber, location, displayDirection, description, source, matchedSegmentIds, matchedStationIds, startedAt, updatedAt, window, timingStatus, eventStartAt, closureHours, closureDates, ignoredByRule, notificationTitle, notificationCause, notificationShuttle, notificationServiceEndAt, serviceEffect, relatedPlannedClosureId, value, serviceWindows, outsideTripTimes);
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
            boolean ignoredByRule,
            String notificationTitle,
            String notificationCause,
            boolean notificationShuttle,
            OffsetDateTime notificationServiceEndAt
        ) {
            this(id, kind, status, severity, title, lineId, lineNumber, location, displayDirection, description, source, matchedSegmentIds, matchedStationIds, startedAt, updatedAt, window, timingStatus, eventStartAt, closureHours, closureDates, ignoredByRule, notificationTitle, notificationCause, notificationShuttle, notificationServiceEndAt, null, null);
        }

        public MatchedImpactResponse withServiceEffect(String effect, String plannedId) {
            return new MatchedImpactResponse(id, kind, status, severity, title, lineId, lineNumber, location, displayDirection, description, source, matchedSegmentIds, matchedStationIds, startedAt, updatedAt, window, timingStatus, eventStartAt, closureHours, closureDates, ignoredByRule, notificationTitle, notificationCause, notificationShuttle, notificationServiceEndAt, effect, plannedId, displayLocation, serviceWindows, outsideTripTimes);
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
                notificationServiceEndAt, serviceEffect, relatedPlannedClosureId, displayLocation, serviceWindows, outsideTripTimes
            );
        }
    }
}
