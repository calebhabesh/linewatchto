package com.calebhabesh.linewatch.announcement;

import java.time.OffsetDateTime;
import java.util.List;

public final class TtcAnnouncementResponses {
    private TtcAnnouncementResponses() {}

    public record Response(
        OffsetDateTime generatedAt,
        boolean fresh,
        String source,
        List<Detail> announcements
    ) {}

    public record Detail(
        String id,
        String scope,
        String title,
        String description,
        String url,
        OffsetDateTime startAt,
        OffsetDateTime endAt,
        OffsetDateTime updatedAt,
        String source
    ) {}
}
