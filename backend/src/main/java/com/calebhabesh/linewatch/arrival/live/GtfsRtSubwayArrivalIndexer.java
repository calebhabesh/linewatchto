package com.calebhabesh.linewatch.arrival.live;

import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class GtfsRtSubwayArrivalIndexer {
    private final GtfsScheduleReadRepository repository;

    public GtfsRtSubwayArrivalIndexer(GtfsScheduleReadRepository repository) {
        this.repository = repository;
    }

    public GtfsRtSubwayArrivalSnapshot index(GtfsRtSubwayTripUpdateFeed feed, OffsetDateTime indexedAt) {
        Optional<Long> importId = repository.findActiveImportId();
        if (importId.isEmpty()) {
            return new GtfsRtSubwayArrivalSnapshot(feed.feedCreatedAt(), indexedAt, List.of());
        }

        Map<String, List<GtfsRtSubwayTripUpdate>> tripsByLine = feed.trips()
            .stream()
            .collect(Collectors.groupingBy(
                GtfsRtSubwayTripUpdate::lineId,
                LinkedHashMap::new,
                Collectors.toList()
            ));

        Map<String, Map<String, GtfsScheduleReadRepository.StationMapping>> mappingsByLine = new LinkedHashMap<>();
        for (Map.Entry<String, List<GtfsRtSubwayTripUpdate>> entry : tripsByLine.entrySet()) {
            List<String> stopIds = distinctStopIds(entry.getValue());
            List<GtfsScheduleReadRepository.StationMapping> mappings =
                repository.findStationMappings(importId.get(), entry.getKey(), stopIds);
            Map<String, GtfsScheduleReadRepository.StationMapping> byStop = new LinkedHashMap<>();
            for (GtfsScheduleReadRepository.StationMapping mapping : mappings) {
                byStop.putIfAbsent(mapping.stopId(), mapping);
            }
            mappingsByLine.put(entry.getKey(), byStop);
        }

        List<GtfsRtSubwayStationArrival> arrivals = new ArrayList<>();
        for (GtfsRtSubwayTripUpdate trip : feed.trips()) {
            Map<String, GtfsScheduleReadRepository.StationMapping> mappings = mappingsByLine.getOrDefault(
                trip.lineId(),
                Map.of()
            );
            for (GtfsRtSubwayStopTimeUpdate stopUpdate : trip.stopUpdates()) {
                GtfsScheduleReadRepository.StationMapping mapping = mappings.get(stopUpdate.stopId());
                if (mapping == null) {
                    continue;
                }
                arrivals.add(new GtfsRtSubwayStationArrival(
                    mapping.stationId(),
                    trip.lineId(),
                    trip.direction(),
                    stopUpdate.predictedAt(),
                    trip.vehicleId(),
                    trip.tripId(),
                    stopUpdate.stopId()
                ));
            }
        }

        return new GtfsRtSubwayArrivalSnapshot(feed.feedCreatedAt(), indexedAt, arrivals);
    }

    private List<String> distinctStopIds(List<GtfsRtSubwayTripUpdate> trips) {
        Set<String> stopIds = new LinkedHashSet<>();
        for (GtfsRtSubwayTripUpdate trip : trips) {
            for (GtfsRtSubwayStopTimeUpdate update : trip.stopUpdates()) {
                stopIds.add(update.stopId());
            }
        }
        return List.copyOf(stopIds);
    }
}
