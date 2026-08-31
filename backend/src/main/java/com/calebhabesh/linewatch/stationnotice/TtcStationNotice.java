package com.calebhabesh.linewatch.stationnotice;

import java.time.LocalDate;
import java.time.OffsetDateTime;

public record TtcStationNotice(
    String id,
    String stationId,
    String category,
    String title,
    String summary,
    String sourceUrl,
    LocalDate effectiveStart,
    LocalDate effectiveEnd,
    OffsetDateTime sourceUpdatedAt,
    OffsetDateTime lastVerifiedAt,
    String source
) {}
