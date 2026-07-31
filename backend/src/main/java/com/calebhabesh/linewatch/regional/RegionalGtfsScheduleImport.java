package com.calebhabesh.linewatch.regional;

import java.time.LocalDate;
import java.util.List;

public record RegionalGtfsScheduleImport(
    String sourceSystem,
    String sourceUrl,
    LocalDate serviceStart,
    LocalDate serviceEnd,
    List<Service> services,
    List<ServiceException> exceptions,
    List<Departure> departures
) {
    public RegionalGtfsScheduleImport {
        services = List.copyOf(services);
        exceptions = List.copyOf(exceptions);
        departures = List.copyOf(departures);
    }

    public record Service(
        String serviceId,
        boolean monday, boolean tuesday, boolean wednesday, boolean thursday,
        boolean friday, boolean saturday, boolean sunday,
        LocalDate startDate, LocalDate endDate
    ) {}
    public record ServiceException(String serviceId, LocalDate serviceDate, int exceptionType) {}
    public record Departure(
        String stationId, String lineId, String serviceId, String tripId, String tripShortName,
        String direction, int departureSeconds, String platform, Integer stopSequence
    ) {}
}
