package com.calebhabesh.linewatch.arrival;

import com.calebhabesh.linewatch.station.StationResponses;
import java.util.List;

public interface ArrivalProvider {
    List<ArrivalPrediction> arrivalsFor(String stationId, List<StationResponses.StationLineResponse> lines);
}
