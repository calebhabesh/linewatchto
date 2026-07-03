package com.calebhabesh.linewatch.arrival.live;

import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class GtfsRtSubwayArrivalIndexer {
    private final GtfsScheduleReadRepository repository;
    private final LineSegmentRepository lineSegmentRepository;

    public GtfsRtSubwayArrivalIndexer(
        GtfsScheduleReadRepository repository,
        LineSegmentRepository lineSegmentRepository
    ) {
        this.repository = repository;
        this.lineSegmentRepository = lineSegmentRepository;
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

        Map<StationStepKey, String> segmentDirections = segmentDirections();
        List<GtfsRtSubwayStationArrival> arrivals = new ArrayList<>();
        for (GtfsRtSubwayTripUpdate trip : feed.trips()) {
            Map<String, GtfsScheduleReadRepository.StationMapping> mappings = mappingsByLine.getOrDefault(
                trip.lineId(),
                Map.of()
            );
            List<PendingArrival> tripArrivals = new ArrayList<>();
            for (GtfsRtSubwayStopTimeUpdate stopUpdate : trip.stopUpdates()) {
                GtfsScheduleReadRepository.StationMapping mapping = mappings.get(stopUpdate.stopId());
                if (mapping == null) {
                    continue;
                }
                tripArrivals.add(new PendingArrival(
                    mapping,
                    stopUpdate
                ));
            }

            for (int index = 0; index < tripArrivals.size(); index++) {
                PendingArrival arrival = tripArrivals.get(index);
                GtfsScheduleReadRepository.StationMapping mapping = arrival.mapping();
                GtfsRtSubwayStopTimeUpdate stopUpdate = arrival.stopUpdate();
                arrivals.add(new GtfsRtSubwayStationArrival(
                    mapping.stationId(),
                    trip.lineId(),
                    platformDirection(trip, tripArrivals, index, segmentDirections),
                    stopUpdate.predictedAt(),
                    stopUpdate.departureAt(),
                    trip.vehicleId(),
                    trip.tripId(),
                    stopUpdate.stopId(),
                    stopUpdate.stopSequence(),
                    mapping.sortOrder()
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

    private Map<StationStepKey, String> segmentDirections() {
        Map<StationStepKey, String> directions = new LinkedHashMap<>();
        for (LineSegmentEntity segment : emptyWhenNull(lineSegmentRepository.findAllByOrderBySortOrderAsc())) {
            String forwardDirection = titleDirection(segment.getForwardDirection());
            if (forwardDirection.isBlank()) {
                continue;
            }
            directions.put(
                new StationStepKey(segment.getLineId(), segment.getStationAId(), segment.getStationBId()),
                forwardDirection
            );
            directions.put(
                new StationStepKey(segment.getLineId(), segment.getStationBId(), segment.getStationAId()),
                opposite(forwardDirection)
            );
        }
        return directions;
    }

    private String platformDirection(
        GtfsRtSubwayTripUpdate trip,
        List<PendingArrival> tripArrivals,
        int index,
        Map<StationStepKey, String> segmentDirections
    ) {
        PendingArrival current = tripArrivals.get(index);
        if ("line-1".equals(trip.lineId()) && "union".equals(current.mapping().stationId())) {
            return trip.direction();
        }

        for (int nextIndex = index + 1; nextIndex < tripArrivals.size(); nextIndex++) {
            PendingArrival next = tripArrivals.get(nextIndex);
            if (next.mapping().stationId().equals(current.mapping().stationId())) {
                continue;
            }
            String direction = segmentDirections.get(new StationStepKey(
                trip.lineId(),
                current.mapping().stationId(),
                next.mapping().stationId()
            ));
            if (direction != null) {
                return direction;
            }
            break;
        }

        for (int previousIndex = index - 1; previousIndex >= 0; previousIndex--) {
            PendingArrival previous = tripArrivals.get(previousIndex);
            if (previous.mapping().stationId().equals(current.mapping().stationId())) {
                continue;
            }
            String direction = segmentDirections.get(new StationStepKey(
                trip.lineId(),
                previous.mapping().stationId(),
                current.mapping().stationId()
            ));
            if (direction != null) {
                return direction;
            }
            break;
        }

        return trip.direction();
    }

    private List<LineSegmentEntity> emptyWhenNull(List<LineSegmentEntity> segments) {
        return segments == null ? List.of() : segments;
    }

    private String titleDirection(String direction) {
        String normalized = normalize(direction);
        return switch (normalized) {
            case "northbound" -> "Northbound";
            case "southbound" -> "Southbound";
            case "eastbound" -> "Eastbound";
            case "westbound" -> "Westbound";
            default -> "";
        };
    }

    private String opposite(String direction) {
        return switch (direction) {
            case "Northbound" -> "Southbound";
            case "Southbound" -> "Northbound";
            case "Eastbound" -> "Westbound";
            case "Westbound" -> "Eastbound";
            default -> "";
        };
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private record PendingArrival(
        GtfsScheduleReadRepository.StationMapping mapping,
        GtfsRtSubwayStopTimeUpdate stopUpdate
    ) {}

    private record StationStepKey(String lineId, String fromStationId, String toStationId) {}
}
