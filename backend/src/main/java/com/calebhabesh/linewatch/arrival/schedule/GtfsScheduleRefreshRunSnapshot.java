package com.calebhabesh.linewatch.arrival.schedule;

import java.time.OffsetDateTime;

public record GtfsScheduleRefreshRunSnapshot(
    long id,
    String status,
    OffsetDateTime startedAt,
    OffsetDateTime completedAt,
    int recordsProcessed,
    String errorMessage
) {}
