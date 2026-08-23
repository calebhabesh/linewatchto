package com.calebhabesh.linewatch.reliability;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

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

    static long minutes(List<TimeRange> ranges) {
        long seconds = merge(ranges, Duration.ZERO).stream()
            .mapToLong(range -> Duration.between(range.start(), range.end()).toSeconds())
            .sum();
        return Math.max(0, Math.round(seconds / 60.0));
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
}
