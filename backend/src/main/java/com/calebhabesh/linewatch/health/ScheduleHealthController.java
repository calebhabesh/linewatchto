package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health/schedule")
public class ScheduleHealthController {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private final GtfsScheduleReadRepository repository;
    private final ArrivalProperties properties;
    private final Clock clock;

    public ScheduleHealthController(
        GtfsScheduleReadRepository repository,
        ArrivalProperties properties,
        Clock clock
    ) {
        this.repository = repository;
        this.properties = properties;
        this.clock = clock;
    }

    @GetMapping
    public ScheduleHealthResponse schedule() {
        return repository.findActiveImport()
            .map(this::toResponse)
            .orElseGet(() -> new ScheduleHealthResponse(
                "not-imported",
                false,
                null,
                null,
                null,
                null,
                null,
                "No TTC GTFS schedule import is active."
            ));
    }

    private ScheduleHealthResponse toResponse(GtfsScheduleReadRepository.ActiveScheduleImport activeImport) {
        LocalDate serviceEnd = activeImport.serviceEnd();
        Long daysRemaining = serviceEnd == null
            ? null
            : ChronoUnit.DAYS.between(LocalDate.now(clock.withZone(TORONTO_ZONE)), serviceEnd);
        String status = status(daysRemaining);
        return new ScheduleHealthResponse(
            status,
            "active".equals(status) || "expiring".equals(status),
            activeImport.id(),
            activeImport.importedAt(),
            activeImport.serviceStart(),
            serviceEnd,
            daysRemaining,
            message(status, daysRemaining)
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
        String message
    ) {}
}
