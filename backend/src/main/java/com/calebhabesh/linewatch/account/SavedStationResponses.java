package com.calebhabesh.linewatch.account;

import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Instant;
import java.util.List;

public final class SavedStationResponses {
    private SavedStationResponses() {
    }

    public record SavedStationListResponse(List<SavedStationResponse> stations) {
    }

    public record SavedStationResponse(
        String networkId,
        StationResponses.StationSummaryResponse station,
        Instant savedAt
    ) {
    }

    public record SaveResult(SavedStationResponse station, boolean created) {
    }
}
