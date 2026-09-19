package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.commute.CommuteImpactService;
import com.calebhabesh.linewatch.commute.CommuteResponses;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;

/** Matches only freshness-gated, dashboard-visible Metrolinx rail impacts. */
@Service
public class RegionalCommuteImpactService {
    private final RegionalAlertStore alertStore;
    private final RegionalIngestionFreshness freshness;
    private final CommuteImpactService estimateService;
    private final Clock clock;

    public RegionalCommuteImpactService(
        RegionalAlertStore alertStore,
        RegionalIngestionFreshness freshness,
        CommuteImpactService estimateService,
        Clock clock
    ) {
        this.alertStore = alertStore;
        this.freshness = freshness;
        this.estimateService = estimateService;
        this.clock = clock;
    }

    public CommuteResponses.ImpactResponse impactFor(CommuteResponses.PathResponse path) {
        if (path == null || !path.available()) {
            return unavailable(path, "Route impacts are unavailable because no regional path could be computed.");
        }
        if (!freshness.isFresh()) {
            return unavailable(path, "Regional alert matching is unavailable because the latest successful Metrolinx poll is missing or stale.");
        }
        Set<String> pathSegments = new LinkedHashSet<>(path.segmentIds());
        Set<String> pathStations = new LinkedHashSet<>(path.stationIds());
        Set<String> pathLines = new LinkedHashSet<>(path.lineIds());
        OffsetDateTime now = OffsetDateTime.now(clock);
        List<CommuteResponses.MatchedImpactResponse> matches = new ArrayList<>();

        for (RegionalNormalizedAlert alert : alertStore.findActiveAlerts()) {
            if ("advisory".equals(alert.impactKind())) continue;
            if (!pathLines.contains(alert.lineId())) continue;
            List<String> matchedSegments = intersection(alert.affectedSegmentIds(), pathSegments);
            List<String> matchedStations = intersection(alert.stationIds(), pathStations);
            boolean routeWide = empty(alert.affectedSegmentIds()) && empty(alert.stationIds());
            if (!routeWide && matchedSegments.isEmpty() && matchedStations.isEmpty()) continue;

            boolean planned = "planned-closure".equals(alert.impactKind())
                && alert.activePeriodStart() != null && alert.activePeriodStart().isAfter(now);
            String severity = switch (alert.impactKind()) {
                case "suspension" -> "suspended";
                case "planned-closure" -> planned ? "planned" : "major";
                default -> "minor";
            };
            RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(alert.lineId()).orElse(null);
            String lineNumber = route == null ? "" : route.number();
            String location = location(alert, routeWide);
            String closureDates = alert.hasDateOnlyServiceWindow()
                ? RegionalServiceDateFormatter.format(alert.activePeriodStart(), alert.activePeriodEnd())
                : null;
            matches.add(new CommuteResponses.MatchedImpactResponse(
                alert.id(), alert.impactKind(), planned ? "planned" : "current", severity,
                alert.title(), alert.lineId(), lineNumber, location, null, alert.description(), source(alert),
                matchedSegments, matchedStations, alert.activePeriodStart(), alert.sourceUpdatedAt(),
                planned ? "Upcoming" : "Now", planned ? "scheduled" : "active", alert.activePeriodStart(),
                null, closureDates, false, alert.title(), alert.cause(), false,
                alert.hasDateOnlyServiceWindow() ? alert.activePeriodEnd() : null
            ));
        }
        matches.sort(Comparator.comparing(CommuteResponses.MatchedImpactResponse::kind)
            .thenComparing(CommuteResponses.MatchedImpactResponse::id));
        return estimateService.responseForMatches(path, matches);
    }

    private CommuteResponses.ImpactResponse unavailable(CommuteResponses.PathResponse path, String detail) {
        int baseline = path == null ? 0 : Math.max(0, path.estimatedTravelSeconds());
        return new CommuteResponses.ImpactResponse(
            "unavailable", "unavailable", "Impact data unavailable", detail, List.of(),
            new CommuteResponses.TravelTimeEstimateResponse(
                baseline > 0 ? "standard" : "unavailable", baseline,
                baseline > 0 ? baseline : null, baseline > 0 ? baseline : null,
                baseline > 0 ? 0 : null, baseline > 0 ? 0 : null,
                baseline > 0 ? "low" : "none",
                baseline > 0
                    ? "Planning estimate only; current regional disruption data is unavailable."
                    : "Travel time estimate unavailable because no route path could be computed."
            )
        );
    }

    private String location(RegionalNormalizedAlert alert, boolean routeWide) {
        if (routeWide) return "Full corridor";
        List<String> names = alert.stationIds().stream()
            .map(id -> RegionalNetworkCatalog.station(id).map(station -> station.name()).orElse(id))
            .toList();
        return names.isEmpty() ? "Matched route segment" : String.join(" to ", names);
    }

    private String source(RegionalNormalizedAlert alert) {
        return MetrolinxSourceSystem.UP_GTFS_ALERTS.equals(alert.sourceSystem())
            ? "Metrolinx UP Express GTFS-RT" : "Metrolinx Open API";
    }

    private boolean empty(List<String> values) {
        return values == null || values.isEmpty();
    }

    private List<String> intersection(List<String> values, Set<String> pathValues) {
        if (empty(values)) return List.of();
        return values.stream().filter(pathValues::contains).distinct().toList();
    }
}
