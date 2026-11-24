package com.calebhabesh.linewatch.reliability;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class ReliabilityIntervalCalculator {
    private ReliabilityIntervalCalculator() {}

    static List<TimeRange> merge(List<TimeRange> ranges, Duration maximumGap) {
        if (ranges == null || ranges.isEmpty()) return List.of();
        Duration gap = maximumGap == null || maximumGap.isNegative() ? Duration.ZERO : maximumGap;
        List<TimeRange> sorted = ranges.stream()
            .filter(TimeRange::valid)
            .sorted(Comparator.comparing(TimeRange::start).thenComparing(TimeRange::end))
            .toList();
        if (sorted.isEmpty()) return List.of();

        List<TimeRange> merged = new ArrayList<>();
        TimeRange current = sorted.getFirst();
        for (int index = 1; index < sorted.size(); index++) {
            TimeRange next = sorted.get(index);
            if (!next.start().isAfter(current.end().plus(gap))) {
                current = new TimeRange(current.start(), later(current.end(), next.end()));
            } else {
                merged.add(current);
                current = next;
            }
        }
        merged.add(current);
        return List.copyOf(merged);
    }

    static List<TimeRange> intersect(List<TimeRange> left, List<TimeRange> right) {
        List<TimeRange> first = merge(left, Duration.ZERO);
        List<TimeRange> second = merge(right, Duration.ZERO);
        List<TimeRange> intersections = new ArrayList<>();
        int leftIndex = 0;
        int rightIndex = 0;
        while (leftIndex < first.size() && rightIndex < second.size()) {
            TimeRange a = first.get(leftIndex);
            TimeRange b = second.get(rightIndex);
            OffsetDateTime start = later(a.start(), b.start());
            OffsetDateTime end = earlier(a.end(), b.end());
            if (end.isAfter(start)) intersections.add(new TimeRange(start, end));
            if (a.end().isBefore(b.end())) leftIndex++; else rightIndex++;
        }
        return List.copyOf(intersections);
    }

    @SafeVarargs
    static List<TimeRange> intersectAll(List<TimeRange>... rangeSets) {
        if (rangeSets == null || rangeSets.length == 0) return List.of();
        List<TimeRange> result = merge(rangeSets[0], Duration.ZERO);
        for (int index = 1; index < rangeSets.length && !result.isEmpty(); index++) {
            result = intersect(result, rangeSets[index]);
        }
        return result;
    }

    static long seconds(List<TimeRange> ranges) {
        return merge(ranges, Duration.ZERO).stream()
            .mapToLong(range -> Duration.between(range.start(), range.end()).toSeconds())
            .sum();
    }

    static long minutes(List<TimeRange> ranges) {
        return Math.max(0, Math.round(seconds(ranges) / 60.0));
    }

    /**
     * Integrates the instantaneous station share of active episodes across {@code intervals}.
     * At each instant, if any active episode is whole-line (or {@code totalScheduledStations <= 0}),
     * the share is 1.0; otherwise it is {@code |union(affectedStations)| / totalScheduledStations}.
     * Returns fractional weighted minutes.
     */
    static double weightedMinutes(List<WeightedInterval> intervals, int totalScheduledStations) {
        if (intervals == null || intervals.isEmpty()) return 0.0;
        record Event(OffsetDateTime time, boolean start, int episodeIndex) {}

        List<WeightedInterval> normalized = new ArrayList<>(intervals.size());
        List<Event> events = new ArrayList<>();
        for (WeightedInterval interval : intervals) {
            if (interval == null || interval.ranges() == null || interval.ranges().isEmpty()) continue;
            List<TimeRange> merged = merge(interval.ranges(), Duration.ZERO);
            if (merged.isEmpty()) continue;
            int idx = normalized.size();
            boolean wholeLine = interval.wholeLine() || totalScheduledStations <= 0;
            Set<String> stations = wholeLine || interval.affectedStations() == null
                ? Set.of()
                : interval.affectedStations();
            if (!wholeLine && stations.isEmpty()) continue;
            normalized.add(new WeightedInterval(merged, stations, wholeLine));
            for (TimeRange range : merged) {
                events.add(new Event(range.start(), true, idx));
                events.add(new Event(range.end(), false, idx));
            }
        }
        if (events.isEmpty()) return 0.0;

        events.sort(Comparator.comparing(Event::time));
        int activeWholeLine = 0;
        Map<String, Integer> stationRefCounts = new HashMap<>();
        double weightedSeconds = 0.0;
        OffsetDateTime previousTime = null;

        int i = 0;
        while (i < events.size()) {
            OffsetDateTime currentTime = events.get(i).time();
            if (previousTime != null && currentTime.isAfter(previousTime)) {
                long segSeconds = Duration.between(previousTime, currentTime).toSeconds();
                if (segSeconds > 0) {
                    double share = activeWholeLine > 0
                        ? 1.0
                        : Math.min(1.0, (double) stationRefCounts.size() / totalScheduledStations);
                    if (share > 0.0) {
                        weightedSeconds += segSeconds * share;
                    }
                }
            }
            while (i < events.size() && events.get(i).time().isEqual(currentTime)) {
                Event event = events.get(i);
                WeightedInterval ep = normalized.get(event.episodeIndex());
                if (ep.wholeLine()) {
                    activeWholeLine += event.start() ? 1 : -1;
                } else {
                    for (String station : ep.affectedStations()) {
                        if (event.start()) {
                            stationRefCounts.merge(station, 1, Integer::sum);
                        } else {
                            stationRefCounts.computeIfPresent(station, (k, count) -> count <= 1 ? null : count - 1);
                        }
                    }
                }
                i++;
            }
            previousTime = currentTime;
        }
        return Math.max(0.0, weightedSeconds / 60.0);
    }

    static boolean contains(List<TimeRange> ranges, OffsetDateTime instant) {
        if (instant == null) return false;
        return ranges.stream().anyMatch(range -> range.valid()
            && !instant.isBefore(range.start()) && instant.isBefore(range.end()));
    }

    private static OffsetDateTime earlier(OffsetDateTime first, OffsetDateTime second) {
        return first.isBefore(second) ? first : second;
    }

    private static OffsetDateTime later(OffsetDateTime first, OffsetDateTime second) {
        return first.isAfter(second) ? first : second;
    }

    record TimeRange(OffsetDateTime start, OffsetDateTime end) {
        boolean valid() {
            return start != null && end != null && end.isAfter(start);
        }
    }

    record WeightedInterval(List<TimeRange> ranges, Set<String> affectedStations, boolean wholeLine) {}
}
