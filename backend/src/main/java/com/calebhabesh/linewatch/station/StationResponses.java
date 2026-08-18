package com.calebhabesh.linewatch.station;

import java.time.OffsetDateTime;
import java.util.List;

public final class StationResponses {
    private StationResponses() {
    }

    public record StationListResponse(
        String generatedAt,
        List<StationSummaryResponse> stations
    ) {
    }

    public record StationSummaryResponse(
        String id,
        String name,
        int mapX,
        int mapY,
        boolean interchange,
        List<String> lineIds,
        boolean hasActiveImpact,
        String accessStatus,
        StationAccessOutageCountsResponse accessOutageCounts,
        boolean wheelchairAccessible,
        boolean hasElevator,
        boolean hasWashroom,
        boolean hasParking
    ) {
        public StationSummaryResponse(
            String id,
            String name,
            int mapX,
            int mapY,
            boolean interchange,
            List<String> lineIds,
            boolean hasActiveImpact,
            String accessStatus,
            StationAccessOutageCountsResponse accessOutageCounts
        ) {
            this(id, name, mapX, mapY, interchange, lineIds, hasActiveImpact, accessStatus, accessOutageCounts, false, false, false, false);
        }
    }

    public record StationAccessOutageCountsResponse(
        int elevator,
        int escalator
    ) {
    }

    public record StationDetailResponse(
        String id,
        String name,
        int mapX,
        int mapY,
        boolean interchange,
        List<StationLineResponse> lines,
        StationAccessResponse access,
        List<StationImpactResponse> impacts,
        List<StationArrivalResponse> arrivals,
        String arrivalsSource,
        StationArrivalContextResponse arrivalContext,
        String dataMode,
        String disclaimer,
        boolean hasWashroom,
        boolean hasParking
    ) {
    }

    public record StationArrivalContextResponse(
        boolean scheduleMayBeDisrupted,
        String message,
        String reason,
        String severity,
        String source
    ) {
    }

    public record StationLineResponse(
        String id,
        String number,
        String name,
        String color,
        String platformLabel,
        boolean wheelchairAccessible,
        boolean hasElevator
    ) {
    }

    public record StationAccessResponse(
        String status,
        String summary,
        String updatedAgo,
        List<StationFacilityOutageResponse> outages
    ) {
    }

    public record StationFacilityOutageResponse(
        String id,
        String assetType,
        String title,
        String description,
        String cause,
        OffsetDateTime updatedAt,
        String source
    ) {
    }

    public record StationImpactResponse(
        String id,
        String type,
        String severity,
        String title,
        String summary,
        String updatedAgo,
        OffsetDateTime updatedAt,
        String source
    ) {
    }

    public record StationArrivalResponse(
        String lineId,
        String direction,
        Integer minutes,
        OffsetDateTime predictedAt,
        String label,
        String source,
        String status
    ) {
    }
}
