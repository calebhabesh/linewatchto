package com.calebhabesh.linewatch.arrival.schedule;

import com.calebhabesh.linewatch.arrival.ArrivalPrediction;
import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.arrival.ArrivalProvider;
import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class ScheduledArrivalProvider implements ArrivalProvider {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private final GtfsScheduleReadRepository repository;
    private final ArrivalProperties properties;
    private final Clock clock;

    public ScheduledArrivalProvider(
        GtfsScheduleReadRepository repository,
        ArrivalProperties properties,
        Clock clock
    ) {
        this.repository = repository;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public List<ArrivalPrediction> arrivalsFor(String stationId, List<StationResponses.StationLineResponse> lines) {
        Optional<Long> activeImportIdOpt = repository.findActiveImportId();
        if (activeImportIdOpt.isEmpty()) {
            return lines.stream()
                .map(line -> ArrivalPrediction.unavailable(line.id(), "Scheduled service"))
                .collect(Collectors.toList());
        }

        long importId = activeImportIdOpt.get();
        ZonedDateTime nowToronto = ZonedDateTime.now(clock).withZoneSameInstant(TORONTO_ZONE);
        LocalDate today = nowToronto.toLocalDate();
        LocalDate yesterday = today.minusDays(1);
        int nowSeconds = nowToronto.toLocalTime().toSecondOfDay();
        long horizonSeconds = properties.getScheduleHorizon().toSeconds();
        List<String> lineIds = lines.stream().map(StationResponses.StationLineResponse::id).collect(Collectors.toList());

        List<String> activeServiceIdsToday = repository.findActiveServiceIds(importId, today);
        List<String> activeServiceIdsYesterday = repository.findActiveServiceIds(importId, yesterday);
        if (activeServiceIdsToday.isEmpty() && activeServiceIdsYesterday.isEmpty()) {
            return lines.stream()
                .map(line -> ArrivalPrediction.unavailable(line.id(), "Scheduled service"))
                .collect(Collectors.toList());
        }

        List<GtfsScheduleReadRepository.ScheduledDeparture> depsToday = repository.findUpcomingDepartures(
            importId,
            stationId,
            lineIds,
            activeServiceIdsToday,
            nowSeconds,
            nowSeconds + (int) horizonSeconds,
            properties.getMaxArrivalsPerLine()
        );
        List<GtfsScheduleReadRepository.ScheduledDeparture> resolvedToday = depsToday.stream()
            .map(d -> d.withServiceDate(today))
            .collect(Collectors.toList());

        List<GtfsScheduleReadRepository.ScheduledDeparture> depsYesterday = repository.findUpcomingDepartures(
            importId,
            stationId,
            lineIds,
            activeServiceIdsYesterday,
            nowSeconds + 86400,
            nowSeconds + 86400 + (int) horizonSeconds,
            properties.getMaxArrivalsPerLine()
        );
        List<GtfsScheduleReadRepository.ScheduledDeparture> resolvedYesterday = depsYesterday.stream()
            .map(d -> d.withServiceDate(yesterday))
            .collect(Collectors.toList());

        List<GtfsScheduleReadRepository.ScheduledDeparture> allDeps = new ArrayList<>();
        allDeps.addAll(resolvedToday);
        allDeps.addAll(resolvedYesterday);

        OffsetDateTime cutoff = nowToronto.minusSeconds(30).toOffsetDateTime();
        OffsetDateTime nowOdt = nowToronto.toOffsetDateTime();

        List<ArrivalPrediction> predictions = new ArrayList<>();
        for (GtfsScheduleReadRepository.ScheduledDeparture dep : allDeps) {
            ZonedDateTime depZdt = dep.serviceDate().atStartOfDay(TORONTO_ZONE).plusSeconds(dep.departureSeconds());
            OffsetDateTime depOdt = depZdt.toOffsetDateTime();
            if (depOdt.isBefore(cutoff)) {
                continue;
            }
            long diffSeconds = Duration.between(nowOdt, depOdt).toSeconds();
            int minutes = (int) Math.max(0, Math.round(diffSeconds / 60.0));
            predictions.add(ArrivalPrediction.scheduled(
                dep.lineId(),
                dep.direction(),
                minutes,
                depOdt,
                properties.getScheduledSourceName()
            ));
        }

        Map<ArrivalDirectionKey, List<ArrivalPrediction>> grouped = predictions.stream()
            .collect(Collectors.groupingBy(prediction -> new ArrivalDirectionKey(
                prediction.lineId(),
                prediction.direction()
            )));

        List<ArrivalPrediction> result = new ArrayList<>();
        for (StationResponses.StationLineResponse line : lines) {
            List<ArrivalPrediction> linePreds = grouped.entrySet().stream()
                .filter(entry -> entry.getKey().lineId().equals(line.id()))
                .flatMap(entry -> entry.getValue().stream()
                    .sorted(Comparator.comparing(ArrivalPrediction::predictedAt))
                    .limit(properties.getMaxArrivalsPerLine()))
                .collect(Collectors.toList());

            if (linePreds.isEmpty()) {
                result.add(ArrivalPrediction.scheduled(
                    line.id(),
                    "Scheduled service",
                    null,
                    null,
                    properties.getScheduledSourceName()
                ));
            } else {
                result.addAll(linePreds);
            }
        }

        result.sort(Comparator.comparing(ArrivalPrediction::lineId)
            .thenComparing(ArrivalPrediction::predictedAt, Comparator.nullsLast(Comparator.naturalOrder())));

        return result;
    }

    private record ArrivalDirectionKey(String lineId, String direction) {
    }
}
