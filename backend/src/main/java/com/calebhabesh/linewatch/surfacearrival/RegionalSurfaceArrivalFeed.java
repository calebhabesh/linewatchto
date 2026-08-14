package com.calebhabesh.linewatch.surfacearrival;

import java.time.OffsetDateTime;
import java.util.List;

public record RegionalSurfaceArrivalFeed(
    OffsetDateTime sourceUpdatedAt,
    List<SurfaceArrivalRecord> arrivals
) {
}
