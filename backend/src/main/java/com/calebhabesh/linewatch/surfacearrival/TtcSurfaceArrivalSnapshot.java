package com.calebhabesh.linewatch.surfacearrival;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;

public record TtcSurfaceArrivalSnapshot(
    String mode,
    OffsetDateTime sourceUpdatedAt,
    OffsetDateTime indexedAt,
    boolean catalogAvailable,
    Set<String> mappedStationIds,
    List<SurfaceArrivalRecord> arrivals
) {
    public TtcSurfaceArrivalSnapshot {
        mappedStationIds = Set.copyOf(mappedStationIds);
        arrivals = List.copyOf(arrivals);
    }
}
