package com.calebhabesh.linewatch.account;

import com.calebhabesh.linewatch.commute.CommuteResponses;
import java.util.Locale;

public final class SavedCommuteAlertRules {
    private SavedCommuteAlertRules() {}

    public static boolean dashboardMatchCounts(
        SavedCommuteEntity commute,
        String legId,
        CommuteResponses.MatchedImpactResponse match
    ) {
        return commute != null
            && commute.isNotificationEnabled()
            && legAllowed(commute, legId)
            && eventTypeAllowed(commute, match == null ? null : match.relatedPlannedClosureId() != null ? "planned-closure" : match.kind());
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
            case "trip-cancellation" -> commute.isNotificationTripCancellationEnabled();
            case "reduced-speed-zone" -> commute.isNotificationReducedSpeedZoneEnabled();
            case "planned-closure" -> commute.isNotificationPlannedClosureEnabled();
            case "service-restored" -> commute.isNotificationRestoredEnabled();
            default -> true;
        };
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
