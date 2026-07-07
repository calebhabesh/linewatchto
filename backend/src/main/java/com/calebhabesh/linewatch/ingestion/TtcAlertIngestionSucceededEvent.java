package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;

public record TtcAlertIngestionSucceededEvent(
    long runId,
    OffsetDateTime sourceUpdatedAt
) {}
