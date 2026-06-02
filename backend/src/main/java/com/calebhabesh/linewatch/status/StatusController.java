package com.calebhabesh.linewatch.status;

import com.calebhabesh.linewatch.alert.AlertEntity;
import com.calebhabesh.linewatch.alert.AlertRepository;
import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.station.TransitLineRepository;
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
    private final Clock clock;

    public StatusController(
        TransitLineRepository transitLineRepository,
        AlertRepository alertRepository,
        IngestionRunStore ingestionRunStore,
        IngestionFreshness ingestionFreshness,
        Clock clock
    ) {
        this.transitLineRepository = transitLineRepository;
        this.alertRepository = alertRepository;
        this.ingestionRunStore = ingestionRunStore;
        this.ingestionFreshness = ingestionFreshness;
        this.clock = clock;
    }

    @GetMapping
    public StatusResponse getStatus() {
        Optional<IngestionRunSnapshot> latestRun = ingestionRunStore.findLatest();
        boolean dashboardLive = ingestionFreshness.isFresh(latestRun);
        List<AlertEntity> activeAlerts = dashboardLive
            ? alertRepository.findByActiveTrueAndType(AlertDashboardService.ACTIVE_ALERT_TYPE)
            : List.of();

        List<LineStatusDto> lines = transitLineRepository.findAllByOrderBySortOrderAsc().stream()
                .map(entity -> toDto(entity, activeAlerts))
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

    private LineStatusDto toDto(TransitLineEntity entity, List<AlertEntity> allActiveAlerts) {
        String route = getRouteForLine(entity.getId());

        // Filter alerts for this specific line
        List<AlertEntity> lineAlerts = allActiveAlerts.stream()
            .filter(a -> a.getLine() != null && a.getLine().getId().equals(entity.getId()))
            .toList();

        String status = "normal";
        String statusLabel = "Normal";
        String summary = "No active service impacts reported.";
        String updatedAgo = "Updated recently";

        if (!lineAlerts.isEmpty()) {
            boolean hasSuspension = lineAlerts.stream()
                .anyMatch(a -> "suspension".equalsIgnoreCase(a.getSeverity()));
            boolean hasDelay = lineAlerts.stream()
                .anyMatch(a -> "delay".equalsIgnoreCase(a.getSeverity()));

            if (hasSuspension) {
                status = "suspension";
                statusLabel = "Suspended";
            } else if (hasDelay) {
                status = "delay";
                statusLabel = "Delayed";
            } else {
                status = "delay";
                statusLabel = "Degraded";
            }

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
        } else if (entity.getId().equals("line-5") || entity.getId().equals("line-6")) {
            status = "ready";
            statusLabel = "Ready";
            summary = entity.getId().equals("line-5") ? "Layout is integrated for launch and planned service notices." : "Finch West LRT geometry is included for future service notices.";
            updatedAgo = "Reference layout";
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
