package com.calebhabesh.linewatch.surfacearrival;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

public record TtcSurfaceArrivalSnapshot(
    String mode,
    OffsetDateTime sourceUpdatedAt,
    OffsetDateTime indexedAt,
    boolean catalogAvailable,
    Set<String> mappedStationIds,
    List<SurfaceArrivalRecord> arrivals,
    Map<String, List<TtcSurfaceStopArrival>> arrivalsByStop
) {
    public TtcSurfaceArrivalSnapshot {
        mappedStationIds = Set.copyOf(mappedStationIds);
        arrivals = List.copyOf(arrivals);
        arrivalsByStop = Map.copyOf(arrivalsByStop);
    }

    public TtcSurfaceArrivalSnapshot(
        String mode,
        OffsetDateTime sourceUpdatedAt,
        OffsetDateTime indexedAt,
        boolean catalogAvailable,
        Set<String> mappedStationIds,
        List<SurfaceArrivalRecord> arrivals
    ) {
        this(mode, sourceUpdatedAt, indexedAt, catalogAvailable, mappedStationIds, arrivals, Map.of());
    }

    public List<TtcSurfaceStopArrival> arrivalsAt(String stopId) {
        return arrivalsByStop.getOrDefault(stopId, List.of());
    }
}
