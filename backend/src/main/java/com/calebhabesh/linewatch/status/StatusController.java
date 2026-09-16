package com.calebhabesh.linewatch.status;

import com.calebhabesh.linewatch.alert.AlertEntity;
import com.calebhabesh.linewatch.alert.AlertRepository;
import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.station.TransitLineRepository;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/status")
public class StatusController {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private final TransitLineRepository transitLineRepository;
    private final AlertRepository alertRepository;
    private final IngestionRunStore ingestionRunStore;
    private final IngestionFreshness ingestionFreshness;
    private final AlertDashboardService alertDashboardService;
    private final Clock clock;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;

    public StatusController(
        TransitLineRepository transitLineRepository,
        AlertRepository alertRepository,
        IngestionRunStore ingestionRunStore,
        IngestionFreshness ingestionFreshness,
        AlertDashboardService alertDashboardService,
        Clock clock,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.transitLineRepository = transitLineRepository;
        this.alertRepository = alertRepository;
        this.ingestionRunStore = ingestionRunStore;
        this.ingestionFreshness = ingestionFreshness;
        this.alertDashboardService = alertDashboardService;
        this.clock = clock;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
    }

    @GetMapping
    public StatusResponse getStatus() {
        Optional<IngestionRunSnapshot> latestRun = ingestionRunStore.findLatestSuccessful();
        Duration ttl = ingestionFreshness.remainingFreshness(latestRun)
            .map(remaining -> remaining.compareTo(cacheProperties.getStatusTtl()) < 0 ? remaining : cacheProperties.getStatusTtl())
            .orElse(cacheProperties.getStatusTtl());
        return cache.getOrCompute(
            "status",
            new TypeReference<StatusResponse>() {},
            ttl,
            this::buildStatus
        );
    }

    private StatusResponse buildStatus() {
        Optional<IngestionRunSnapshot> latestRun = ingestionRunStore.findLatestSuccessful();
        boolean dashboardLive = ingestionFreshness.isFresh(latestRun);
        List<AlertEntity> activeAlerts = dashboardLive
            ? alertRepository.findByActiveTrueAndType(AlertDashboardService.ACTIVE_ALERT_TYPE)
            : List.of();
        List<AlertDashboardService.PlannedClosureDto> activeClosures = dashboardLive
            ? alertDashboardService.activePlannedClosures()
            : List.of();

        List<LineStatusDto> lines = transitLineRepository.findAllByOrderBySortOrderAsc().stream()
                .map(entity -> toDto(entity, activeAlerts, activeClosures))
                .collect(Collectors.toList());

        OffsetDateTime now = OffsetDateTime.now(clock);
        return new StatusResponse(
                new GeneratedAtDto(
                    now.atZoneSameInstant(TORONTO_ZONE).format(DateTimeFormatter.ofPattern("h:mm a")),
                    now.atZoneSameInstant(TORONTO_ZONE).format(DateTimeFormatter.ofPattern("MMM d, yyyy")),
                    dashboardLive,
                    latestRun.map(this::lastPollLabel).orElse("not run")
                ),
                lines
        );
    }

    private LineStatusDto toDto(
        TransitLineEntity entity,
        List<AlertEntity> allActiveAlerts,
        List<AlertDashboardService.PlannedClosureDto> allActiveClosures
    ) {
        String route = getRouteForLine(entity.getId());

        // Filter acute alerts for this specific line (RSZs are tracked separately)
        List<AlertEntity> lineAlerts = allActiveAlerts.stream()
            .filter(a -> a.getLine() != null && a.getLine().getId().equals(entity.getId()))
            .filter(a -> !"reduced-speed-zone".equalsIgnoreCase(a.getImpactKind()))
            .toList();

        // Filter active planned closures for this specific line
        List<AlertDashboardService.PlannedClosureDto> lineClosures = allActiveClosures.stream()
            .filter(c -> c.lineId() != null && c.lineId().equals(entity.getId()))
            .toList();

        String status = "normal";
        String statusLabel = "Normal";
        String summary = "No active service impacts reported.";
        String updatedAgo = "Updated recently";

        boolean hasSuspension = lineAlerts.stream()
            .anyMatch(a -> "suspension".equalsIgnoreCase(a.getSeverity()));

        boolean hasActiveClosure = !lineClosures.isEmpty();

        boolean hasDelay = lineAlerts.stream()
            .anyMatch(a -> "delay".equalsIgnoreCase(a.getSeverity()));

        if (hasSuspension) {
            status = "suspension";
            statusLabel = "Suspended";

            AlertEntity mostRecent = lineAlerts.stream()
                .filter(a -> "suspension".equalsIgnoreCase(a.getSeverity()))
                .max((a1, a2) -> {
                    if (a1.getSourceUpdatedAt() == null) return -1;
                    if (a2.getSourceUpdatedAt() == null) return 1;
                    return a1.getSourceUpdatedAt().compareTo(a2.getSourceUpdatedAt());
                })
                .orElse(lineAlerts.getFirst());

            summary = mostRecent.getTitle();
            if (summary == null || summary.isBlank()) {
                summary = "Active service alert affecting this line.";
            }
            updatedAgo = updatedAgo(mostRecent.getSourceUpdatedAt());
        } else if (hasActiveClosure) {
            status = "planned";
            statusLabel = "Closure active";

            AlertDashboardService.PlannedClosureDto mostRecentClosure = lineClosures.stream()
                .max((c1, c2) -> {
                    if (c1.updatedAt() == null) return -1;
                    if (c2.updatedAt() == null) return 1;
                    return c1.updatedAt().compareTo(c2.updatedAt());
                })
                .orElse(lineClosures.getFirst());

            summary = mostRecentClosure.title();
            if (summary == null || summary.isBlank()) {
                summary = "Active planned closure affecting this line.";
            }
            updatedAgo = updatedAgo(mostRecentClosure.updatedAt());
        } else if (hasDelay) {
            status = "delay";
            statusLabel = "Delayed";

            AlertEntity mostRecent = lineAlerts.stream()
                .filter(a -> "delay".equalsIgnoreCase(a.getSeverity()))
                .max((a1, a2) -> {
                    if (a1.getSourceUpdatedAt() == null) return -1;
                    if (a2.getSourceUpdatedAt() == null) return 1;
                    return a1.getSourceUpdatedAt().compareTo(a2.getSourceUpdatedAt());
                })
                .orElse(lineAlerts.getFirst());

            summary = mostRecent.getTitle();
            if (summary == null || summary.isBlank()) {
                summary = "Active service alert affecting this line.";
            }
            updatedAgo = updatedAgo(mostRecent.getSourceUpdatedAt());
        } else if (!lineAlerts.isEmpty()) {
            status = "delay";
            statusLabel = "Degraded";

            AlertEntity mostRecent = lineAlerts.stream()
                .max((a1, a2) -> {
                    if (a1.getSourceUpdatedAt() == null) return -1;
                    if (a2.getSourceUpdatedAt() == null) return 1;
                    return a1.getSourceUpdatedAt().compareTo(a2.getSourceUpdatedAt());
                })
                .orElse(lineAlerts.getFirst());

            summary = mostRecent.getTitle();
            if (summary == null || summary.isBlank()) {
                summary = "Active service alert affecting this line.";
            }
            updatedAgo = updatedAgo(mostRecent.getSourceUpdatedAt());
        }

        return new LineStatusDto(
                entity.getId(),
                entity.getNumber(),
                entity.getName(),
                route,
                entity.getColor(),
                status,
                statusLabel,
                summary,
                updatedAgo
        );
    }

    private String getRouteForLine(String lineId) {
        return switch (lineId) {
            case "line-1" -> "Finch - Vaughan Metropolitan Centre";
            case "line-2" -> "Kipling - Kennedy";
            case "line-4" -> "Sheppard-Yonge - Don Mills";
            case "line-5" -> "Mount Dennis - Kennedy";
            case "line-6" -> "Humber College - Finch West";
            default -> "Unknown";
        };
    }

    private String lastPollLabel(IngestionRunSnapshot run) {
        if ("running".equalsIgnoreCase(run.status())) {
            return "running";
        }
        if ("failed".equalsIgnoreCase(run.status())) {
            return "failed";
        }
        OffsetDateTime completedAt = run.completedAt();
        if (completedAt == null) {
            return "status unknown";
        }
        return "succeeded " + relativeAge(completedAt);
    }

    private String updatedAgo(OffsetDateTime updatedAt) {
        if (updatedAt == null) {
            return "Updated recently";
        }
        return "Updated " + relativeAge(updatedAt);
    }

    private String relativeAge(OffsetDateTime timestamp) {
        long minutes = Math.max(0, Duration.between(timestamp, OffsetDateTime.now(clock)).toMinutes());
        if (minutes == 0) {
            return "just now";
        }
        if (minutes == 1) {
            return "1 min ago";
        }
        if (minutes < 60) {
            return minutes + " min ago";
        }
        long hours = minutes / 60;
        if (hours == 1) {
            return "1 hr ago";
        }
        if (hours < 24) {
            return hours + " hr ago";
        }
        long days = hours / 24;
        return days == 1 ? "1 day ago" : days + " days ago";
    }

    public record StatusResponse(GeneratedAtDto generatedAt, List<LineStatusDto> lines) {}
    public record GeneratedAtDto(String time, String date, boolean live, String lastPoll) {}
    public record LineStatusDto(String id, String number, String name, String route, String color, String status, String statusLabel, String summary, String updatedAgo) {}
}
