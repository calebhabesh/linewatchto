package com.calebhabesh.linewatch.ingestion;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.OffsetDateTime;

@JsonIgnoreProperties(ignoreUnknown = true)
public record TtcAlertActivePeriod(
    OffsetDateTime start,
    OffsetDateTime end
) {}
