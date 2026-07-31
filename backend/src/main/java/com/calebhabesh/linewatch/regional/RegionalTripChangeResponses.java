package com.calebhabesh.linewatch.regional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public final class RegionalTripChangeResponses {
    private RegionalTripChangeResponses() {}

    public record Response(
        OffsetDateTime generatedAt,
        boolean fresh,
        String source,
        OffsetDateTime sourceUpdatedAt,
        List<TripChange> changes
    ) {}

    public record TripChange(
        String id,
        String kind,
        String tripId,
        String tripNumber,
        String lineId,
        String lineNumber,
        String lineName,
        String destination,
        LocalDate serviceDate,
        OffsetDateTime scheduledStartAt,
        OffsetDateTime updatedAt,
        List<String> sourceSystems,
        List<AffectedStop> affectedStops
    ) {}

    public record AffectedStop(
        String stationId,
        String stationName,
        String kind,
        OffsetDateTime scheduledAt,
        String platform
    ) {}
}
