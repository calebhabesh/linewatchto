package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.dashboard.DashboardResponses;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.map.MapController;
import com.calebhabesh.linewatch.performance.TtcPerformanceResponses;
import com.calebhabesh.linewatch.status.StatusController;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;

@Service
public class RegionalDashboardService {
    private static final String SOURCE = "Metrolinx Open API";
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.CANADA);
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("MMM d, uuuu", Locale.CANADA);
    private static final DateTimeFormatter WINDOW = DateTimeFormatter.ofPattern("EEE, MMM d · h:mm a", Locale.CANADA);

    private final RegionalAlertStore alertStore;
    private final RegionalIngestionRunStore runStore;
    private final RegionalIngestionFreshness freshness;
    private final MetrolinxProperties properties;
    private final Clock clock;

    public RegionalDashboardService(
        RegionalAlertStore alertStore,
        RegionalIngestionRunStore runStore,
        RegionalIngestionFreshness freshness,
        MetrolinxProperties properties,
        Clock clock
    ) {
        this.alertStore = alertStore;
        this.runStore = runStore;
        this.freshness = freshness;
        this.properties = properties;
        this.clock = clock;
    }

    public DashboardResponses.DashboardResponse dashboard() {
        Optional<IngestionRunSnapshot> latest = runStore.findLatest();
        boolean fresh = freshness.remainingFreshness(latest).isPresent();
        List<RegionalNormalizedAlert> alerts = fresh ? alertStore.findActiveAlerts() : List.of();
        OffsetDateTime sourceUpdatedAt = latest.map(IngestionRunSnapshot::sourceFeedUpdatedAt).orElse(null);
        return new DashboardResponses.DashboardResponse(
            RegionalNetworkCatalog.NETWORK_ID,
            fresh ? "available" : "unavailable",
            List.of(MetrolinxSourceSystem.GO_SERVICE_ALERTS, MetrolinxSourceSystem.UP_GTFS_ALERTS),
            message(fresh, latest),
            map(alerts),
            status(alerts, sourceUpdatedAt, fresh),
            activeAlerts(alerts),
            delays(alerts),
            List.of(),
            plannedClosures(alerts),
            unavailablePerformance()
        );
    }

    private MapController.MapResponse map(List<RegionalNormalizedAlert> alerts) {
        List<MapController.StationDto> stations = RegionalNetworkCatalog.stations().stream()
            .map(station -> new MapController.StationDto(station.id(), station.name(), 0, 0, station.interchange()))
            .toList();
        Map<String, List<RegionalNormalizedAlert>> alertsBySegment = new LinkedHashMap<>();
        for (RegionalNormalizedAlert alert : alerts.stream()
            .filter(candidate -> !"planned-closure".equals(candidate.impactKind()))
            .toList()) {
            for (String segmentId : alert.affectedSegmentIds()) {
                alertsBySegment.computeIfAbsent(segmentId, ignored -> new ArrayList<>()).add(alert);
            }
        }
        List<MapController.NetworkSegmentDto> segments = RegionalNetworkCatalog.segments().stream()
            .map(segment -> segment(segment, alertsBySegment.getOrDefault(segment.id(), List.of())))
            .toList();
        List<MapController.StationNodeImpactDto> stationImpacts = alerts.stream()
            .filter(alert -> !"planned-closure".equals(alert.impactKind()))
            .filter(alert -> alert.stationIds().size() == 1 && alert.affectedSegmentIds().isEmpty())
            .map(alert -> new MapController.StationNodeImpactDto(
                alert.stationIds().getFirst(), alert.impactKind(), alert.id(), alert.title()
            ))
            .toList();
        return new MapController.MapResponse(stations, segments, stationImpacts);
    }

    private MapController.NetworkSegmentDto segment(
        RegionalNetworkCatalog.Segment segment,
        List<RegionalNormalizedAlert> alerts
    ) {
        List<RegionalNormalizedAlert> ordered = alerts.stream()
            .sorted(Comparator.comparingInt(alert -> impactPriority(alert.impactKind())))
            .toList();
        RegionalNormalizedAlert primary = ordered.isEmpty() ? null : ordered.getFirst();
        List<MapController.SegmentImpactDto> impacts = ordered.stream()
            .map(alert -> new MapController.SegmentImpactDto(
                alert.impactKind(), alert.id(), "bidirectional", List.of(alert.id())
            ))
            .toList();
        return new MapController.NetworkSegmentDto(
            segment.id(), segment.lineId(), segment.label(), segment.stationAId(), segment.stationBId(),
            segment.stationAAnchorId(), segment.stationBAnchorId(), segment.guidePathId(), false, "", impacts,
            primary == null ? "clear" : overlay(primary.impactKind()),
            primary == null ? null : "bidirectional",
            primary == null ? List.of() : List.of(primary.id()),
            List.of(), primary == null ? null : primary.id()
        );
    }

    private StatusController.StatusResponse status(
        List<RegionalNormalizedAlert> alerts,
        OffsetDateTime sourceUpdatedAt,
        boolean fresh
    ) {
        OffsetDateTime displayTime = sourceUpdatedAt == null ? OffsetDateTime.now(clock) : sourceUpdatedAt;
        var toronto = displayTime.atZoneSameInstant(TORONTO_ZONE);
        StatusController.GeneratedAtDto generated = fresh
            ? new StatusController.GeneratedAtDto(TIME.format(toronto), DATE.format(toronto), true, "latest Metrolinx poll succeeded")
            : new StatusController.GeneratedAtDto("Unavailable", "Regional source unavailable", false, "not configured or stale");
        List<StatusController.LineStatusDto> lines = RegionalNetworkCatalog.routes().stream()
            .map(route -> lineStatus(route, alerts, fresh))
            .toList();
        return new StatusController.StatusResponse(generated, lines);
    }

    private StatusController.LineStatusDto lineStatus(
        RegionalNetworkCatalog.Route route,
        List<RegionalNormalizedAlert> alerts,
        boolean fresh
    ) {
        List<RegionalNormalizedAlert> lineAlerts = alerts.stream()
            .filter(alert -> route.id().equals(alert.lineId()))
            .sorted(Comparator.comparingInt(alert -> impactPriority(alert.impactKind())))
            .toList();
        if (!fresh) {
            return new StatusController.LineStatusDto(
                route.id(), route.number(), route.name(), route.name() + " corridor", route.color(),
                "ready", "Data unavailable", "Metrolinx realtime data is disabled, unavailable, or stale.", "Not live"
            );
        }
        if (lineAlerts.isEmpty()) {
            return new StatusController.LineStatusDto(
                route.id(), route.number(), route.name(), route.name() + " corridor", route.color(),
                "normal", "Normal", "No current rail service impacts in the latest Metrolinx alert dataset.", "Latest poll"
            );
        }
        RegionalNormalizedAlert primary = lineAlerts.getFirst();
        String state = switch (primary.impactKind()) {
            case "suspension" -> "suspension";
            case "planned-closure" -> "planned";
            default -> "delay";
        };
        String label = switch (primary.impactKind()) {
            case "suspension" -> "Service suspended";
            case "planned-closure" -> "Planned change";
            default -> "Service change";
        };
        String summary = lineAlerts.size() == 1 ? primary.title() : lineAlerts.size() + " current Metrolinx service updates";
        return new StatusController.LineStatusDto(
            route.id(), route.number(), route.name(), route.name() + " corridor", route.color(),
            state, label, summary, "Latest poll"
        );
    }

    private List<AlertDashboardService.ActiveAlertDto> activeAlerts(List<RegionalNormalizedAlert> alerts) {
        return alerts.stream().filter(alert -> "suspension".equals(alert.impactKind()))
            .map(alert -> new AlertDashboardService.ActiveAlertDto(
                alert.id(), alert.lineId(), lineNumber(alert), alert.title(), "suspension", location(alert), null,
                alert.description(), alert.activePeriodStart(), alert.sourceUpdatedAt(), alert.affectedSegmentIds(),
                false, sourceLabel(alert), alert.cause(), null
            )).toList();
    }

    private List<AlertDashboardService.DelayAlertDto> delays(List<RegionalNormalizedAlert> alerts) {
        return alerts.stream().filter(alert -> "delay".equals(alert.impactKind()))
            .map(alert -> new AlertDashboardService.DelayAlertDto(
                alert.id(), alert.lineId(), lineNumber(alert), alert.title(), location(alert), null,
                alert.description(), alert.affectedSegmentIds(), alert.activePeriodStart(), alert.sourceUpdatedAt(),
                sourceLabel(alert), alert.cause()
            )).toList();
    }

    private List<AlertDashboardService.PlannedClosureDto> plannedClosures(List<RegionalNormalizedAlert> alerts) {
        return alerts.stream().filter(alert -> "planned-closure".equals(alert.impactKind()))
            .map(alert -> new AlertDashboardService.PlannedClosureDto(
                alert.id(), alert.lineId(), lineNumber(alert), alert.title(), window(alert), location(alert), null,
                alert.description(), alert.activePeriodStart(), alert.sourceUpdatedAt(), alert.affectedSegmentIds(),
                false, sourceLabel(alert), alert.cause(), null
            )).toList();
    }

    private String location(RegionalNormalizedAlert alert) {
        RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(alert.lineId()).orElse(null);
        if (route == null || alert.stationIds().isEmpty()) return lineNumber(alert) + " corridor";
        List<String> ordered = route.stationIds().stream().filter(alert.stationIds()::contains).toList();
        if (ordered.isEmpty()) return route.name() + " corridor";
        String first = RegionalNetworkCatalog.station(ordered.getFirst()).map(station -> station.name()).orElse(ordered.getFirst());
        if (ordered.size() == 1) return first;
        String last = RegionalNetworkCatalog.station(ordered.getLast()).map(station -> station.name()).orElse(ordered.getLast());
        return first + " to " + last;
    }

    private String window(RegionalNormalizedAlert alert) {
        if (alert.activePeriodStart() == null) return "Timing published by Metrolinx";
        String start = WINDOW.format(alert.activePeriodStart().atZoneSameInstant(TORONTO_ZONE));
        if (alert.activePeriodEnd() == null) return start;
        return start + " – " + WINDOW.format(alert.activePeriodEnd().atZoneSameInstant(TORONTO_ZONE));
    }

    private String lineNumber(RegionalNormalizedAlert alert) {
        return RegionalNetworkCatalog.route(alert.lineId()).map(RegionalNetworkCatalog.Route::number).orElse("");
    }

    private String sourceLabel(RegionalNormalizedAlert alert) {
        return MetrolinxSourceSystem.UP_GTFS_ALERTS.equals(alert.sourceSystem())
            ? "Metrolinx UP Express GTFS-RT"
            : SOURCE;
    }

    private String message(boolean fresh, Optional<IngestionRunSnapshot> latest) {
        if (fresh) return "Fresh purpose-built GO and UP rail status derived from the Metrolinx Open API.";
        if (!properties.isEnabled()) return "Regional realtime ingestion is disabled; static catalog data is provided for interface use only.";
        if (!properties.isConfigured()) return "Regional realtime ingestion is enabled but the Metrolinx API key is not configured.";
        if (latest.isEmpty()) return "Regional realtime ingestion has not completed successfully yet.";
        return "The latest successful regional ingestion is stale; live impacts are suppressed.";
    }

    private TtcPerformanceResponses.SnapshotResponse unavailablePerformance() {
        return new TtcPerformanceResponses.SnapshotResponse(
            "disabled", "Unavailable", "", "Regional performance unavailable", "Not available", null,
            false, "Regional reliability aggregation is not implemented.", List.of()
        );
    }

    private int impactPriority(String kind) {
        return switch (kind) {
            case "suspension" -> 0;
            case "delay" -> 1;
            case "planned-closure" -> 2;
            default -> 3;
        };
    }

    private String overlay(String kind) {
        return "suspension".equals(kind) ? "suspension" : "delay";
    }
}
