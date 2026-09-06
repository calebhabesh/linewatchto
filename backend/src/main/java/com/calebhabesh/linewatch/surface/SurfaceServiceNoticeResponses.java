package com.calebhabesh.linewatch.surface;

import java.time.OffsetDateTime;
import java.util.List;

public class SurfaceServiceNoticeResponses {

    public record SurfaceServiceNoticesResponse(
        OffsetDateTime generatedAt,
        boolean fresh,
        String source,
        List<CategorySummary> categories,
        List<NoticeDetail> notices
    ) {}

    public record CategorySummary(
        String category,
        String label,
        int count
    ) {}

    public record NoticeDetail(
        String id,
        String category,
        String routeType,
        List<String> routeIds,
        String title,
        String description,
        String location,
        List<String> stopIds,
        List<StopDetail> stops,
        String direction,
        String cause,
        OffsetDateTime startAt,
        OffsetDateTime endAt,
        OffsetDateTime updatedAt,
        String url,
        String source,
        boolean scheduleAnnouncement
    ) {}

    public record StopDetail(
        String stopId,
        String stopName
    ) {}
}
