package com.calebhabesh.linewatch.map;

import java.util.List;

public final class MapResponses {
    private MapResponses() {}

    public record MapResponse(
        List<StationDto> stations,
        List<NetworkSegmentDto> segments,
        List<StationNodeImpactDto> stationNodeImpacts
    ) {}

    public record StationDto(String id, String name, int x, int y, boolean interchange) {}

    public record SegmentImpactDto(
        String kind,
        String cardId,
        String travelDirection,
        List<String> sourceAlertIds
    ) {}

    public record StationNodeImpactDto(
        String stationId,
        String kind,
        String cardId,
        String title
    ) {}

    public record NetworkSegmentDto(
        String id,
        String lineId,
        String label,
        String stationAId,
        String stationBId,
        String stationAAnchorId,
        String stationBAnchorId,
        String guidePathId,
        boolean guidePathReversed,
        String pathD,
        List<SegmentImpactDto> impacts,
        String overlay,
        String travelDirection,
        List<String> sourceAlertIds,
        List<String> reducedSpeedZoneIds,
        String alertId
    ) {}
}
