package com.calebhabesh.linewatch.status;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.alert.AlertEntity;
import com.calebhabesh.linewatch.alert.AlertRepository;
import com.calebhabesh.linewatch.alert.TtcDashboardReadModel;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.station.TransitLineRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class StatusDashboardService {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private final TransitLineRepository transitLineRepository;
    private final AlertRepository alertRepository;
    private final IngestionRunStore ingestionRunStore;
    private final IngestionFreshness ingestionFreshness;
    private final AlertDashboardService alertDashboardService;
    private final Clock clock;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;

    public StatusDashboardService(
        TransitLineRepository transitLineRepository,
        AlertRepository alertRepository,
        IngestionRunStore ingestionRunStore,
        IngestionFreshness ingestionFreshness,
        AlertDashboardService alertDashboardService,
        Clock clock,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.transitLineRepository = Objects.requireNonNull(transitLineRepository, "transitLineRepository must not be null");
        this.alertRepository = Objects.requireNonNull(alertRepository, "alertRepository must not be null");
        this.ingestionRunStore = Objects.requireNonNull(ingestionRunStore, "ingestionRunStore must not be null");
        this.ingestionFreshness = Objects.requireNonNull(ingestionFreshness, "ingestionFreshness must not be null");
        this.alertDashboardService = Objects.requireNonNull(alertDashboardService, "alertDashboardService must not be null");
        this.clock = Objects.requireNonNull(clock, "clock must not be null");
        this.cache = Objects.requireNonNull(cache, "cache must not be null");
        this.cacheProperties = Objects.requireNonNull(cacheProperties, "cacheProperties must not be null");
    }

    public StatusController.StatusResponse getStatus() {
        return getStatus((Supplier<TtcDashboardReadModel>) null);
    }

    public StatusController.StatusResponse getStatus(Supplier<TtcDashboardReadModel> readModelSupplier) {
        Optional<IngestionRunSnapshot> latestRun = ingestionRunStore.findLatestSuccessful();
        Duration ttl = ingestionFreshness.remainingFreshness(latestRun)
            .map(remaining -> remaining.compareTo(cacheProperties.getStatusTtl()) < 0 ? remaining : cacheProperties.getStatusTtl())
            .orElse(cacheProperties.getStatusTtl());
        return cache.getOrCompute(
            "status",
            new TypeReference<StatusController.StatusResponse>() {},
            ttl,
            () -> buildStatus(readModelSupplier != null ? readModelSupplier.get() : null)
        );
    }

    public StatusController.StatusResponse buildStatus() {
        return buildStatus(null);
    }

    public StatusController.StatusResponse buildStatus(TtcDashboardReadModel readModel) {
        Optional<IngestionRunSnapshot> latestRun = readModel != null && readModel.latestSuccessfulRun().isPresent()
            ? readModel.latestSuccessfulRun()
            : ingestionRunStore.findLatestSuccessful();
        boolean dashboardLive = readModel != null
            ? readModel.dashboardLive()
            : ingestionFreshness.isFresh(latestRun);
        List<AlertEntity> activeAlerts = dashboardLive
            ? (readModel != null ? readModel.activeAlertEntities() : alertRepository.findByActiveTrueAndType(AlertDashboardService.ACTIVE_ALERT_TYPE))
            : List.of();
        List<AlertDashboardService.PlannedClosureDto> activeClosures = dashboardLive
            ? (readModel != null ? readModel.activePlannedClosures() : alertDashboardService.activePlannedClosures())
            : List.of();

        OffsetDateTime now = readModel != null ? readModel.now() : OffsetDateTime.now(clock);

        List<StatusController.LineStatusDto> lines = transitLineRepository.findAllByOrderBySortOrderAsc().stream()
                .map(entity -> toDto(entity, activeAlerts, activeClosures, now))
                .collect(Collectors.toList());

        return new StatusController.StatusResponse(
                new StatusController.GeneratedAtDto(
                    now.atZoneSameInstant(TORONTO_ZONE).format(DateTimeFormatter.ofPattern("h:mm a")),
                    now.atZoneSameInstant(TORONTO_ZONE).format(DateTimeFormatter.ofPattern("MMM d, yyyy")),
                    dashboardLive,
                    latestRun.map(run -> lastPollLabel(run, now)).orElse("not run")
                ),
                lines
        );
    }

    private StatusController.LineStatusDto toDto(
        TransitLineEntity entity,
        List<AlertEntity> allActiveAlerts,
        List<AlertDashboardService.PlannedClosureDto> allActiveClosures
    ) {
        return toDto(entity, allActiveAlerts, allActiveClosures, OffsetDateTime.now(clock));
    }

    private StatusController.LineStatusDto toDto(
        TransitLineEntity entity,
        List<AlertEntity> allActiveAlerts,
        List<AlertDashboardService.PlannedClosureDto> allActiveClosures,
        OffsetDateTime now
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
            updatedAgo = updatedAgo(mostRecent.getSourceUpdatedAt(), now);
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
            updatedAgo = updatedAgo(mostRecentClosure.updatedAt(), now);
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
            updatedAgo = updatedAgo(mostRecent.getSourceUpdatedAt(), now);
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
            updatedAgo = updatedAgo(mostRecent.getSourceUpdatedAt(), now);
        }

        return new StatusController.LineStatusDto(
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
        return lastPollLabel(run, OffsetDateTime.now(clock));
    }

    private String lastPollLabel(IngestionRunSnapshot run, OffsetDateTime now) {
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
        return "succeeded " + relativeAge(completedAt, now);
    }

    private String updatedAgo(OffsetDateTime updatedAt) {
        return updatedAgo(updatedAt, OffsetDateTime.now(clock));
    }

    private String updatedAgo(OffsetDateTime updatedAt, OffsetDateTime now) {
        if (updatedAt == null) {
            return "Updated recently";
        }
        return "Updated " + relativeAge(updatedAt, now);
    }

    private String relativeAge(OffsetDateTime timestamp) {
        return relativeAge(timestamp, OffsetDateTime.now(clock));
    }

    private String relativeAge(OffsetDateTime timestamp, OffsetDateTime now) {
        long minutes = Math.max(0, Duration.between(timestamp, now).toMinutes());
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
}
