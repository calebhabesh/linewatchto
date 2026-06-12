package com.calebhabesh.linewatch.commute;

import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class CommutePathService {
    static final int FALLBACK_SEGMENT_SECONDS = 120;
    static final int DEFAULT_TRANSFER_SECONDS = 180;
    static final int SPADINA_TRANSFER_SECONDS = 480;

    private final LineSegmentRepository lineSegmentRepository;
    private final CommuteTravelTimeRepository travelTimeRepository;
    private volatile GraphSnapshot graphSnapshot;

    public CommutePathService(
        LineSegmentRepository lineSegmentRepository,
        CommuteTravelTimeRepository travelTimeRepository
    ) {
        this.lineSegmentRepository = lineSegmentRepository;
        this.travelTimeRepository = travelTimeRepository;
    }

    public CommuteResponses.PathResponse path(String originStationId, String destinationStationId) {
        String origin = normalize(originStationId);
        String destination = normalize(destinationStationId);
        if (origin == null || destination == null || origin.equals(destination)) {
            return unavailable(origin, destination);
        }

        Map<String, List<Edge>> graph = graphSnapshot().graph();

        PriorityQueue<PathState> queue = new PriorityQueue<>(Comparator
            .comparingInt(PathState::totalSeconds)
            .thenComparingInt(PathState::transferCount)
            .thenComparingInt(state -> state.segmentIds().size())
            .thenComparing(PathState::pathKey));
        Map<StateKey, Integer> bestSeconds = new LinkedHashMap<>();

        PathState start = new PathState(
            origin,
            null,
            List.of(origin),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            0,
            0
        );
        queue.add(start);
        bestSeconds.put(new StateKey(origin, null), 0);

        while (!queue.isEmpty()) {
            PathState current = queue.remove();
            if (current.stationId().equals(destination) && !current.segmentIds().isEmpty()) {
                return available(current);
            }
            StateKey currentKey = new StateKey(current.stationId(), current.currentLineId());
            if (current.totalSeconds() > bestSeconds.getOrDefault(currentKey, Integer.MAX_VALUE)) {
                continue;
            }

            for (Edge edge : graph.getOrDefault(current.stationId(), List.of())) {
                boolean transfer = current.currentLineId() != null && !current.currentLineId().equals(edge.lineId());
                int transferSeconds = transfer ? transferPenalty(current.stationId()) : 0;
                int nextSeconds = current.totalSeconds() + edge.travelSeconds() + transferSeconds;
                StateKey nextKey = new StateKey(edge.toStationId(), edge.lineId());
                if (nextSeconds >= bestSeconds.getOrDefault(nextKey, Integer.MAX_VALUE)) {
                    continue;
                }
                bestSeconds.put(nextKey, nextSeconds);

                List<String> stationIds = new ArrayList<>(current.stationIds());
                stationIds.add(edge.toStationId());
                List<String> segmentIds = new ArrayList<>(current.segmentIds());
                segmentIds.add(edge.segmentId());
                List<CommuteResponses.PathSegmentHopResponse> segmentHops = new ArrayList<>(current.segmentHops());
                segmentHops.add(new CommuteResponses.PathSegmentHopResponse(
                    edge.segmentId(),
                    edge.lineId(),
                    current.stationId(),
                    edge.toStationId(),
                    edge.travelDirection()
                ));
                List<String> lineIds = new ArrayList<>(current.lineIds());
                if (lineIds.stream().noneMatch(edge.lineId()::equals)) {
                    lineIds.add(edge.lineId());
                }
                List<String> transfers = new ArrayList<>(current.transferStationIds());
                if (transfer && transfers.stream().noneMatch(current.stationId()::equals)) {
                    transfers.add(current.stationId());
                }
                List<String> sources = new ArrayList<>(current.weightSources());
                sources.add(edge.weightSource());

                queue.add(new PathState(
                    edge.toStationId(),
                    edge.lineId(),
                    List.copyOf(stationIds),
                    List.copyOf(segmentIds),
                    List.copyOf(segmentHops),
                    List.copyOf(lineIds),
                    List.copyOf(transfers),
                    List.copyOf(sources),
                    nextSeconds,
                    current.transferCount() + (transfer ? 1 : 0)
                ));
            }
        }

        return unavailable(origin, destination);
    }

    private GraphSnapshot graphSnapshot() {
        String signature = normalizedScheduleSignature();
        GraphSnapshot current = graphSnapshot;
        if (current != null && current.signature().equals(signature)) {
            return current;
        }

        synchronized (this) {
            current = graphSnapshot;
            if (current != null && current.signature().equals(signature)) {
                return current;
            }

            List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc().stream()
                .sorted(Comparator.comparingInt(LineSegmentEntity::getSortOrder).thenComparing(LineSegmentEntity::getId))
                .toList();
            Map<String, CommuteTravelTimeRepository.SegmentTravelTime> scheduledWeights =
                emptyWhenNull(travelTimeRepository.findActiveScheduledSegmentWeights());
            Map<String, CommuteTravelTimeRepository.SegmentTravelTime> seededFallbackWeights =
                emptyWhenNull(travelTimeRepository.findSeededFallbackSegmentWeights());
            GraphSnapshot next = new GraphSnapshot(signature, graph(segments, scheduledWeights, seededFallbackWeights));
            graphSnapshot = next;
            return next;
        }
    }

    private String normalizedScheduleSignature() {
        String signature = travelTimeRepository.activeScheduleSignature();
        return signature == null || signature.isBlank() ? "no-active-gtfs-import" : signature;
    }

    private record GraphSnapshot(String signature, Map<String, List<Edge>> graph) {}

    private Map<String, List<Edge>> graph(
        List<LineSegmentEntity> segments,
        Map<String, CommuteTravelTimeRepository.SegmentTravelTime> scheduledWeights,
        Map<String, CommuteTravelTimeRepository.SegmentTravelTime> seededFallbackWeights
    ) {
        Map<String, List<Edge>> graph = new LinkedHashMap<>();
        for (LineSegmentEntity segment : segments) {
            CommuteTravelTimeRepository.SegmentTravelTime weight = scheduledWeights.get(segment.getId());
            if (weight == null) {
                weight = seededFallbackWeights.get(segment.getId());
            }
            int seconds = weight == null ? FALLBACK_SEGMENT_SECONDS : weight.travelSeconds();
            String source = weight == null ? "fallback" : weight.source();
            addEdge(graph, segment.getStationAId(), new Edge(
                segment.getStationBId(),
                segment.getId(),
                segment.getLineId(),
                "forward",
                seconds,
                source,
                segment.getSortOrder()
            ));
            addEdge(graph, segment.getStationBId(), new Edge(
                segment.getStationAId(),
                segment.getId(),
                segment.getLineId(),
                "reverse",
                seconds,
                source,
                segment.getSortOrder()
            ));
        }
        graph.replaceAll((stationId, edges) -> edges.stream()
            .sorted(Comparator.comparingInt(Edge::sortOrder).thenComparing(Edge::segmentId).thenComparing(Edge::toStationId))
            .toList());
        return graph;
    }

    private Map<String, CommuteTravelTimeRepository.SegmentTravelTime> emptyWhenNull(
        Map<String, CommuteTravelTimeRepository.SegmentTravelTime> weights
    ) {
        return weights == null ? Map.of() : weights;
    }

    private void addEdge(Map<String, List<Edge>> graph, String stationId, Edge edge) {
        if (isBlank(stationId) || isBlank(edge.toStationId()) || isBlank(edge.segmentId()) || isBlank(edge.lineId())) {
            return;
        }
        graph.computeIfAbsent(stationId, ignored -> new ArrayList<>()).add(edge);
    }

    private CommuteResponses.PathResponse available(PathState path) {
        return new CommuteResponses.PathResponse(
            "available",
            path.stationIds(),
            path.segmentIds(),
            path.segmentHops(),
            path.lineIds(),
            path.transferStationIds(),
            path.totalSeconds(),
            weightSource(path.weightSources()),
            summary(path)
        );
    }

    private String summary(PathState path) {
        String prefix = allGtfs(path.weightSources()) ? "Default scheduled route" : "Default route";
        String stationPart = path.stationIds().size() + (path.stationIds().size() == 1 ? " station" : " stations");
        String linePart = path.lineIds().size() == 1
            ? "Line " + lineNumber(path.lineIds().getFirst())
            : "Lines " + joinLineNumbers(path.lineIds());
        return prefix + ": " + stationPart + " on " + linePart + ", about " + Math.max(1, Math.round(path.totalSeconds() / 60.0f)) + " min";
    }

    private String weightSource(List<String> sources) {
        if (sources.isEmpty()) {
            return "unavailable";
        }
        if (allGtfs(sources)) {
            return "gtfs-scheduled-median";
        }
        if (sources.stream().anyMatch(CommuteTravelTimeRepository.GTFS_SOURCE::equals)) {
            return "mixed-scheduled-fallback";
        }
        if (sources.stream().anyMatch(CommuteTravelTimeRepository.SEEDED_FALLBACK_SOURCE::equals)) {
            return "seeded-fallback";
        }
        return "topology-fallback";
    }

    private boolean allGtfs(List<String> sources) {
        return !sources.isEmpty() && sources.stream().allMatch(CommuteTravelTimeRepository.GTFS_SOURCE::equals);
    }

    private String joinLineNumbers(List<String> lineIds) {
        List<String> numbers = lineIds.stream().map(this::lineNumber).toList();
        if (numbers.size() <= 1) {
            return String.join("", numbers);
        }
        return String.join(", ", numbers.subList(0, numbers.size() - 1))
            + " and "
            + numbers.getLast();
    }

    private String lineNumber(String lineId) {
        return lineId == null ? "" : lineId.replace("line-", "").toUpperCase(Locale.ROOT);
    }

    private int transferPenalty(String stationId) {
        // Spadina's Line 1/Line 2 interchange is a long pedestrian passage.
        // Bias default routes toward St George unless Spadina itself is the endpoint.
        return "spadina".equals(stationId) ? SPADINA_TRANSFER_SECONDS : DEFAULT_TRANSFER_SECONDS;
    }

    private CommuteResponses.PathResponse unavailable(String origin, String destination) {
        List<String> stationIds = origin == null || destination == null
            ? List.of()
            : List.of(origin, destination);
        return new CommuteResponses.PathResponse(
            "unavailable",
            stationIds,
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            0,
            "unavailable",
            "Route path unavailable"
        );
    }

    private String normalize(String stationId) {
        return stationId == null || stationId.isBlank() ? null : stationId.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private record Edge(
        String toStationId,
        String segmentId,
        String lineId,
        String travelDirection,
        int travelSeconds,
        String weightSource,
        int sortOrder
    ) {}

    private record StateKey(String stationId, String lineId) {}

    private record PathState(
        String stationId,
        String currentLineId,
        List<String> stationIds,
        List<String> segmentIds,
        List<CommuteResponses.PathSegmentHopResponse> segmentHops,
        List<String> lineIds,
        List<String> transferStationIds,
        List<String> weightSources,
        int totalSeconds,
        int transferCount
    ) {
        String pathKey() {
            return String.join("|", segmentIds);
        }
    }
}
