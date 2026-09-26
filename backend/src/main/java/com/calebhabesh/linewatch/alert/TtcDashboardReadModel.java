package com.calebhabesh.linewatch.alert;

import com.calebhabesh.linewatch.alert.AlertActivePeriodRepository.AlertPeriod;
import com.calebhabesh.linewatch.alert.AlertDashboardService.ActiveAlertDto;
import com.calebhabesh.linewatch.alert.AlertDashboardService.DelayAlertDto;
import com.calebhabesh.linewatch.alert.AlertDashboardService.PlannedClosureDto;
import com.calebhabesh.linewatch.alert.AlertDashboardService.ReducedSpeedZoneDto;
import com.calebhabesh.linewatch.alert.AlertDashboardService.SegmentImpact;
import com.calebhabesh.linewatch.alert.AlertDashboardService.StationNodeImpact;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Evaluation-scoped read model capturing time, freshness, loaded repository inputs,
 * and canonical alert projections for a single TTC dashboard computation cycle.
 *
 * <p>Prevents repeated repository queries and redundant projection calculations across
 * status, map, and full dashboard builders during cache misses without promoting
 * request-scoped data into a long-lived global cache.</p>
 */
public record TtcDashboardReadModel(
    OffsetDateTime now,
    Optional<IngestionRunSnapshot> latestSuccessfulRun,
    boolean dashboardLive,
    List<LineSegmentEntity> segments,
    List<AlertEntity> activeAlertEntities,
    List<AlertEntity> plannedClosureEntities,
    Map<String, List<AlertPeriod>> periodsByAlertId,
    List<TtcClosureProjector.ClosureProjection> closureProjections,
    ReducedSpeedZoneProjector.Projection reducedSpeedProjection,
    List<ActiveAlertDto> activeAlerts,
    List<DelayAlertDto> delays,
    List<ReducedSpeedZoneDto> reducedSpeedZones,
    List<PlannedClosureDto> plannedClosures,
    List<PlannedClosureDto> activePlannedClosures,
    Map<String, List<SegmentImpact>> segmentImpacts,
    List<StationNodeImpact> stationNodeImpacts
) {
    public TtcDashboardReadModel {
        now = Objects.requireNonNull(now, "now must not be null");
        latestSuccessfulRun = Objects.requireNonNull(latestSuccessfulRun, "latestSuccessfulRun must not be null");
        segments = segments != null ? List.copyOf(segments) : List.of();
        activeAlertEntities = activeAlertEntities != null ? List.copyOf(activeAlertEntities) : List.of();
        plannedClosureEntities = plannedClosureEntities != null ? List.copyOf(plannedClosureEntities) : List.of();
        periodsByAlertId = periodsByAlertId != null ? Map.copyOf(periodsByAlertId) : Map.of();
        closureProjections = closureProjections != null ? List.copyOf(closureProjections) : List.of();
        activeAlerts = activeAlerts != null ? List.copyOf(activeAlerts) : List.of();
        delays = delays != null ? List.copyOf(delays) : List.of();
        reducedSpeedZones = reducedSpeedZones != null ? List.copyOf(reducedSpeedZones) : List.of();
        plannedClosures = plannedClosures != null ? List.copyOf(plannedClosures) : List.of();
        activePlannedClosures = activePlannedClosures != null ? List.copyOf(activePlannedClosures) : List.of();
        segmentImpacts = segmentImpacts != null ? Map.copyOf(segmentImpacts) : Map.of();
        stationNodeImpacts = stationNodeImpacts != null ? List.copyOf(stationNodeImpacts) : List.of();
    }

    public static TtcDashboardReadModel offline(
        OffsetDateTime now,
        Optional<IngestionRunSnapshot> latestSuccessfulRun,
        List<LineSegmentEntity> segments
    ) {
        return new TtcDashboardReadModel(
            now,
            latestSuccessfulRun != null ? latestSuccessfulRun : Optional.empty(),
            false,
            segments,
            List.of(),
            List.of(),
            Map.of(),
            List.of(),
            null,
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            Map.of(),
            List.of()
        );
    }
}
