package com.calebhabesh.linewatch.ingestion;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.time.OffsetDateTime;

@JsonIgnoreProperties(ignoreUnknown = true)
public record TtcAlertActivePeriod(
    @JsonDeserialize(using = TtcOffsetDateTimeDeserializer.class)
    OffsetDateTime start,
    @JsonDeserialize(using = TtcOffsetDateTimeDeserializer.class)
    OffsetDateTime end
) {}
