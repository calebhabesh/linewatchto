package com.calebhabesh.linewatch.dashboard;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.map.MapController;
import com.calebhabesh.linewatch.performance.TtcPerformanceResponses;
import com.calebhabesh.linewatch.status.StatusController;
import java.util.List;

public final class DashboardResponses {
    private DashboardResponses() {}

    public record DashboardResponse(
        String networkId,
        String availability,
        List<String> sourceSystems,
        String message,
        MapController.MapResponse map,
        StatusController.StatusResponse status,
        List<AlertDashboardService.ActiveAlertDto> activeAlerts,
        List<AlertDashboardService.DelayAlertDto> delays,
        List<AlertDashboardService.ReducedSpeedZoneDto> reducedSpeedZones,
        List<AlertDashboardService.PlannedClosureDto> plannedClosures,
        TtcPerformanceResponses.SnapshotResponse performance
    ) {}
}
