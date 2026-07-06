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
            Instant createdAt,
            Instant updatedAt
        ) {
            this(
                id,
                label,
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

    public record SavedCommuteNotificationRuleResponse(
        boolean enabled,
        int dayMask,
        Integer startMinute,
        Integer endMinute,
        String sectionStartStationId,
        String sectionEndStationId,
        boolean outboundEnabled,
        boolean returnEnabled,
        SavedCommuteNotificationEventTypesResponse eventTypes
    ) {}

    public record SavedCommuteListResponse(List<SavedCommuteResponse> commutes) {}

    public static SavedCommuteNotificationRuleResponse defaultNotificationRule() {
        return new SavedCommuteNotificationRuleResponse(
            true,
            127,
            null,
            null,
            null,
            null,
            true,
            true,
            new SavedCommuteNotificationEventTypesResponse(
                true,
                true,
                true,
                true,
                true
            )
        );
    }
}
