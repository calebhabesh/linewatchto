package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.commute.CommuteResponses;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Computes a default path over the reviewed GO/UP schematic topology and times it from the
 * active GO and UP timetables. Each link weighs its median scheduled run time in its direction of
 * travel; the reported time takes each single-line stretch of the path from trips that stop at
 * both of its ends, so express service between those stations counts. Links the timetables do not
 * cover fall back to fixed topology weights, and the path is then labelled a planning estimate.
 */
@Service
public class RegionalCommutePathService {
    private static final Logger log = LoggerFactory.getLogger(RegionalCommutePathService.class);

    static final int GO_SEGMENT_SECONDS = 420;
    static final int UP_SEGMENT_SECONDS = 300;
    static final int TRANSFER_SECONDS = 600;
    public static final String SCHEDULED_SOURCE = "regional-gtfs-scheduled-median";
    public static final String MIXED_SOURCE = "regional-mixed-scheduled-fallback";
    public static final String TOPOLOGY_SOURCE = "regional-topology-estimate";

    private static final Snapshot TOPOLOGY_ONLY = Snapshot.build("", Map.of());

    private final RegionalGtfsScheduleRepository repository;
    private volatile Snapshot snapshot = TOPOLOGY_ONLY;

    /** Topology weights only, for callers without a timetable. */
    public RegionalCommutePathService() {
        this(null);
    }

    @Autowired
    public RegionalCommutePathService(RegionalGtfsScheduleRepository repository) {
        this.repository = repository;
    }

    public CommuteResponses.PathResponse path(String originStationId, String destinationStationId) {
        String origin = normalize(originStationId);
        String destination = normalize(destinationStationId);
        if (origin == null || destination == null || origin.equals(destination)
            || RegionalNetworkCatalog.station(origin).isEmpty() || RegionalNetworkCatalog.station(destination).isEmpty()) {
            return unavailable();
        }

        Snapshot current = currentSnapshot();
        PriorityQueue<State> queue = new PriorityQueue<>(Comparator
            .comparingInt(State::seconds)
            .thenComparingInt(state -> state.segmentIds().size())
            .thenComparing(State::key));
        Map<StateKey, Integer> best = new LinkedHashMap<>();
        queue.add(new State(origin, null, List.of(origin), List.of(), List.of(), List.of(), List.of(), 0));
        best.put(new StateKey(origin, null), 0);

        while (!queue.isEmpty()) {
            State state = queue.remove();
            if (destination.equals(state.stationId()) && !state.segmentIds().isEmpty()) {
                return available(state, current);
            }
            if (state.seconds() > best.getOrDefault(new StateKey(state.stationId(), state.lineId()), Integer.MAX_VALUE)) {
                continue;
            }
            for (Edge edge : current.graph().getOrDefault(state.stationId(), List.of())) {
                boolean transfer = state.lineId() != null && !state.lineId().equals(edge.lineId());
                int nextSeconds = state.seconds() + edge.seconds() + (transfer ? TRANSFER_SECONDS : 0);
                StateKey key = new StateKey(edge.toStationId(), edge.lineId());
                if (nextSeconds >= best.getOrDefault(key, Integer.MAX_VALUE)) continue;
                best.put(key, nextSeconds);

                List<String> stations = append(state.stationIds(), edge.toStationId());
                List<String> segments = append(state.segmentIds(), edge.segmentId());
                List<CommuteResponses.PathSegmentHopResponse> hops = append(state.hops(),
                    new CommuteResponses.PathSegmentHopResponse(
                        edge.segmentId(), edge.lineId(), state.stationId(), edge.toStationId(), edge.direction()
                    ));
                List<String> lines = state.lineIds().contains(edge.lineId())
                    ? state.lineIds() : append(state.lineIds(), edge.lineId());
                List<String> transfers = transfer && !state.transferIds().contains(state.stationId())
                    ? append(state.transferIds(), state.stationId()) : state.transferIds();
                queue.add(new State(edge.toStationId(), edge.lineId(), stations, segments, hops, lines, transfers, nextSeconds));
            }
        }
        return unavailable();
    }

    private Snapshot currentSnapshot() {
        if (repository == null) return TOPOLOGY_ONLY;
        Snapshot cached = snapshot;
        String signature;
        try {
            signature = repository.activeImportSignature();
        } catch (RuntimeException failure) {
            log.warn("Regional schedule signature unavailable; keeping current commute weights: {}",
                failure.getClass().getSimpleName());
            return cached;
        }
        if (signature.equals(cached.signature())) return cached;

        synchronized (this) {
            cached = snapshot;
            if (signature.equals(cached.signature())) return cached;
            try {
                Map<String, Integer> pairs = new HashMap<>();
                for (RegionalGtfsScheduleRepository.StationPairTime pair : repository.scheduledStationPairTimes()) {
                    if (pair.seconds() > 0) pairs.put(key(pair.lineId(), pair.fromStationId(), pair.toStationId()), pair.seconds());
                }
                Snapshot next = Snapshot.build(signature, pairs);
                snapshot = next;
                return next;
            } catch (RuntimeException failure) {
                // Keep the previous weights; the next call retries the load.
                log.warn("Regional schedule ride times unavailable; keeping current commute weights: {}",
                    failure.getClass().getSimpleName());
                return cached;
            }
        }
    }

    private CommuteResponses.PathResponse available(State state, Snapshot current) {
        Timing timing = timing(state.hops(), current);
        String corridors = state.lineIds().stream()
            .map(lineId -> RegionalNetworkCatalog.route(lineId).map(RegionalNetworkCatalog.Route::number).orElse(lineId))
            .reduce((left, right) -> left + " + " + right).orElse("regional rail");
        String transfer = state.transferIds().isEmpty() ? "" : ", " + state.transferIds().size() + " transfer" + (state.transferIds().size() == 1 ? "" : "s");
        int minutes = Math.max(1, Math.round(timing.seconds() / 60.0f));
        String summary = SCHEDULED_SOURCE.equals(timing.source())
            ? "Default scheduled regional route: " + state.stationIds().size() + " stations on " + corridors + transfer
                + ", about " + minutes + " min"
            : "Default regional route: " + state.stationIds().size() + " stations on " + corridors + transfer
                + ", planning estimate about " + minutes + " min";
        return new CommuteResponses.PathResponse(
            "available", state.stationIds(), state.segmentIds(), state.hops(), state.lineIds(), state.transferIds(),
            timing.seconds(), timing.source(), summary
        );
    }

    /** Times each single-line stretch from the timetable where it can, and adds a transfer allowance between them. */
    private Timing timing(List<CommuteResponses.PathSegmentHopResponse> hops, Snapshot current) {
        int seconds = 0;
        int legs = 0;
        int scheduledLegs = 0;
        boolean anyScheduled = false;
        int start = 0;
        while (start < hops.size()) {
            String lineId = hops.get(start).lineId();
            int end = start;
            while (end + 1 < hops.size() && hops.get(end + 1).lineId().equals(lineId)) end++;

            Integer ride = current.pairSeconds().get(
                key(lineId, hops.get(start).fromStationId(), hops.get(end).toStationId()));
            if (ride != null) {
                seconds += ride;
                scheduledLegs++;
                anyScheduled = true;
            } else {
                boolean allScheduled = true;
                for (int index = start; index <= end; index++) {
                    CommuteResponses.PathSegmentHopResponse hop = hops.get(index);
                    Weight weight = current.weights().get(key(lineId, hop.fromStationId(), hop.toStationId()));
                    seconds += weight.seconds();
                    allScheduled &= weight.scheduled();
                    anyScheduled |= weight.scheduled();
                }
                if (allScheduled) scheduledLegs++;
            }
            legs++;
            start = end + 1;
        }
        seconds += Math.max(0, legs - 1) * TRANSFER_SECONDS;
        String source = legs > 0 && scheduledLegs == legs ? SCHEDULED_SOURCE
            : anyScheduled ? MIXED_SOURCE : TOPOLOGY_SOURCE;
        return new Timing(seconds, source);
    }

    private CommuteResponses.PathResponse unavailable() {
        return new CommuteResponses.PathResponse(
            "unavailable", List.of(), List.of(), List.of(), List.of(), List.of(), 0, "unavailable",
            "No reviewed GO/UP route connects those stations."
        );
    }

    private String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim().toLowerCase(java.util.Locale.CANADA);
    }

    private static String key(String lineId, String fromStationId, String toStationId) {
        return lineId + "|" + fromStationId + "|" + toStationId;
    }

    private static <T> List<T> append(List<T> values, T value) {
        List<T> next = new ArrayList<>(values);
        next.add(value);
        return List.copyOf(next);
    }

    private record Weight(int seconds, boolean scheduled) {}
    private record Timing(int seconds, String source) {}
    private record Edge(String toStationId, String segmentId, String lineId, String direction, int seconds) {}
    private record StateKey(String stationId, String lineId) {}
    private record State(
        String stationId,
        String lineId,
        List<String> stationIds,
        List<String> segmentIds,
        List<CommuteResponses.PathSegmentHopResponse> hops,
        List<String> lineIds,
        List<String> transferIds,
        int seconds
    ) {
        String key() {
            return String.join("|", stationIds) + "|" + String.join("|", lineIds);
        }
    }

    /** The routing graph and ride times for one set of active imports. */
    private record Snapshot(
        String signature,
        Map<String, List<Edge>> graph,
        Map<String, Weight> weights,
        Map<String, Integer> pairSeconds
    ) {
        static Snapshot build(String signature, Map<String, Integer> pairSeconds) {
            Map<String, List<Edge>> graph = new LinkedHashMap<>();
            Map<String, Weight> weights = new HashMap<>();
            for (RegionalNetworkCatalog.Segment segment : RegionalNetworkCatalog.segments()) {
                Weight forward = weight(segment, segment.stationAId(), segment.stationBId(), pairSeconds);
                Weight reverse = weight(segment, segment.stationBId(), segment.stationAId(), pairSeconds);
                weights.put(key(segment.lineId(), segment.stationAId(), segment.stationBId()), forward);
                weights.put(key(segment.lineId(), segment.stationBId(), segment.stationAId()), reverse);
                graph.computeIfAbsent(segment.stationAId(), ignored -> new ArrayList<>()).add(
                    new Edge(segment.stationBId(), segment.id(), segment.lineId(), "forward", forward.seconds()));
                graph.computeIfAbsent(segment.stationBId(), ignored -> new ArrayList<>()).add(
                    new Edge(segment.stationAId(), segment.id(), segment.lineId(), "reverse", reverse.seconds()));
            }
            graph.replaceAll((station, edges) -> edges.stream()
                .sorted(Comparator.comparing(Edge::lineId).thenComparing(Edge::segmentId).thenComparing(Edge::toStationId))
                .toList());
            return new Snapshot(signature, Map.copyOf(graph), Map.copyOf(weights), Map.copyOf(pairSeconds));
        }

        /** The link's run time in this direction, else the opposite direction's, else the topology weight. */
        private static Weight weight(
            RegionalNetworkCatalog.Segment segment, String fromStationId, String toStationId, Map<String, Integer> pairSeconds
        ) {
            Integer seconds = pairSeconds.get(key(segment.lineId(), fromStationId, toStationId));
            if (seconds == null) seconds = pairSeconds.get(key(segment.lineId(), toStationId, fromStationId));
            if (seconds != null) return new Weight(seconds, true);
            return new Weight("regional-up".equals(segment.lineId()) ? UP_SEGMENT_SECONDS : GO_SEGMENT_SECONDS, false);
        }
    }
}
