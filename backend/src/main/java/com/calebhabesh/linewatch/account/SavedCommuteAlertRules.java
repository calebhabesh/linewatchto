package com.calebhabesh.linewatch.account;

import com.calebhabesh.linewatch.commute.CommuteResponses;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public final class SavedCommuteAlertRules {
    private SavedCommuteAlertRules() {}

    public static boolean dashboardMatchCounts(
        SavedCommuteEntity commute,
        String legId,
        CommuteResponses.PathResponse path,
        CommuteResponses.MatchedImpactResponse match
    ) {
        return commute != null
            && commute.isNotificationEnabled()
            && legAllowed(commute, legId)
            && eventTypeAllowed(commute, match == null ? null : match.kind())
            && matchesMonitoredSection(commute, path, match);
    }

    public static boolean legAllowed(SavedCommuteEntity commute, String legId) {
        if ("outbound".equals(legId)) {
            return commute.isNotificationOutboundEnabled();
        }
        if ("return".equals(legId)) {
            return commute.isNotificationReturnEnabled();
        }
        return true;
    }

    public static boolean eventTypeAllowed(SavedCommuteEntity commute, String eventType) {
        return switch (safe(eventType)) {
            case "suspension" -> commute.isNotificationSuspensionEnabled();
            case "delay" -> commute.isNotificationDelayEnabled();
            case "reduced-speed-zone" -> commute.isNotificationReducedSpeedZoneEnabled();
            case "planned-closure" -> commute.isNotificationPlannedClosureEnabled();
            case "service-restored" -> commute.isNotificationRestoredEnabled();
            default -> true;
        };
    }

    public static boolean matchesMonitoredSection(
        SavedCommuteEntity commute,
        CommuteResponses.PathResponse path,
        CommuteResponses.MatchedImpactResponse match
    ) {
        String startStationId = safe(commute.getNotificationSectionStartStationId());
        String endStationId = safe(commute.getNotificationSectionEndStationId());
        if (startStationId.isBlank() || endStationId.isBlank()) {
            return true;
        }
        if (path == null || path.stationIds() == null || path.segmentIds() == null || match == null) {
            return false;
        }
        int startIndex = path.stationIds().indexOf(startStationId);
        int endIndex = path.stationIds().indexOf(endStationId);
        if (startIndex < 0 || endIndex < 0) {
            return false;
        }

        int from = Math.min(startIndex, endIndex);
        int to = Math.max(startIndex, endIndex);
        Set<String> corridorStations = new LinkedHashSet<>(path.stationIds().subList(from, to + 1));
        Set<String> corridorSegments = new LinkedHashSet<>();
        for (int i = from; i < to && i < path.segmentIds().size(); i++) {
            corridorSegments.add(path.segmentIds().get(i));
        }

        return intersects(match.matchedSegmentIds(), corridorSegments)
            || intersects(match.matchedStationIds(), corridorStations);
    }

    private static boolean intersects(List<String> values, Set<String> candidates) {
        if (values == null || values.isEmpty() || candidates.isEmpty()) {
            return false;
        }
        return values.stream().anyMatch(candidates::contains);
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
