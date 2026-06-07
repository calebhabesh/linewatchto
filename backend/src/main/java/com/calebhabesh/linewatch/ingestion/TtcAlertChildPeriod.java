package com.calebhabesh.linewatch.ingestion;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.time.OffsetDateTime;

@JsonIgnoreProperties(ignoreUnknown = true)
public record TtcAlertChildPeriod(
    String id,
    @JsonDeserialize(using = TtcOffsetDateTimeDeserializer.class)
    OffsetDateTime startTime,
    @JsonDeserialize(using = TtcOffsetDateTimeDeserializer.class)
    OffsetDateTime endTime
) {}
