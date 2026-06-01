package com.calebhabesh.linewatch.ingestion;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.OffsetDateTime;

@JsonIgnoreProperties(ignoreUnknown = true)
public record TtcAlertChildPeriod(
    String id,
    OffsetDateTime startTime,
    OffsetDateTime endTime
) {}
