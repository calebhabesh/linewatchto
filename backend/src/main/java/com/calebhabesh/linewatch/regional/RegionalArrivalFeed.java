package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;

public record RegionalArrivalFeed(
    OffsetDateTime sourceUpdatedAt,
    List<RegionalArrivalRecord> arrivals
) {
}
