package com.calebhabesh.linewatch.account;

import com.calebhabesh.linewatch.commute.CommuteResponses;
import java.time.Instant;
import java.util.List;

public final class AccountResponses {
    private AccountResponses() {}

    public record UserResponse(String id, String email, String displayName, boolean demo, boolean googleLinked) {}

    public record AuthResponse(boolean authenticated, UserResponse user) {}

    public record AuthSession(UserResponse user, String rawSessionToken, Instant expiresAt) {}

    public record AuthConfigResponse(boolean googleSignInAvailable, String googleClientId) {}

    public record SavedCommuteResponse(
        String id,
        String label,
        String networkId,
        String originStationId,
        String originStationName,
        String destinationStationId,
        String destinationStationName,
        String routeLabel,
        boolean watchReturnTrip,
        CommuteResponses.CommuteLegResponse outboundLeg,
        CommuteResponses.CommuteLegResponse returnLeg,
        CommuteResponses.PathResponse path,
        CommuteResponses.ImpactResponse impact,
        SavedCommuteNotificationRuleResponse notificationRule,
        Instant createdAt,
        Instant updatedAt
    ) {
        public SavedCommuteResponse(
            String id,
            String label,
            String originStationId,
            String originStationName,
            String destinationStationId,
            String destinationStationName,
            String routeLabel,
            boolean watchReturnTrip,
            CommuteResponses.CommuteLegResponse outboundLeg,
            CommuteResponses.CommuteLegResponse returnLeg,
            CommuteResponses.PathResponse path,
            CommuteResponses.ImpactResponse impact,
            SavedCommuteNotificationRuleResponse notificationRule,
            Instant createdAt,
            Instant updatedAt
        ) {
            this(
                id, label, "ttc", originStationId, originStationName, destinationStationId,
                destinationStationName, routeLabel, watchReturnTrip, outboundLeg, returnLeg,
                path, impact, notificationRule, createdAt, updatedAt
            );
        }

        public SavedCommuteResponse(
            String id,
            String label,
            String originStationId,
            String originStationName,
            String destinationStationId,
            String destinationStationName,
            String routeLabel,
            boolean watchReturnTrip,
            CommuteResponses.CommuteLegResponse outboundLeg,
            CommuteResponses.CommuteLegResponse returnLeg,
            CommuteResponses.PathResponse path,
            CommuteResponses.ImpactResponse impact,
            Instant createdAt,
            Instant updatedAt
        ) {
            this(
                id,
                label,
                "ttc",
                originStationId,
                originStationName,
                destinationStationId,
                destinationStationName,
                routeLabel,
                watchReturnTrip,
                outboundLeg,
                returnLeg,
                path,
                impact,
                defaultNotificationRule(),
                createdAt,
                updatedAt
            );
        }
    }

    public record SavedCommuteNotificationEventTypesResponse(
        boolean suspensions,
        boolean delays,
        boolean reducedSpeedZones,
        boolean plannedClosures,
        boolean serviceRestored
    ) {}

    public record SavedCommuteNotificationScheduleResponse(
        int dayMask,
        Integer startMinute,
        Integer endMinute
    ) {}

    public record SavedCommuteNotificationRuleResponse(
        boolean enabled,
        int dayMask,
        Integer startMinute,
        Integer endMinute,
        boolean outboundEnabled,
        boolean returnEnabled,
        SavedCommuteNotificationEventTypesResponse eventTypes,
        SavedCommuteNotificationScheduleResponse outboundSchedule,
        SavedCommuteNotificationScheduleResponse returnSchedule
    ) {
        public SavedCommuteNotificationRuleResponse(
            boolean enabled,
            int dayMask,
            Integer startMinute,
            Integer endMinute,
            boolean outboundEnabled,
            boolean returnEnabled,
            SavedCommuteNotificationEventTypesResponse eventTypes
        ) {
            this(
                enabled,
                dayMask,
                startMinute,
                endMinute,
                outboundEnabled,
                returnEnabled,
                eventTypes,
                new SavedCommuteNotificationScheduleResponse(dayMask, startMinute, endMinute),
                new SavedCommuteNotificationScheduleResponse(dayMask, startMinute, endMinute)
            );
        }
    }

    public record SavedCommuteListResponse(List<SavedCommuteResponse> commutes) {}

    public static SavedCommuteNotificationRuleResponse defaultNotificationRule() {
        return new SavedCommuteNotificationRuleResponse(
            true,
            62,
            390,
            570,
            true,
            true,
            new SavedCommuteNotificationEventTypesResponse(
                true,
                true,
                true,
                true,
                true
            ),
            new SavedCommuteNotificationScheduleResponse(62, 390, 570),
            new SavedCommuteNotificationScheduleResponse(62, 900, 1140)
        );
    }
}
