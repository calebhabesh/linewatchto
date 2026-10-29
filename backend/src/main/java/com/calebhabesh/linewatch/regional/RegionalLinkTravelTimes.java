package com.calebhabesh.linewatch.regional;

import java.util.OptionalInt;

/** Typical time a train takes between two adjacent stations of a line. */
@FunctionalInterface
public interface RegionalLinkTravelTimes {
    RegionalLinkTravelTimes NONE = (lineId, fromStationId, toStationId) -> OptionalInt.empty();

    OptionalInt seconds(String lineId, String fromStationId, String toStationId);
}
