package com.calebhabesh.linewatch.station;

public class StationNotFoundException extends RuntimeException {
    public StationNotFoundException(String stationId) {
        super("Unknown station: " + stationId);
    }
}
