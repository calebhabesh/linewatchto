package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;

public record NormalizedAlertPeriod(
    String sourcePeriodId,
    OffsetDateTime startsAt,
    OffsetDateTime endsAt,
    int sortOrder,
    boolean sourceCurrentContinuous
) {
    public NormalizedAlertPeriod(
        String sourcePeriodId,
        OffsetDateTime startsAt,
        OffsetDateTime endsAt,
        int sortOrder
    ) {
        this(sourcePeriodId, startsAt, endsAt, sortOrder, false);
    }
}
