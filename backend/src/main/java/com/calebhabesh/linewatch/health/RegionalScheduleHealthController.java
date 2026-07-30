package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.regional.RegionalGtfsScheduleRepository;
import com.calebhabesh.linewatch.regional.RegionalArrivalProperties;
import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health/regional-schedule")
public class RegionalScheduleHealthController {
    private static final ZoneId TORONTO = ZoneId.of("America/Toronto");
    private final RegionalGtfsScheduleRepository repository;
    private final RegionalArrivalProperties properties;
    private final Clock clock;

    public RegionalScheduleHealthController(
        RegionalGtfsScheduleRepository repository,
        RegionalArrivalProperties properties,
        Clock clock
    ) {
        this.repository = repository;
        this.properties = properties;
        this.clock = clock;
    }

    @GetMapping
    public Response health() {
        LocalDate today = LocalDate.now(clock.withZone(TORONTO));
        LocalDate requiredThrough = today.plusDays(Math.max(0, properties.getScheduleLookaheadDays()));
        List<RegionalGtfsScheduleRepository.Coverage> coverage = repository.activeCoverage();
        Set<String> covered = new HashSet<>();
        coverage.forEach(row -> covered.add(row.lineId() + ":" + row.stationId()));
        List<String> missing = new ArrayList<>();
        for (RegionalNetworkCatalog.Route route : RegionalNetworkCatalog.routes()) {
            for (String stationId : route.stationIds()) {
                String key = route.id() + ":" + stationId;
                if (!covered.contains(key)) missing.add(key);
            }
        }
        List<Source> sources = List.of("go", "up").stream().map(source ->
            repository.activeImport(source)
                .map(active -> new Source(
                    source, active.id(), active.importedAt(), active.serviceStart(), active.serviceEnd(),
                    active.serviceStart() != null && active.serviceEnd() != null
                        && !active.serviceStart().isAfter(today) && !active.serviceEnd().isBefore(today),
                    active.serviceEnd() != null && !active.serviceEnd().isBefore(requiredThrough)
                ))
                .orElseGet(() -> new Source(source, null, null, null, null, false, false))
        ).toList();
        boolean active = sources.stream().allMatch(Source::active) && missing.isEmpty();
        boolean lookaheadCovered = sources.stream().allMatch(Source::coversLookahead);
        return new Response(
            active ? "active" : sources.stream().noneMatch(source -> source.importId() != null)
                ? "not-imported" : "incomplete",
            active,
            lookaheadCovered,
            requiredThrough,
            coverage.size(),
            missing,
            sources,
            active && lookaheadCovered ? "GO/UP static schedules cover every mapped station-corridor pair through the configured lookahead."
                : active ? "Regional schedules cover current service, but at least one source ends before requiredThrough."
                : "Regional static schedule coverage is incomplete; see missingStationLines and sources."
        );
    }

    public record Response(
        String status,
        boolean scheduleActive,
        boolean lookaheadCovered,
        LocalDate requiredThrough,
        int mappedStationLines,
        List<String> missingStationLines,
        List<Source> sources,
        String message
    ) {}
    public record Source(
        String sourceSystem,
        Long importId,
        java.time.OffsetDateTime importedAt,
        LocalDate serviceStart,
        LocalDate serviceEnd,
        boolean active,
        boolean coversLookahead
    ) {}
}
