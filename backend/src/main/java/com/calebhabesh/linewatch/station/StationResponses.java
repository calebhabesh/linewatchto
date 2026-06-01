package com.calebhabesh.linewatch.station;

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
        String accessStatus
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
        String dataMode,
        String disclaimer
    ) {
    }

    public record StationLineResponse(
        String id,
        String number,
        String name,
        String color,
        String platformLabel
    ) {
    }

    public record StationAccessResponse(
        String status,
        String summary,
        String updatedAgo
    ) {
    }

    public record StationImpactResponse(
        String id,
        String type,
        String severity,
        String title,
        String summary,
        String updatedAgo,
        String source
    ) {
    }

    public record StationArrivalResponse(
        String lineId,
        String direction,
        int minutes,
        String label
    ) {
    }
}
