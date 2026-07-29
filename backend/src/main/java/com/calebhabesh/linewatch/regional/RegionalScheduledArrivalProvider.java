package com.calebhabesh.linewatch.regional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class RegionalScheduledArrivalProvider {
    static final String SOURCE = "Metrolinx published schedule";
    private static final ZoneId TORONTO = ZoneId.of("America/Toronto");

    private final RegionalGtfsScheduleRepository repository;
    private final RegionalArrivalProperties properties;
    private final Clock clock;

    public RegionalScheduledArrivalProvider(
        RegionalGtfsScheduleRepository repository,
        RegionalArrivalProperties properties,
        Clock clock
    ) {
        this.repository = repository;
        this.properties = properties;
        this.clock = clock;
    }

    public List<RegionalArrivalRecord> arrivals(String stationId, List<String> lineIds) {
        if (!properties.isScheduleEnabled()) return List.of();
        ZonedDateTime now = ZonedDateTime.now(clock).withZoneSameInstant(TORONTO);
        List<RegionalArrivalRecord> result = new ArrayList<>();
        for (int dayOffset = -1; dayOffset <= Math.max(0, properties.getScheduleLookaheadDays()); dayOffset++) {
            LocalDate serviceDate = now.toLocalDate().plusDays(dayOffset);
            int minimum = dayOffset == -1 ? now.toLocalTime().toSecondOfDay() + 86_400
                : dayOffset == 0 ? now.toLocalTime().toSecondOfDay() : 0;
            int maximum = dayOffset == -1 ? minimum + 7_200 : 172_799;
            for (RegionalGtfsScheduleRepository.ScheduledDeparture departure :
                repository.upcoming(stationId, lineIds, serviceDate, minimum, maximum)) {
                OffsetDateTime at = serviceDate.atStartOfDay(TORONTO)
                    .plusSeconds(departure.departureSeconds()).toOffsetDateTime();
                if (at.isBefore(now.minusSeconds(30).toOffsetDateTime())) continue;
                result.add(new RegionalArrivalRecord(
                    departure.lineId(), departure.direction(), at, at, departure.platform(),
                    departure.tripId(), SOURCE, "scheduled"
                ));
            }
            if (enoughPerLine(result, lineIds)) break;
        }
        return result.stream()
            .sorted(Comparator.comparing(RegionalArrivalRecord::predictedAt))
            .toList();
    }

    public boolean hasActiveSchedule(List<String> lineIds) {
        LocalDate today = LocalDate.now(clock.withZone(TORONTO));
        return lineIds.stream().map(lineId -> "regional-up".equals(lineId) ? "up" : "go").distinct()
            .allMatch(source -> repository.activeImport(source)
                .filter(active -> active.serviceStart() != null && active.serviceEnd() != null)
                .filter(active -> !active.serviceStart().isAfter(today) && !active.serviceEnd().isBefore(today))
                .isPresent());
    }

    public Optional<OffsetDateTime> latestImportedAt(List<String> lineIds) {
        return lineIds.stream().map(lineId -> "regional-up".equals(lineId) ? "up" : "go").distinct()
            .map(repository::activeImport)
            .flatMap(Optional::stream)
            .map(RegionalGtfsScheduleRepository.ActiveImport::importedAt)
            .max(OffsetDateTime::compareTo);
    }

    private boolean enoughPerLine(List<RegionalArrivalRecord> arrivals, List<String> lineIds) {
        int maximum = Math.max(1, properties.getMaxArrivalsPerLine());
        return lineIds.stream().allMatch(lineId ->
            arrivals.stream().filter(arrival -> arrival.lineId().equals(lineId)).count() >= maximum
        );
    }
}
