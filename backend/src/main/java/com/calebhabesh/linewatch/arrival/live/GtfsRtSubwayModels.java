package com.calebhabesh.linewatch.arrival.live;

import java.time.OffsetDateTime;
import java.util.List;

record GtfsRtSubwayTripUpdateFeed(
    OffsetDateTime feedCreatedAt,
    List<GtfsRtSubwayTripUpdate> trips
) {
    GtfsRtSubwayTripUpdateFeed {
        trips = List.copyOf(trips);
    }
}

record GtfsRtSubwayTripUpdate(
    String entityId,
    String tripId,
    String routeId,
    String lineId,
    String direction,
    String vehicleId,
    List<GtfsRtSubwayStopTimeUpdate> stopUpdates
) {
    GtfsRtSubwayTripUpdate {
        stopUpdates = List.copyOf(stopUpdates);
    }
}

record GtfsRtSubwayStopTimeUpdate(
    String stopId,
    int stopSequence,
    OffsetDateTime arrivalAt,
    OffsetDateTime departureAt
) {
    GtfsRtSubwayStopTimeUpdate(String stopId, int stopSequence, OffsetDateTime predictedAt) {
        this(stopId, stopSequence, predictedAt, null);
    }

    OffsetDateTime predictedAt() {
        return arrivalAt != null ? arrivalAt : departureAt;
    }
}

record GtfsRtSubwayStationArrival(
    String stationId,
    String lineId,
    String direction,
    OffsetDateTime predictedAt,
    OffsetDateTime departureAt,
    String vehicleId,
    String tripId,
    String stopId
) {
    GtfsRtSubwayStationArrival(
        String stationId,
        String lineId,
        String direction,
        OffsetDateTime predictedAt,
        String vehicleId,
        String tripId,
        String stopId
    ) {
        this(stationId, lineId, direction, predictedAt, null, vehicleId, tripId, stopId);
    }

    OffsetDateTime visibleUntil() {
        return departureAt != null ? departureAt : predictedAt;
    }
}

record GtfsRtSubwayArrivalSnapshot(
    OffsetDateTime feedCreatedAt,
    OffsetDateTime indexedAt,
    List<GtfsRtSubwayStationArrival> arrivals
) {
    GtfsRtSubwayArrivalSnapshot {
        arrivals = List.copyOf(arrivals);
    }

    static GtfsRtSubwayArrivalSnapshot empty(OffsetDateTime indexedAt) {
        return new GtfsRtSubwayArrivalSnapshot(null, indexedAt, List.of());
    }
}
