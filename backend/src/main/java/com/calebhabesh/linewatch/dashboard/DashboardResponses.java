package com.calebhabesh.linewatch.dashboard;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.map.MapResponses;
import com.calebhabesh.linewatch.performance.TtcPerformanceResponses;
import com.calebhabesh.linewatch.status.StatusResponses;
import java.util.List;
import java.util.Map;
import java.time.OffsetDateTime;

public final class DashboardResponses {
    private DashboardResponses() {}

    public record DashboardResponse(
        String networkId,
        String availability,
        List<String> sourceSystems,
        String message,
        MapResponses.MapResponse map,
        StatusResponses.StatusResponse status,
        List<AlertDashboardService.ActiveAlertDto> activeAlerts,
        List<AlertDashboardService.DelayAlertDto> delays,
        List<AlertDashboardService.ReducedSpeedZoneDto> reducedSpeedZones,
        List<AlertDashboardService.PlannedClosureDto> plannedClosures,
        TtcPerformanceResponses.SnapshotResponse performance,
        Map<String, IncidentDetails> incidentDetails
    ) {
        public DashboardResponse(
            String networkId, String availability, List<String> sourceSystems, String message,
            MapResponses.MapResponse map, StatusResponses.StatusResponse status,
            List<AlertDashboardService.ActiveAlertDto> activeAlerts,
            List<AlertDashboardService.DelayAlertDto> delays,
            List<AlertDashboardService.ReducedSpeedZoneDto> reducedSpeedZones,
            List<AlertDashboardService.PlannedClosureDto> plannedClosures,
            TtcPerformanceResponses.SnapshotResponse performance
        ) {
            this(networkId, availability, sourceSystems, message, map, status, activeAlerts,
                delays, reducedSpeedZones, plannedClosures, performance, Map.of());
        }
    }

    /**
     * Published rider facts; alert validity windows are not recovery estimates. {@code wholeLine}
     * marks an impact on every segment of its line; {@code replacementSkippedStations} names, in
     * route order, the stations the replacement service does not serve.
     */
    public record IncidentDetails(
        String replacementService, Integer maximumDelayMinutes,
        OffsetDateTime publishedAt, Boolean wholeLine, List<String> replacementSkippedStations
    ) {
        public IncidentDetails {
            replacementSkippedStations = replacementSkippedStations == null ? List.of() : List.copyOf(replacementSkippedStations);
        }

        public IncidentDetails(String replacementService, Integer maximumDelayMinutes, OffsetDateTime publishedAt) {
            this(replacementService, maximumDelayMinutes, publishedAt, false, List.of());
        }
    }
}
