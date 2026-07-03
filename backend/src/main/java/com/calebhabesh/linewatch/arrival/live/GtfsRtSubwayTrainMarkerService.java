package com.calebhabesh.linewatch.arrival.live;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.commute.CommuteTravelTimeRepository;
import com.calebhabesh.linewatch.commute.CommuteTravelTimeRepository.SegmentTravelTime;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class GtfsRtSubwayTrainMarkerService {
    private static final int DEFAULT_SEGMENT_SECONDS = 120;
    private static final double MIN_PROGRESS = 0.08;
    private static final double MAX_PROGRESS = 0.92;
    private static final Duration PAST_TOLERANCE = Duration.ofSeconds(30);
    private static final String DISCLAIMER =
        "Estimated train markers are schematic placements inferred from TTC GTFS-RT trip updates and LineWatchTO topology. They are not physical train positions.";

    private final GtfsRtSubwayArrivalCache cache;
    private final LineSegmentRepository lineSegmentRepository;
    private final CommuteTravelTimeRepository travelTimeRepository;
    private final ArrivalProperties properties;
    private final Clock clock;
    private volatile WeightSnapshot weightSnapshot = new WeightSnapshot("", Map.of());

    public GtfsRtSubwayTrainMarkerService(
        GtfsRtSubwayArrivalCache cache,
        LineSegmentRepository lineSegmentRepository,
        CommuteTravelTimeRepository travelTimeRepository,
        ArrivalProperties properties,
        Clock clock
    ) {
        this.cache = cache;
        this.lineSegmentRepository = lineSegmentRepository;
        this.travelTimeRepository = travelTimeRepository;
        this.properties = properties;
        this.clock = clock;
    }

    public EstimatedTrainMarkerSnapshot estimatedMarkers() {
        OffsetDateTime generatedAt = OffsetDateTime.now(clock);
        String source = properties.getLiveSourceName();

        if (properties.getProvider() != ArrivalProperties.ProviderMode.LIVE) {
            return EstimatedTrainMarkerSnapshot.unavailable(
                source,
                "Live GTFS-RT train markers are disabled.",
                DISCLAIMER,
                generatedAt
            );
        }

        Optional<GtfsRtSubwayArrivalSnapshot> freshSnapshot = cache.freshSnapshot();
        if (freshSnapshot.isEmpty()) {
            return EstimatedTrainMarkerSnapshot.unavailable(
                source,
                "No fresh TTC GTFS-RT subway trip update snapshot is available.",
                DISCLAIMER,
                generatedAt
            );
        }

        GtfsRtSubwayArrivalSnapshot snapshot = freshSnapshot.get();
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        Map<String, SegmentTravelTime> segmentWeights = segmentWeights();

        List<EstimatedTrainMarker> markers = groupedArrivals(snapshot.arrivals())
            .values()
            .stream()
            .map(rows -> markerForTrain(rows, snapshot, segments, segmentWeights, generatedAt))
            .flatMap(Optional::stream)
            .sorted(Comparator
                .comparing(EstimatedTrainMarker::lineId)
                .thenComparing(EstimatedTrainMarker::direction)
                .thenComparing(EstimatedTrainMarker::segmentId)
                .thenComparing(EstimatedTrainMarker::id))
            .toList();

        return new EstimatedTrainMarkerSnapshot(
            true,
            source,
            markers.isEmpty()
                ? "Fresh TTC GTFS-RT subway trip updates are available, but no markers could be placed on the schematic map."
                : "Fresh TTC GTFS-RT subway trip updates are available.",
            DISCLAIMER,
            snapshot.feedCreatedAt(),
            generatedAt,
            markers
        );
    }

    private Map<String, List<GtfsRtSubwayStationArrival>> groupedArrivals(List<GtfsRtSubwayStationArrival> arrivals) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        OffsetDateTime cutoff = now.minus(PAST_TOLERANCE);
        OffsetDateTime horizon = now.plus(properties.getScheduleHorizon());

        return arrivals.stream()
            .filter(arrival -> arrival.predictedAt() != null)
            .filter(arrival -> !arrival.visibleUntil().isBefore(cutoff))
            .filter(arrival -> !arrival.predictedAt().isAfter(horizon))
            .sorted(Comparator
                .comparing(GtfsRtSubwayStationArrival::predictedAt)
                .thenComparingInt(GtfsRtSubwayStationArrival::stopSequence)
                .thenComparing(GtfsRtSubwayStationArrival::stationId))
            .collect(Collectors.groupingBy(
                this::trainKey,
                LinkedHashMap::new,
                Collectors.toList()
            ));
    }

    private Optional<EstimatedTrainMarker> markerForTrain(
        List<GtfsRtSubwayStationArrival> rows,
        GtfsRtSubwayArrivalSnapshot snapshot,
        List<LineSegmentEntity> segments,
        Map<String, SegmentTravelTime> segmentWeights,
        OffsetDateTime generatedAt
    ) {
        if (rows.isEmpty()) {
            return Optional.empty();
        }

        GtfsRtSubwayStationArrival next = rows.getFirst();
        Optional<SegmentCandidate> segment = segmentEndingAt(
            next.lineId(),
            next.direction(),
            next.stationId(),
            followingStationId(rows),
            segments
        );
        if (segment.isEmpty()) {
            return Optional.empty();
        }

        int travelSeconds = travelSeconds(segment.get().segment(), segmentWeights);
        long secondsToNext = Math.max(0, Duration.between(generatedAt, next.predictedAt()).toSeconds());
        double rawProgress = (travelSeconds - secondsToNext) / (double) travelSeconds;
        double progress = clamp(rawProgress, MIN_PROGRESS, MAX_PROGRESS);

        return Optional.of(new EstimatedTrainMarker(
            markerId(next),
            next.lineId(),
            next.direction(),
            segment.get().travelDirection(),
            segment.get().segment().getId(),
            segment.get().fromStationId(),
            segment.get().toStationId(),
            next.stationId(),
            progress,
            travelSeconds,
            next.predictedAt(),
            next.vehicleId(),
            next.tripId(),
            snapshot.feedCreatedAt(),
            generatedAt
        ));
    }

    private Optional<SegmentCandidate> segmentEndingAt(
        String lineId,
        String direction,
        String nextStationId,
        Optional<String> followingStationId,
        List<LineSegmentEntity> segments
    ) {
        String directionWire = wireDirection(direction);

        List<SegmentCandidate> candidates = new ArrayList<>();
        for (LineSegmentEntity segment : segments) {
            if (!lineId.equals(segment.getLineId())) {
                continue;
            }
            String forward = normalize(segment.getForwardDirection());
            if (nextStationId.equals(segment.getStationBId())) {
                candidates.add(new SegmentCandidate(segment, "forward", segment.getStationAId(), segment.getStationBId()));
            } else if (nextStationId.equals(segment.getStationAId())) {
                candidates.add(new SegmentCandidate(segment, "reverse", segment.getStationBId(), segment.getStationAId()));
            }
        }

        if (followingStationId.isPresent()) {
            List<SegmentCandidate> withoutBacktracking = candidates.stream()
                .filter(candidate -> !candidate.fromStationId().equals(followingStationId.get()))
                .toList();
            if (withoutBacktracking.size() == 1) {
                return Optional.of(withoutBacktracking.getFirst());
            }
        }

        if (!directionWire.isBlank()) {
            List<SegmentCandidate> directionMatches = candidates.stream()
                .filter(candidate -> directionWire.equals(candidateDirection(candidate)))
                .toList();
            if (directionMatches.size() == 1) {
                return Optional.of(directionMatches.getFirst());
            }
        }

        return candidates.size() == 1 ? Optional.of(candidates.getFirst()) : Optional.empty();
    }

    private Optional<String> followingStationId(List<GtfsRtSubwayStationArrival> rows) {
        String nextStationId = rows.getFirst().stationId();
        return rows.stream()
            .skip(1)
            .map(GtfsRtSubwayStationArrival::stationId)
            .filter(stationId -> !stationId.equals(nextStationId))
            .findFirst();
    }

    private String candidateDirection(SegmentCandidate candidate) {
        String forward = normalize(candidate.segment().getForwardDirection());
        return "forward".equals(candidate.travelDirection()) ? forward : opposite(forward);
    }

    private Map<String, SegmentTravelTime> segmentWeights() {
        String signature = normalizeIdentity(travelTimeRepository.activeScheduleSignature());
        WeightSnapshot current = weightSnapshot;
        if (current.signature().equals(signature)) {
            return current.weights();
        }

        synchronized (this) {
            current = weightSnapshot;
            if (current.signature().equals(signature)) {
                return current.weights();
            }

            Map<String, SegmentTravelTime> combined = new LinkedHashMap<>(emptyWhenNull(travelTimeRepository.findSeededFallbackSegmentWeights()));
            combined.putAll(emptyWhenNull(travelTimeRepository.findActiveScheduledSegmentWeights()));
            WeightSnapshot next = new WeightSnapshot(signature, Map.copyOf(combined));
            weightSnapshot = next;
            return next.weights();
        }
    }

    private int travelSeconds(LineSegmentEntity segment, Map<String, SegmentTravelTime> segmentWeights) {
        SegmentTravelTime weight = segmentWeights.get(segment.getId());
        if (weight != null && weight.travelSeconds() > 0) {
            return weight.travelSeconds();
        }
        return DEFAULT_SEGMENT_SECONDS;
    }

    private Map<String, SegmentTravelTime> emptyWhenNull(Map<String, SegmentTravelTime> weights) {
        return weights == null ? Map.of() : weights;
    }

    private String trainKey(GtfsRtSubwayStationArrival arrival) {
        return arrival.lineId() + "|" + normalize(arrival.direction()) + "|" + trainIdentity(arrival);
    }

    private String markerId(GtfsRtSubwayStationArrival arrival) {
        return arrival.lineId() + ":" + trainIdentity(arrival) + ":" + arrival.stationId();
    }

    private String trainIdentity(GtfsRtSubwayStationArrival arrival) {
        String tripId = normalizeIdentity(arrival.tripId());
        String vehicleId = normalizeIdentity(arrival.vehicleId());
        if (!tripId.isBlank() && !vehicleId.isBlank()) {
            return tripId + ":" + vehicleId;
        }
        if (!tripId.isBlank()) {
            return tripId;
        }
        if (!vehicleId.isBlank()) {
            return vehicleId;
        }
        return normalizeIdentity(arrival.stopId()) + ":" + arrival.stopSequence();
    }

    private String normalizeIdentity(String value) {
        return value == null ? "" : value.trim();
    }

    private String wireDirection(String direction) {
        String normalized = normalize(direction);
        if (normalized.startsWith("northbound")) return "northbound";
        if (normalized.startsWith("southbound")) return "southbound";
        if (normalized.startsWith("eastbound")) return "eastbound";
        if (normalized.startsWith("westbound")) return "westbound";
        return "";
    }

    private String opposite(String directionWire) {
        return switch (directionWire) {
            case "northbound" -> "southbound";
            case "southbound" -> "northbound";
            case "eastbound" -> "westbound";
            case "westbound" -> "eastbound";
            default -> "";
        };
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private record SegmentCandidate(
        LineSegmentEntity segment,
        String travelDirection,
        String fromStationId,
        String toStationId
    ) {}

    private record WeightSnapshot(
        String signature,
        Map<String, SegmentTravelTime> weights
    ) {}
}
