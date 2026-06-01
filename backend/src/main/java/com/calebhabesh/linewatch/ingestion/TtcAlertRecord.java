package com.calebhabesh.linewatch.ingestion;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.OffsetDateTime;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record TtcAlertRecord(
    String id,
    String alertType,
    OffsetDateTime lastUpdated,
    TtcAlertActivePeriod activePeriod,
    List<String> activePeriodGroup,
    String route,
    String routeType,
    String stopStart,
    String stopEnd,
    List<String> stopIDList,
    String title,
    String description,
    String headerText,
    String effect,
    String effectDesc,
    String direction,
    String cause,
    String causeDescription,
    String shuttleType,
    String shuttleStart,
    String shuttleEnd,
    String elevatorCode,
    String escalatorCode,
    List<TtcAlertChildPeriod> childAlerts
) {}
