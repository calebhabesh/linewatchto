package com.calebhabesh.linewatch.ingestion;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class RapidTransitAlertDuplicateMatcher {
    private static final Duration MAX_START_GAP = Duration.ofMinutes(60);
    private static final Pattern NON_ALPHANUMERIC = Pattern.compile("[^\\p{L}\\p{N}]+");

    public boolean isGtfsRtDuplicateOfLive(
        NormalizedRouteAlert gtfsRt,
        NormalizedRouteAlert live
    ) {
        if (gtfsRt == null || live == null) {
            return false;
        }
        return isGtfsRt(gtfsRt)
            && !isGtfsRt(live)
            && Objects.equals(gtfsRt.lineId(), live.lineId())
            && gtfsRt.impactKind() == live.impactKind()
            && timingMatches(gtfsRt, live)
            && scopeMatches(gtfsRt, live);
    }

    private boolean isGtfsRt(NormalizedRouteAlert alert) {
        return "GTFS-RT".equalsIgnoreCase(alert.sourceAlertType());
    }

    private boolean timingMatches(
        NormalizedRouteAlert first,
        NormalizedRouteAlert second
    ) {
        OffsetDateTime firstStart = first.activePeriodStart();
        OffsetDateTime secondStart = second.activePeriodStart();
        if (firstStart == null || secondStart == null) {
            return true;
        }

        Duration startGap = Duration.between(firstStart, secondStart).abs();
        if (startGap.compareTo(MAX_START_GAP) <= 0) {
            return true;
        }

        OffsetDateTime firstEnd = first.activePeriodEnd() == null
            ? OffsetDateTime.MAX
            : first.activePeriodEnd();
        OffsetDateTime secondEnd = second.activePeriodEnd() == null
            ? OffsetDateTime.MAX
            : second.activePeriodEnd();
        return !firstEnd.isBefore(secondStart) && !secondEnd.isBefore(firstStart);
    }

    private boolean scopeMatches(
        NormalizedRouteAlert first,
        NormalizedRouteAlert second
    ) {
        Set<String> firstBounds = bounds(first);
        Set<String> secondBounds = bounds(second);
        if (!firstBounds.isEmpty() && firstBounds.equals(secondBounds)) {
            return true;
        }

        Set<String> firstStations = stationSet(first);
        Set<String> secondStations = stationSet(second);
        if (!firstStations.isEmpty() && firstStations.equals(secondStations)) {
            return true;
        }

        String firstTitle = normalizedTitle(first.title());
        String secondTitle = normalizedTitle(second.title());
        return !firstTitle.isBlank() && firstTitle.equals(secondTitle);
    }

    private Set<String> bounds(NormalizedRouteAlert alert) {
        if (alert.startStationId() == null || alert.endStationId() == null) {
            return Set.of();
        }
        Set<String> bounds = new HashSet<>();
        bounds.add(alert.startStationId());
        bounds.add(alert.endStationId());
        return Set.copyOf(bounds);
    }

    private Set<String> stationSet(NormalizedRouteAlert alert) {
        return alert.stationIds() == null
            ? Set.of()
            : Set.copyOf(alert.stationIds());
    }

    private String normalizedTitle(String title) {
        if (title == null) {
            return "";
        }
        return NON_ALPHANUMERIC.matcher(title.toLowerCase(Locale.ROOT))
            .replaceAll(" ")
            .trim()
            .replaceAll("\\s+", " ");
    }
}
