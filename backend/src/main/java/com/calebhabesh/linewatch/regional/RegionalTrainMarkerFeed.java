package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;

public record RegionalTrainMarkerFeed(
    OffsetDateTime sourceUpdatedAt,
    String source,
    List<RegionalTrainMarkerRecord> markers
) {}
