package com.calebhabesh.linewatch.regional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Closed sections of a GO/UP line.
 *
 * <p>A classification's span list holds consecutive station pairs, one pair per closed section:
 * {@code [a, b]} is one section and {@code [a, b, c, d]} two. A single pair keeps the order the
 * notice names it; several pairs are sorted along the route with overlapping or touching sections
 * merged, so equal closures always compare equal.
 */
final class RegionalSpans {
    private RegionalSpans() {}

    /** The station pairs of a span list; empty unless it holds whole pairs of distinct stations. */
    static List<List<String>> pairs(List<String> span) {
        if (span == null || span.isEmpty() || span.size() % 2 != 0) return List.of();
        List<List<String>> pairs = new ArrayList<>();
        for (int index = 0; index < span.size(); index += 2) {
            String from = span.get(index);
            String to = span.get(index + 1);
            if (from == null || to == null || from.equals(to)) return List.of();
            pairs.add(List.of(from, to));
        }
        return List.copyOf(pairs);
    }

    static boolean valid(List<String> span) {
        return !pairs(span).isEmpty();
    }

    static boolean multiple(List<String> span) {
        return pairs(span).size() > 1;
    }

    static List<String> flatten(List<List<String>> pairs) {
        return pairs.stream().flatMap(List::stream).toList();
    }

    /** The first of the lines whose route holds every station of the span. */
    static Optional<RegionalNetworkCatalog.Route> route(List<String> lineIds, List<String> span) {
        return lineIds.stream().map(RegionalNetworkCatalog::route).flatMap(Optional::stream)
            .filter(route -> route.stationIds().containsAll(span))
            .findFirst();
    }

    /**
     * Orders sections along their route and merges overlapping or touching ones. One section keeps
     * its stated order; sections that share no route are returned unchanged.
     */
    static List<String> normalize(List<String> lineIds, List<List<String>> pairs) {
        if (pairs.isEmpty()) return List.of();
        if (pairs.size() == 1) return pairs.getFirst();
        RegionalNetworkCatalog.Route route = route(lineIds, flatten(pairs)).orElse(null);
        if (route == null) return flatten(pairs);
        List<int[]> intervals = pairs.stream().map(pair -> interval(route, pair))
            .sorted(Comparator.comparingInt(interval -> interval[0])).toList();
        List<int[]> merged = new ArrayList<>();
        for (int[] interval : intervals) {
            int[] last = merged.isEmpty() ? null : merged.getLast();
            if (last != null && interval[0] <= last[1]) {
                last[1] = Math.max(last[1], interval[1]);
            } else {
                merged.add(new int[] {interval[0], interval[1]});
            }
        }
        return merged.stream()
            .flatMap(interval -> java.util.stream.Stream.of(
                route.stationIds().get(interval[0]), route.stationIds().get(interval[1])))
            .toList();
    }

    /** The parts of a line outside the section where trains still run, as span pairs. */
    static List<String> outside(RegionalNetworkCatalog.Route route, String runsFrom, String runsTo) {
        int[] running = interval(route, List.of(runsFrom, runsTo));
        List<String> stations = route.stationIds();
        List<String> closed = new ArrayList<>();
        if (running[0] > 0) {
            closed.add(stations.getFirst());
            closed.add(stations.get(running[0]));
        }
        if (running[1] < stations.size() - 1) {
            closed.add(stations.get(running[1]));
            closed.add(stations.getLast());
        }
        return List.copyOf(closed);
    }

    /** Segments of every section on the line, in route order. */
    static List<String> segmentIds(String lineId, List<String> span) {
        List<String> ids = new ArrayList<>();
        for (List<String> pair : pairs(span)) {
            for (String segmentId : RegionalNetworkCatalog.segmentIds(lineId, pair)) {
                if (!ids.contains(segmentId)) ids.add(segmentId);
            }
        }
        return List.copyOf(ids);
    }

    /** True when every station lies within one of the sections on the route. */
    static boolean containsAll(RegionalNetworkCatalog.Route route, List<String> span, List<String> stationIds) {
        List<String> within = stationsWithin(route, span);
        return !within.isEmpty() && within.containsAll(stationIds);
    }

    /**
     * Every station within the sections on the route, in route order: the stations along each
     * section's segments, so a branch off the line is not inside a section that passes it.
     */
    static List<String> stationsWithin(RegionalNetworkCatalog.Route route, List<String> span) {
        java.util.Set<String> segmentIds = new java.util.HashSet<>();
        for (List<String> pair : pairs(span)) {
            if (route.stationIds().containsAll(pair)) segmentIds.addAll(RegionalNetworkCatalog.segmentIds(route.id(), pair));
        }
        java.util.Set<String> within = new java.util.HashSet<>();
        RegionalNetworkCatalog.segments().stream()
            .filter(segment -> route.id().equals(segment.lineId()) && segmentIds.contains(segment.id()))
            .forEach(segment -> {
                within.add(segment.stationAId());
                within.add(segment.stationBId());
            });
        return route.stationIds().stream().filter(within::contains).toList();
    }

    /**
     * The connected stretches an alert's segments cover, as [first, last] station pairs in route
     * order. Two or more stretches mean the alert closes separate sections of its line. Stretches
     * follow how segments connect, not station-list order, because a line can branch (Lakeshore
     * West's Hamilton GO Centre spur leaves the main line at Aldershot).
     */
    static List<List<String>> sections(String lineId, List<String> segmentIds) {
        RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(lineId).orElse(null);
        if (route == null || segmentIds == null || segmentIds.isEmpty()) return List.of();
        java.util.Map<String, List<String>> neighbours = new java.util.LinkedHashMap<>();
        for (RegionalNetworkCatalog.Segment segment : RegionalNetworkCatalog.segments()) {
            if (!lineId.equals(segment.lineId()) || !segmentIds.contains(segment.id())) continue;
            neighbours.computeIfAbsent(segment.stationAId(), ignored -> new ArrayList<>()).add(segment.stationBId());
            neighbours.computeIfAbsent(segment.stationBId(), ignored -> new ArrayList<>()).add(segment.stationAId());
        }
        java.util.Set<String> seen = new java.util.HashSet<>();
        List<List<String>> sections = new ArrayList<>();
        for (String start : neighbours.keySet()) {
            if (!seen.add(start)) continue;
            List<String> stretch = new ArrayList<>(List.of(start));
            for (int cursor = 0; cursor < stretch.size(); cursor++) {
                for (String next : neighbours.get(stretch.get(cursor))) {
                    if (seen.add(next)) stretch.add(next);
                }
            }
            // A stretch's ends are its stations with one neighbour; a branch adds a third end.
            List<String> ends = stretch.stream().filter(route.stationIds()::contains)
                .filter(station -> neighbours.get(station).size() == 1)
                .sorted(Comparator.comparingInt(route.stationIds()::indexOf)).toList();
            if (ends.size() < 2) {
                ends = stretch.stream().filter(route.stationIds()::contains)
                    .sorted(Comparator.comparingInt(route.stationIds()::indexOf)).toList();
            }
            if (ends.size() >= 2) sections.add(List.of(ends.getFirst(), ends.getLast()));
        }
        sections.sort(Comparator.comparingInt(section -> route.stationIds().indexOf(section.getFirst())));
        return List.copyOf(sections);
    }

    private static int[] interval(RegionalNetworkCatalog.Route route, List<String> pair) {
        int first = route.stationIds().indexOf(pair.getFirst());
        int second = route.stationIds().indexOf(pair.getLast());
        return new int[] {Math.min(first, second), Math.max(first, second)};
    }
}
