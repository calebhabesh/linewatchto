package com.calebhabesh.linewatch.ingestion;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.time.OffsetDateTime;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record TtcAlertRecord(
    String id,
    String alertType,
    @JsonDeserialize(using = TtcOffsetDateTimeDeserializer.class)
    OffsetDateTime lastUpdated,
    TtcAlertActivePeriod activePeriod,
    List<String> activePeriodGroup,
    String route,
    String routeBranch,
    String routeType,
    String stopStart,
    String stopEnd,
    List<String> stopIDList,
    String title,
    String description,
    String headerText,
    String url,
    String effect,
    String effectDesc,
    String direction,
    String cause,
    String causeDescription,
    String targetRemoval,
    String rszLength,
    String distance,
    String trackPercent,
    String reducedSpeed,
    String averageSpeed,
    String shuttleType,
    String shuttleStart,
    String shuttleEnd,
    String elevatorCode,
    String escalatorCode,
    List<TtcAlertChildPeriod> childAlerts
) {
    public TtcAlertRecord(
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
        String url,
        String effect,
        String effectDesc,
        String direction,
        String cause,
        String causeDescription,
        String targetRemoval,
        String rszLength,
        String distance,
        String trackPercent,
        String reducedSpeed,
        String averageSpeed,
        String shuttleType,
        String shuttleStart,
        String shuttleEnd,
        String elevatorCode,
        String escalatorCode,
        List<TtcAlertChildPeriod> childAlerts
    ) {
        this(id, alertType, lastUpdated, activePeriod, activePeriodGroup, route, null,
            routeType, stopStart, stopEnd, stopIDList, title, description, headerText,
            url, effect, effectDesc, direction, cause, causeDescription, targetRemoval,
            rszLength, distance, trackPercent, reducedSpeed, averageSpeed, shuttleType,
            shuttleStart, shuttleEnd, elevatorCode, escalatorCode, childAlerts);
    }

    // Overloaded constructor for backwards compatibility in tests
    public TtcAlertRecord(
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
        String targetRemoval,
        String rszLength,
        String distance,
        String trackPercent,
        String reducedSpeed,
        String averageSpeed,
        String shuttleType,
        String shuttleStart,
        String shuttleEnd,
        String elevatorCode,
        String escalatorCode,
        List<TtcAlertChildPeriod> childAlerts
    ) {
        this(id, alertType, lastUpdated, activePeriod, activePeriodGroup, route, null,
             routeType, stopStart, stopEnd, stopIDList, title, description, headerText,
             null, effect, effectDesc, direction, cause, causeDescription, targetRemoval,
             rszLength, distance, trackPercent, reducedSpeed, averageSpeed, shuttleType,
             shuttleStart, shuttleEnd, elevatorCode, escalatorCode, childAlerts);
    }
}
