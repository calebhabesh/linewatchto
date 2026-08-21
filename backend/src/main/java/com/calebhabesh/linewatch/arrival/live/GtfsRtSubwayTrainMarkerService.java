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
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class GtfsRtSubwayTrainMarkerService {
    private static final int DEFAULT_SEGMENT_SECONDS = 120;
    private static final double MIN_PROGRESS = 0.08;
    private static final double MAX_PROGRESS = 0.92;
    private static final Duration PAST_TOLERANCE = Duration.ofSeconds(30);
    private static final Duration MARKER_SNAPSHOT_TTL = Duration.ofSeconds(1);
    private static final String DISCLAIMER =
        "Estimated train markers are schematic placements inferred from TTC GTFS-RT trip updates and LineWatchTO topology. They are not physical train positions.";

    private final GtfsRtSubwayArrivalCache cache;
    private final LineSegmentRepository lineSegmentRepository;
    private final CommuteTravelTimeRepository travelTimeRepository;
    private final ArrivalProperties properties;
    private final Clock clock;
    private final SubwayOperatingWindow operatingWindow;
    private volatile WeightSnapshot weightSnapshot = new WeightSnapshot("", Map.of());
    private volatile MarkerSnapshotCache markerSnapshotCache = MarkerSnapshotCache.empty();
    private volatile Map<String, RetainedMarker> retainedMarkers = Map.of();

    public GtfsRtSubwayTrainMarkerService(
        GtfsRtSubwayArrivalCache cache,
        LineSegmentRepository lineSegmentRepository,
        CommuteTravelTimeRepository travelTimeRepository,
        ArrivalProperties properties,
        Clock clock,
        SubwayOperatingWindow operatingWindow
    ) {
        this.cache = cache;
        this.lineSegmentRepository = lineSegmentRepository;
        this.travelTimeRepository = travelTimeRepository;
        this.properties = properties;
        this.clock = clock;
        this.operatingWindow = operatingWindow;
    }

    public EstimatedTrainMarkerSnapshot estimatedMarkers() {
        OffsetDateTime generatedAt = OffsetDateTime.now(clock);
        String source = properties.getLiveSourceName();

        if (properties.getProvider() != ArrivalProperties.ProviderMode.LIVE) {
            clearRetainedMarkers();
            return EstimatedTrainMarkerSnapshot.unavailable(
                source,
                "Live GTFS-RT train markers are disabled.",
                DISCLAIMER,
                generatedAt
            );
        }

        if (!operatingWindow.isOpen()) {
            clearRetainedMarkers();
            return EstimatedTrainMarkerSnapshot.unavailable(
                source,
                "Subway service is outside scheduled operating hours; estimated train markers are hidden until service resumes.",
                DISCLAIMER,
                generatedAt
            );
        }

        Optional<GtfsRtSubwayArrivalSnapshot> freshSnapshot = cache.freshSnapshot();
        if (freshSnapshot.isEmpty()) {
            List<EstimatedTrainMarker> heldMarkers = retainedMarkers(generatedAt);
            if (heldMarkers.isEmpty()) {
                return EstimatedTrainMarkerSnapshot.unavailable(
                    source,
                    "No fresh TTC GTFS-RT subway trip update snapshot is available.",
                    DISCLAIMER,
                    generatedAt
                );
            }
            return new EstimatedTrainMarkerSnapshot(
                false,
                source,
                "The TTC GTFS-RT snapshot is temporarily unavailable; briefly holding the last estimated marker positions.",
                DISCLAIMER,
                heldMarkers.stream().map(EstimatedTrainMarker::feedCreatedAt)
                    .filter(Objects::nonNull).max(OffsetDateTime::compareTo).orElse(null),
                generatedAt,
                heldMarkers
            );
        }

        GtfsRtSubwayArrivalSnapshot snapshot = freshSnapshot.get();
        MarkerSnapshotCache cached = markerSnapshotCache;
        if (cached.matches(source, snapshot, generatedAt)) {
            return cached.snapshot();
        }

        synchronized (this) {
            cached = markerSnapshotCache;
            if (cached.matches(source, snapshot, generatedAt)) {
                return cached.snapshot();
            }

            EstimatedTrainMarkerSnapshot computed = computeMarkers(source, snapshot, generatedAt);
            markerSnapshotCache = MarkerSnapshotCache.from(source, snapshot, generatedAt, computed);
            return computed;
        }
    }

    public void warmSegmentWeights() {
        if (properties.getProvider() != ArrivalProperties.ProviderMode.LIVE) {
            return;
        }
        segmentWeights();
    }

    private EstimatedTrainMarkerSnapshot computeMarkers(
        String source,
        GtfsRtSubwayArrivalSnapshot snapshot,
        OffsetDateTime generatedAt
    ) {
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        Map<String, SegmentTravelTime> segmentWeights = segmentWeights();

        List<EstimatedTrainMarker> currentMarkers = groupedArrivals(snapshot.arrivals())
            .values()
            .stream()
            .map(rows -> markerForTrain(rows, snapshot, segments, segmentWeights, generatedAt))
            .flatMap(Optional::stream)
            .toList();
        List<EstimatedTrainMarker> markers = retainRecentMarkers(currentMarkers, generatedAt)
            .stream()
            .sorted(Comparator
                .comparing(EstimatedTrainMarker::lineId)
                .thenComparing(EstimatedTrainMarker::direction)
                .thenComparing(EstimatedTrainMarker::segmentId)
                .thenComparing(EstimatedTrainMarker::id))
            .toList();
        Set<String> currentMarkerKeys = currentMarkers.stream()
            .map(this::markerContinuityKey)
            .collect(Collectors.toSet());
        long heldMarkerCount = markers.stream()
            .filter(marker -> !currentMarkerKeys.contains(markerContinuityKey(marker)))
            .count();

        return new EstimatedTrainMarkerSnapshot(
            true,
            source,
            markers.isEmpty()
                ? "Fresh TTC GTFS-RT subway trip updates are available, but no markers could be placed on the schematic map."
                : heldMarkerCount > 0
                    ? "Fresh TTC GTFS-RT subway trip updates are available; briefly holding " + heldMarkerCount
                        + " last-seen marker position" + (heldMarkerCount == 1 ? "" : "s") + " through missing rows."
                : "Fresh TTC GTFS-RT subway trip updates are available.",
            DISCLAIMER,
            snapshot.feedCreatedAt(),
            generatedAt,
            markers
        );
    }

    private List<EstimatedTrainMarker> retainRecentMarkers(
        List<EstimatedTrainMarker> currentMarkers,
        OffsetDateTime generatedAt
    ) {
        Map<String, RetainedMarker> previous = retainedMarkers;
        Map<String, RetainedMarker> nextRetained = new LinkedHashMap<>();

        for (EstimatedTrainMarker marker : currentMarkers) {
            String key = markerContinuityKey(marker);
            EstimatedTrainMarker stabilized = stabilizeProgress(previous.get(key), marker);
            nextRetained.putIfAbsent(key, new RetainedMarker(stabilized, generatedAt));
        }
        List<EstimatedTrainMarker> resolved = nextRetained.values().stream()
            .map(RetainedMarker::marker)
            .collect(Collectors.toCollection(ArrayList::new));

        for (Map.Entry<String, RetainedMarker> entry : previous.entrySet()) {
            if (nextRetained.containsKey(entry.getKey())) {
                continue;
            }
            RetainedMarker retained = entry.getValue();
            if (!retained.lastSeenAt().plus(markerRetention()).isBefore(generatedAt)) {
                nextRetained.put(entry.getKey(), retained);
                resolved.add(retained.marker());
            }
        }

        retainedMarkers = Map.copyOf(nextRetained);
        return resolved;
    }

    private List<EstimatedTrainMarker> retainedMarkers(OffsetDateTime generatedAt) {
        Map<String, RetainedMarker> active = retainedMarkers.entrySet().stream()
            .filter(entry -> !entry.getValue().lastSeenAt().plus(markerRetention()).isBefore(generatedAt))
            .collect(Collectors.toMap(
                Map.Entry::getKey,
                Map.Entry::getValue,
                (left, right) -> left,
                LinkedHashMap::new
            ));
        retainedMarkers = Map.copyOf(active);
        return active.values().stream()
            .map(RetainedMarker::marker)
            .sorted(Comparator
                .comparing(EstimatedTrainMarker::lineId)
                .thenComparing(EstimatedTrainMarker::direction)
                .thenComparing(EstimatedTrainMarker::segmentId)
                .thenComparing(EstimatedTrainMarker::id))
            .toList();
    }

    private Duration markerRetention() {
        Duration configured = properties.getTrainMarkerRetention();
        return configured == null || configured.isNegative() ? Duration.ZERO : configured;
    }

    private void clearRetainedMarkers() {
        retainedMarkers = Map.of();
    }

    private Map<String, List<GtfsRtSubwayStationArrival>> groupedArrivals(List<GtfsRtSubwayStationArrival> arrivals) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        OffsetDateTime cutoff = now.minus(PAST_TOLERANCE);
        OffsetDateTime horizon = now.plus(properties.getTrainMarkerHorizon());

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
        return arrival.lineId()
            + ":"
            + trainIdentity(arrival)
            + ":"
            + markerDirectionIdentity(arrival.direction())
            + ":"
            + arrival.stationId();
    }

    private String markerContinuityKey(EstimatedTrainMarker marker) {
        return marker.lineId()
            + "|"
            + trainContinuityIdentity(marker.tripId(), marker.vehicleId(), marker.id());
    }

    private EstimatedTrainMarker stabilizeProgress(RetainedMarker previous, EstimatedTrainMarker current) {
        if (previous == null
            || !previous.marker().segmentId().equals(current.segmentId())
            || !previous.marker().fromStationId().equals(current.fromStationId())
            || !previous.marker().toStationId().equals(current.toStationId())
            || current.progress() >= previous.marker().progress()) {
            return current;
        }
        return new EstimatedTrainMarker(
            current.id(), current.lineId(), current.direction(), current.travelDirection(), current.segmentId(),
            current.fromStationId(), current.toStationId(), current.nextStationId(), previous.marker().progress(),
            current.segmentTravelSeconds(), current.predictedAt(), current.vehicleId(), current.tripId(),
            current.feedCreatedAt(), current.updatedAt()
        );
    }

    private String trainIdentity(GtfsRtSubwayStationArrival arrival) {
        return trainIdentity(arrival.tripId(), arrival.vehicleId(), normalizeIdentity(arrival.stopId()) + ":" + arrival.stopSequence());
    }

    private String trainIdentity(String tripIdValue, String vehicleIdValue, String fallback) {
        String tripId = normalizeIdentity(tripIdValue);
        String vehicleId = normalizeIdentity(vehicleIdValue);
        if (!tripId.isBlank() && !vehicleId.isBlank()) {
            return tripId + ":" + vehicleId;
        }
        if (!tripId.isBlank()) {
            return tripId;
        }
        if (!vehicleId.isBlank()) {
            return vehicleId;
        }
        return normalizeIdentity(fallback);
    }

    private String trainContinuityIdentity(String tripIdValue, String vehicleIdValue, String fallback) {
        String vehicleId = normalizeIdentity(vehicleIdValue);
        if (!vehicleId.isBlank()) {
            return "vehicle:" + vehicleId;
        }
        String tripId = normalizeIdentity(tripIdValue);
        if (!tripId.isBlank()) {
            return "trip:" + tripId;
        }
        return "marker:" + normalizeIdentity(fallback);
    }

    private String normalizeIdentity(String value) {
        return value == null ? "" : value.trim();
    }

    private String markerDirectionIdentity(String direction) {
        String normalized = normalize(direction);
        return normalized.isBlank() ? "unknown-direction" : normalized.replaceAll("\\s+", "-");
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

    private record RetainedMarker(
        EstimatedTrainMarker marker,
        OffsetDateTime lastSeenAt
    ) {}

    private record MarkerSnapshotCache(
        String source,
        OffsetDateTime feedCreatedAt,
        OffsetDateTime indexedAt,
        OffsetDateTime cachedAt,
        EstimatedTrainMarkerSnapshot snapshot
    ) {
        static MarkerSnapshotCache empty() {
            return new MarkerSnapshotCache("", null, null, OffsetDateTime.MIN, null);
        }

        static MarkerSnapshotCache from(
            String source,
            GtfsRtSubwayArrivalSnapshot arrivalSnapshot,
            OffsetDateTime cachedAt,
            EstimatedTrainMarkerSnapshot snapshot
        ) {
            return new MarkerSnapshotCache(
                source,
                arrivalSnapshot.feedCreatedAt(),
                arrivalSnapshot.indexedAt(),
                cachedAt,
                snapshot
            );
        }

        boolean matches(String source, GtfsRtSubwayArrivalSnapshot arrivalSnapshot, OffsetDateTime now) {
            return snapshot != null
                && Objects.equals(this.source, source)
                && Objects.equals(feedCreatedAt, arrivalSnapshot.feedCreatedAt())
                && Objects.equals(indexedAt, arrivalSnapshot.indexedAt())
                && !cachedAt.plus(MARKER_SNAPSHOT_TTL).isBefore(now);
        }
    }
}
