package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public record MetrolinxFeed(
    OffsetDateTime sourceUpdatedAt,
    List<MetrolinxFetchedRecord> records,
    Map<String, Boolean> completeSources
) {}
