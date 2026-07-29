package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleRefreshRunService;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleRefreshRunSnapshot;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health/schedule")
public class ScheduleHealthController {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private final GtfsScheduleReadRepository repository;
    private final ArrivalProperties properties;
    private final GtfsScheduleRefreshRunService refreshRunService;
    private final Clock clock;

    public ScheduleHealthController(
        GtfsScheduleReadRepository repository,
        ArrivalProperties properties,
        GtfsScheduleRefreshRunService refreshRunService,
        Clock clock
    ) {
        this.repository = repository;
        this.properties = properties;
        this.refreshRunService = refreshRunService;
        this.clock = clock;
    }

    @GetMapping
    public ScheduleHealthResponse schedule() {
        Optional<GtfsScheduleRefreshRunSnapshot> latestRun = refreshRunService.latest();
        String refreshStatus = latestRun.map(GtfsScheduleRefreshRunSnapshot::status).orElse("never-run");
        OffsetDateTime refreshStartedAt = latestRun.map(GtfsScheduleRefreshRunSnapshot::startedAt).orElse(null);
        OffsetDateTime refreshCompletedAt = latestRun.map(GtfsScheduleRefreshRunSnapshot::completedAt).orElse(null);
        Integer refreshRecordsProcessed = latestRun.map(GtfsScheduleRefreshRunSnapshot::recordsProcessed).orElse(null);
        String refreshErrorMessage = latestRun.map(GtfsScheduleRefreshRunSnapshot::errorMessage).orElse(null);

        return repository.findActiveImport()
            .map(activeImport -> toResponse(
                activeImport,
                refreshStatus,
                refreshStartedAt,
                refreshCompletedAt,
                refreshRecordsProcessed,
                refreshErrorMessage
            ))
            .orElseGet(() -> {
                String message = "failed".equals(refreshStatus)
                    ? "No TTC GTFS schedule import is active; the latest refresh failed."
                    : "No TTC GTFS schedule import is active.";
                return new ScheduleHealthResponse(
                    "not-imported",
                    false,
                    null,
                    null,
                    null,
                    null,
                    null,
                    refreshStatus,
                    refreshStartedAt,
                    refreshCompletedAt,
                    refreshRecordsProcessed,
                    refreshErrorMessage,
                    0,
                    0,
                    java.util.List.of(),
                    message
                );
            });
    }

    private ScheduleHealthResponse toResponse(
        GtfsScheduleReadRepository.ActiveScheduleImport activeImport,
        String refreshStatus,
        OffsetDateTime refreshStartedAt,
        OffsetDateTime refreshCompletedAt,
        Integer refreshRecordsProcessed,
        String refreshErrorMessage
    ) {
        LocalDate serviceEnd = activeImport.serviceEnd();
        Long daysRemaining = serviceEnd == null
            ? null
            : ChronoUnit.DAYS.between(LocalDate.now(clock.withZone(TORONTO_ZONE)), serviceEnd);
        String status = status(daysRemaining);
        GtfsScheduleReadRepository.ScheduleCoverage coverage =
            repository.findStationLineCoverage(activeImport.id());
        if (coverage == null) {
            coverage = new GtfsScheduleReadRepository.ScheduleCoverage(0, java.util.List.of());
        }
        return new ScheduleHealthResponse(
            status,
            "active".equals(status) || "expiring".equals(status),
            activeImport.id(),
            activeImport.importedAt(),
            activeImport.serviceStart(),
            serviceEnd,
            daysRemaining,
            refreshStatus,
            refreshStartedAt,
            refreshCompletedAt,
            refreshRecordsProcessed,
            refreshErrorMessage,
            coverage.expectedStationLines(),
            coverage.mappedStationLines(),
            coverage.missingStationLines(),
            coverage.missingStationLines().isEmpty()
                ? message(status, daysRemaining)
                : message(status, daysRemaining) + " "
                    + coverage.missingStationLines().size() + " station-line mappings are missing."
        );
    }

    private String status(Long daysRemaining) {
        if (daysRemaining == null) {
            return "unknown-range";
        }
        if (daysRemaining < 0) {
            return "expired";
        }
        if (daysRemaining <= properties.getGtfsRefreshMinServiceDaysRemaining()) {
            return "expiring";
        }
        return "active";
    }

    private String message(String status, Long daysRemaining) {
        return switch (status) {
            case "active" -> "TTC GTFS schedule import is active.";
            case "expiring" -> "TTC GTFS schedule import expires soon; refresh is needed within " + daysRemaining + " days.";
            case "expired" -> "TTC GTFS schedule import has expired.";
            default -> "TTC GTFS schedule import is active but service date coverage is unavailable.";
        };
    }

    public record ScheduleHealthResponse(
        String status,
        boolean scheduleActive,
        Long importId,
        OffsetDateTime importedAt,
        LocalDate serviceStart,
        LocalDate serviceEnd,
        Long serviceDaysRemaining,
        String refreshStatus,
        OffsetDateTime refreshStartedAt,
        OffsetDateTime refreshCompletedAt,
        Integer refreshRecordsProcessed,
        String refreshErrorMessage,
        int expectedStationLines,
        int mappedStationLines,
        java.util.List<String> missingStationLines,
        String message
    ) {}
}
