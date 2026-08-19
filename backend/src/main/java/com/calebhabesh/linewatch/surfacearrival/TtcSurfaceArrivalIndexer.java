package com.calebhabesh.linewatch.surfacearrival;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class TtcSurfaceArrivalIndexer {
    static final String SOURCE = "TTC GTFS-RT bus and streetcar trip updates";
    private final TtcSurfaceScheduleCatalog catalogRepository;

    public TtcSurfaceArrivalIndexer(TtcSurfaceScheduleCatalog catalogRepository) {
        this.catalogRepository = catalogRepository;
    }

    public TtcSurfaceArrivalSnapshot index(
        String mode,
        TtcSurfaceTripUpdateParser.Feed feed,
        OffsetDateTime indexedAt
    ) {
        TtcSurfaceScheduleCatalog.Catalog catalog = catalogRepository.active();
        Map<String, SurfaceArrivalRecord> unique = new LinkedHashMap<>();
        if (catalog.available()) {
            for (TtcSurfaceTripUpdateParser.TripUpdate update : feed.trips()) {
                TtcSurfaceScheduleCatalog.Trip trip = catalog.trips().get(update.tripId());
                String routeId = update.routeId() != null ? update.routeId() : trip == null ? null : trip.routeId();
                TtcSurfaceScheduleCatalog.Route route = catalog.routes().get(routeId);
                if (route == null && routeId != null) {
                    String cleanRoute = routeId.replaceAll("^[0-9]+-", "").replaceAll("_.*", "");
                    route = catalog.routes().get(cleanRoute);
                    if (route == null) {
                        route = new TtcSurfaceScheduleCatalog.Route(routeId, routeId, routeId, mode);
                    }
                }
                if (route == null || !mode.equals(route.mode())) continue;
                for (TtcSurfaceTripUpdateParser.StopUpdate stopUpdate : update.stops()) {
                    TtcSurfaceScheduleCatalog.Stop stop = catalog.stops().get(stopUpdate.stopId());
                    if (stop == null) continue;
                    String destination = trip != null && !trip.headsign().isBlank()
                        ? trip.headsign() : route.longName();
                    SurfaceArrivalRecord row = new SurfaceArrivalRecord(
                        stop.stationId(), "TTC", mode, route.shortName(), route.longName(),
                        destination == null ? "" : destination,
                        stopUpdate.event().scheduledAt(), stopUpdate.event().predictedAt(),
                        stop.bayPlatform(), stop.stopName(), update.tripId() == null ? "" : update.tripId(),
                        SOURCE, "live"
                    );
                    unique.putIfAbsent(
                        stop.stationId() + ":" + route.routeId() + ":" + stop.stopId() + ":" + row.predictedAt(), row
                    );
                }
            }
        }
        List<SurfaceArrivalRecord> arrivals = new ArrayList<>(unique.values());
        arrivals.sort(Comparator.comparing(SurfaceArrivalRecord::predictedAt));
        return new TtcSurfaceArrivalSnapshot(
            mode, feed.sourceUpdatedAt(), indexedAt, catalog.available(), catalog.mappedStationIds(), arrivals
        );
    }
}
