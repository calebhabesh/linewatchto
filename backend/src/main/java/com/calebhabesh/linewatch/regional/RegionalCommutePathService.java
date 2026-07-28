package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.commute.CommuteResponses;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import org.springframework.stereotype.Service;

/** Computes a conservative default path over the reviewed GO/UP schematic topology. */
@Service
public class RegionalCommutePathService {
    static final int GO_SEGMENT_SECONDS = 420;
    static final int UP_SEGMENT_SECONDS = 300;
    static final int TRANSFER_SECONDS = 600;

    private final Map<String, List<Edge>> graph = buildGraph();

    public CommuteResponses.PathResponse path(String originStationId, String destinationStationId) {
        String origin = normalize(originStationId);
        String destination = normalize(destinationStationId);
        if (origin == null || destination == null || origin.equals(destination)
            || RegionalNetworkCatalog.station(origin).isEmpty() || RegionalNetworkCatalog.station(destination).isEmpty()) {
            return unavailable();
        }

        PriorityQueue<State> queue = new PriorityQueue<>(Comparator
            .comparingInt(State::seconds)
            .thenComparingInt(state -> state.segmentIds().size())
            .thenComparing(State::key));
        Map<StateKey, Integer> best = new LinkedHashMap<>();
        queue.add(new State(origin, null, List.of(origin), List.of(), List.of(), List.of(), List.of(), 0));
        best.put(new StateKey(origin, null), 0);

        while (!queue.isEmpty()) {
            State current = queue.remove();
            if (destination.equals(current.stationId()) && !current.segmentIds().isEmpty()) {
                return available(current);
            }
            if (current.seconds() > best.getOrDefault(new StateKey(current.stationId(), current.lineId()), Integer.MAX_VALUE)) {
                continue;
            }
            for (Edge edge : graph.getOrDefault(current.stationId(), List.of())) {
                boolean transfer = current.lineId() != null && !current.lineId().equals(edge.lineId());
                int nextSeconds = current.seconds() + edge.seconds() + (transfer ? TRANSFER_SECONDS : 0);
                StateKey key = new StateKey(edge.toStationId(), edge.lineId());
                if (nextSeconds >= best.getOrDefault(key, Integer.MAX_VALUE)) continue;
                best.put(key, nextSeconds);

                List<String> stations = append(current.stationIds(), edge.toStationId());
                List<String> segments = append(current.segmentIds(), edge.segmentId());
                List<CommuteResponses.PathSegmentHopResponse> hops = append(current.hops(),
                    new CommuteResponses.PathSegmentHopResponse(
                        edge.segmentId(), edge.lineId(), current.stationId(), edge.toStationId(), edge.direction()
                    ));
                List<String> lines = current.lineIds().contains(edge.lineId())
                    ? current.lineIds() : append(current.lineIds(), edge.lineId());
                List<String> transfers = transfer && !current.transferIds().contains(current.stationId())
                    ? append(current.transferIds(), current.stationId()) : current.transferIds();
                queue.add(new State(edge.toStationId(), edge.lineId(), stations, segments, hops, lines, transfers, nextSeconds));
            }
        }
        return unavailable();
    }

    private CommuteResponses.PathResponse available(State state) {
        String corridors = state.lineIds().stream()
            .map(lineId -> RegionalNetworkCatalog.route(lineId).map(RegionalNetworkCatalog.Route::number).orElse(lineId))
            .reduce((left, right) -> left + " + " + right).orElse("regional rail");
        String transfer = state.transferIds().isEmpty() ? "" : ", " + state.transferIds().size() + " transfer" + (state.transferIds().size() == 1 ? "" : "s");
        return new CommuteResponses.PathResponse(
            "available", state.stationIds(), state.segmentIds(), state.hops(), state.lineIds(), state.transferIds(),
            state.seconds(), "regional-topology-estimate",
            "Default regional route: " + state.stationIds().size() + " stations on " + corridors + transfer
                + ", planning estimate about " + Math.max(1, Math.round(state.seconds() / 60.0f)) + " min"
        );
    }

    private CommuteResponses.PathResponse unavailable() {
        return new CommuteResponses.PathResponse(
            "unavailable", List.of(), List.of(), List.of(), List.of(), List.of(), 0, "unavailable",
            "No reviewed GO/UP route connects those stations."
        );
    }

    private Map<String, List<Edge>> buildGraph() {
        Map<String, List<Edge>> result = new LinkedHashMap<>();
        for (RegionalNetworkCatalog.Segment segment : RegionalNetworkCatalog.segments()) {
            int seconds = "regional-up".equals(segment.lineId()) ? UP_SEGMENT_SECONDS : GO_SEGMENT_SECONDS;
            add(result, segment.stationAId(), new Edge(segment.stationBId(), segment.id(), segment.lineId(), "forward", seconds));
            add(result, segment.stationBId(), new Edge(segment.stationAId(), segment.id(), segment.lineId(), "reverse", seconds));
        }
        result.replaceAll((station, edges) -> edges.stream()
            .sorted(Comparator.comparing(Edge::lineId).thenComparing(Edge::segmentId).thenComparing(Edge::toStationId))
            .toList());
        return Map.copyOf(result);
    }

    private void add(Map<String, List<Edge>> result, String stationId, Edge edge) {
        result.computeIfAbsent(stationId, ignored -> new ArrayList<>()).add(edge);
    }

    private String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim().toLowerCase(java.util.Locale.CANADA);
    }

    private <T> List<T> append(List<T> values, T value) {
        List<T> next = new ArrayList<>(values);
        next.add(value);
        return List.copyOf(next);
    }

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
}

