package com.calebhabesh.linewatch.regional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record RegionalGtfsPreparedImport(
    String sourceSystem,
    String sourceUrl,
    LocalDate serviceStart,
    LocalDate serviceEnd,
    List<RegionalGtfsScheduleImport.Service> services,
    List<RegionalGtfsScheduleImport.ServiceException> exceptions,
    int routeCount,
    Map<String, RegionalGtfsScheduleImportService.TripInfo> trips,
    Map<String, RegionalGtfsScheduleImportService.StopInfo> stops
) {
    public RegionalGtfsPreparedImport {
        services = List.copyOf(services);
        exceptions = List.copyOf(exceptions);
        trips = Map.copyOf(trips);
        stops = Map.copyOf(stops);
    }
}
