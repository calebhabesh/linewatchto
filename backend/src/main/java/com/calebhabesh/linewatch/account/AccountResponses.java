package com.calebhabesh.linewatch.account;

import java.time.Instant;
import java.util.List;

public final class AccountResponses {
    private AccountResponses() {}

    public record UserResponse(String id, String email, String displayName, boolean demo) {}

    public record AuthResponse(boolean authenticated, UserResponse user) {}

    public record AuthSession(UserResponse user, String rawSessionToken, Instant expiresAt) {}

    public record SavedCommuteResponse(
        String id,
        String label,
        String originStationId,
        String originStationName,
        String destinationStationId,
        String destinationStationName,
        String routeLabel,
        Instant createdAt,
        Instant updatedAt
    ) {}

    public record SavedCommuteListResponse(List<SavedCommuteResponse> commutes) {}
}
