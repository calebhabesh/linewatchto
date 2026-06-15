package com.calebhabesh.linewatch.accessibility;

import java.time.OffsetDateTime;
import java.util.List;

public class AccessibilityOutageResponses {

    public record AccessibilityOutagesResponse(
        OffsetDateTime generatedAt,
        boolean fresh,
        String source,
        List<AssetTypeSummary> assetTypes,
        List<LineGroup> groups
    ) {}

    public record AssetTypeSummary(
        String assetType,
        String label,
        int count,
        List<LineSummary> lines
    ) {}

    public record LineSummary(
        String lineId,
        String lineNumber,
        String lineName,
        String color,
        int count
    ) {}

    public record LineGroup(
        String lineId,
        String lineNumber,
        String lineName,
        String color,
        List<StationGroup> stations
    ) {}

    public record StationGroup(
        String stationId,
        String stationName,
        int count,
        List<OutageDetail> outages
    ) {}

    public record OutageDetail(
        String id,
        String assetType,
        String title,
        String description,
        String cause,
        OffsetDateTime updatedAt,
        String source
    ) {}
}
