package com.calebhabesh.linewatch.arrival.schedule;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

record GtfsSchedulePreparedImport(
    List<GtfsImportModels.RouteRow> routes,
    List<GtfsImportModels.StopRow> stops,
    List<GtfsImportModels.ServiceRow> services,
    List<GtfsImportModels.ServiceExceptionRow> serviceExceptions,
    List<GtfsImportModels.TripRow> trips,
    List<GtfsImportModels.StationStopRow> stationStops,
    Set<String> rapidTransitTripIds,
    LocalDate serviceStart,
    LocalDate serviceEnd
) {
    GtfsSchedulePreparedImport {
        routes = List.copyOf(routes);
        stops = List.copyOf(stops);
        services = List.copyOf(services);
        serviceExceptions = List.copyOf(serviceExceptions);
        trips = List.copyOf(trips);
        stationStops = List.copyOf(stationStops);
        rapidTransitTripIds = Set.copyOf(rapidTransitTripIds);
    }
}
