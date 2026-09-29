package com.calebhabesh.linewatch.commute;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class CommuteImpactService {
    private static final int DELAY_LOW_MIN_SECONDS = 180;
    private static final int DELAY_HIGH_MIN_SECONDS = 600;
    private static final int REDUCED_SPEED_LOW_MIN_SECONDS = 60;
    private static final int REDUCED_SPEED_HIGH_MIN_SECONDS = 180;
    private static final int MAX_EXTRA_SECONDS = 3600;

    private final AlertDashboardService dashboardService;

    public CommuteImpactService(AlertDashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    public CommuteResponses.ImpactResponse impactFor(CommuteResponses.PathResponse path) {
        if (path == null || !path.available()) {
            return new CommuteResponses.ImpactResponse(
                "unavailable",
                "unavailable",
                "Route unavailable",
                "LineWatchTO could not compute a rapid-transit path for this commute.",
                List.of(),
                unavailableTravelTimeEstimate()
            );
        }

        Set<String> pathSegmentIds = new LinkedHashSet<>(path.segmentIds());
        Set<String> pathStationIds = new LinkedHashSet<>(path.stationIds());
        Map<String, Set<String>> pathDirectionsBySegmentId = pathDirectionsBySegmentId(path);
        Map<String, List<AlertDashboardService.SegmentImpact>> activeSegmentImpacts = activeSegmentImpacts();
        Map<String, CommuteResponses.MatchedImpactResponse> matchesByIdentity = new LinkedHashMap<>();

        List<AlertDashboardService.ActiveAlertDto> activeAlerts = dashboardService.activeAlerts();
        for (AlertDashboardService.ActiveAlertDto alert : activeAlerts) {
            List<String> matchedSegmentIds = currentSegmentIntersection(
                alert.affectedSegmentIds(),
                pathDirectionsBySegmentId,
                activeSegmentImpacts,
                alert.id(),
                null
            );
            if (matchedSegmentIds.isEmpty()) {
                continue;
            }
            String kind = "planned".equals(alert.severity()) ? "planned-closure" : "suspension";
            String severity = "suspension".equals(kind) ? "suspended" : "major";
            putMatch(matchesByIdentity, new CommuteResponses.MatchedImpactResponse(
                alert.id(), kind, "current", severity, alert.title(), alert.lineId(), alert.lineNumber(),
                alert.location(), alert.displayDirection(), alert.description(), alert.source(), matchedSegmentIds, List.of(),
                alert.startedAt(), alert.updatedAt(), null, "active-now", alert.startedAt()
            ));
        }

        List<AlertDashboardService.DelayAlertDto> delayAlerts = dashboardService.delays();
        for (AlertDashboardService.DelayAlertDto alert : delayAlerts) {
            List<String> matchedSegmentIds = currentSegmentIntersection(
                alert.affectedSegmentIds(),
                pathDirectionsBySegmentId,
                activeSegmentImpacts,
                alert.id(),
                "delay"
            );
            if (matchedSegmentIds.isEmpty()) {
                continue;
            }
            putMatch(matchesByIdentity, new CommuteResponses.MatchedImpactResponse(
                alert.id(), "delay", "current", "minor", alert.title(), alert.lineId(), alert.lineNumber(),
                alert.location(), alert.displayDirection(), alert.description(), alert.source(), matchedSegmentIds, List.of(),
                alert.startedAt(), alert.updatedAt(), null, "active-now", alert.startedAt(),
                null, null, false, alert.notificationTitle(), alert.cause(), alert.shuttle()
            ).withServiceEffect(alert.serviceEffect(), alert.relatedPlannedClosureId()));
        }

        for (AlertDashboardService.ReducedSpeedZoneDto zone : dashboardService.reducedSpeedZones()) {
            List<String> matchedSegmentIds = currentSegmentIntersection(
                zone.affectedSegmentIds(),
                pathDirectionsBySegmentId,
                activeSegmentImpacts,
                zone.id(),
                "reduced-speed-zone"
            );
            if (matchedSegmentIds.isEmpty()) {
                continue;
            }
            putMatch(matchesByIdentity, new CommuteResponses.MatchedImpactResponse(
                zone.id(), "reduced-speed-zone", "current", "minor", zone.title(), zone.lineId(), zone.lineNumber(),
                zone.location(), zone.displayDirection(), zone.description(), zone.source(), matchedSegmentIds, List.of(),
                zone.startedAt(), zone.updatedAt(), null, "active-now", zone.startedAt()
            ));
        }

        for (AlertDashboardService.StationNodeImpact impact : dashboardService.activeStationNodeImpacts()) {
            if (!pathStationIds.contains(impact.stationId())) {
                continue;
            }
            AlertDashboardService.DelayAlertDto delay = delayAlerts.stream()
                .filter(alert -> impact.cardId().equals(alert.id())).findFirst().orElse(null);
            putMatch(matchesByIdentity, new CommuteResponses.MatchedImpactResponse(
                impact.cardId(), impact.kind(), "current", severityForKind(impact.kind()), impact.title(),
                null, null, impact.stationId(), null, null, impact.source(), List.of(), List.of(impact.stationId()),
                delay == null ? null : delay.startedAt(), delay == null ? null : delay.updatedAt(), null, "active-now",
                delay == null ? null : delay.startedAt()
            ).withServiceEffect(delay == null ? null : delay.serviceEffect(), delay == null ? null : delay.relatedPlannedClosureId()));
        }

        for (AlertDashboardService.PlannedClosureDto closure : dashboardService.plannedClosures()) {
            List<String> matchedSegmentIds = intersection(closure.previewSegmentIds(), pathSegmentIds).stream()
                .filter(id -> travelDirectionMatches(pathDirectionsBySegmentId.getOrDefault(id, Set.of("bidirectional")), closure.travelDirection()))
                .toList();
            List<String> matchedStationIds = intersection(closure.previewStationIds(), pathStationIds);
            if (matchedSegmentIds.isEmpty() && matchedStationIds.isEmpty()) {
                continue;
            }
            boolean activeNow = closure.activeNow() || "active-now".equals(closure.timingStatus());
            boolean representedByActiveAlert = activeNow && activeAlerts.stream().anyMatch(alert ->
                "planned".equals(alert.severity())
                    && (closure.id().equals(alert.id()) || closure.id().equals(alert.relatedPlannedClosureId()))
            );
            boolean representedByDelay = activeNow && delayAlerts.stream().anyMatch(delay ->
                closure.id().equals(delay.id()) || closure.id().equals(delay.relatedPlannedClosureId()));
            if (representedByActiveAlert || representedByDelay) {
                continue;
            }
            OffsetDateTime eventStartAt = closure.nextWindowStart() != null
                ? closure.nextWindowStart()
                : closure.activeWindowStart() != null
                    ? closure.activeWindowStart()
                    : closure.startedAt();
            putMatch(matchesByIdentity, new CommuteResponses.MatchedImpactResponse(
                closure.id(), "planned-closure", activeNow ? "current" : "planned", activeNow ? "major" : "planned",
                closure.title(), closure.lineId(), closure.lineNumber(),
                closure.location(), closure.displayDirection(), closure.description(), closure.source(), matchedSegmentIds, matchedStationIds,
                closure.startedAt(), closure.updatedAt(), closure.window(), closure.timingStatus(), eventStartAt,
                closure.windowHours(), closure.windowDates(), false,
                closure.notificationTitle(), closure.cause(), closure.shuttle()
            ).withServiceEffect(closure.serviceEffect(), closure.id()));
        }

        List<CommuteResponses.MatchedImpactResponse> matches = matchesByIdentity.values().stream()
            .sorted(Comparator
                .comparingInt((CommuteResponses.MatchedImpactResponse match) -> severityPriority(match.severity())).reversed()
                .thenComparing(CommuteResponses.MatchedImpactResponse::kind)
                .thenComparing(CommuteResponses.MatchedImpactResponse::id))
            .toList();

        return responseForMatches(path, matches);
    }

    private Map<String, List<AlertDashboardService.SegmentImpact>> activeSegmentImpacts() {
        Map<String, List<AlertDashboardService.SegmentImpact>> impacts = dashboardService.activeSegmentImpacts();
        return impacts == null ? Map.of() : impacts;
    }

    private Map<String, Set<String>> pathDirectionsBySegmentId(CommuteResponses.PathResponse path) {
        Map<String, Set<String>> directions = new LinkedHashMap<>();
        if (path.segmentHops() == null || path.segmentHops().isEmpty()) {
            for (String segmentId : path.segmentIds()) {
                directions.computeIfAbsent(segmentId, ignored -> new LinkedHashSet<>()).add("bidirectional");
            }
            return directions;
        }
        for (CommuteResponses.PathSegmentHopResponse hop : path.segmentHops()) {
            if (hop == null || hop.segmentId() == null || hop.segmentId().isBlank()) {
                continue;
            }
            directions.computeIfAbsent(hop.segmentId(), ignored -> new LinkedHashSet<>())
                .add(normalizedTravelDirection(hop.travelDirection()));
        }
        return directions;
    }

    private List<String> currentSegmentIntersection(
        List<String> values,
        Map<String, Set<String>> pathDirectionsBySegmentId,
        Map<String, List<AlertDashboardService.SegmentImpact>> activeSegmentImpacts,
        String cardId,
        String expectedKind
    ) {
        if (values == null || values.isEmpty() || pathDirectionsBySegmentId.isEmpty()) {
            return List.of();
        }
        List<String> matches = new ArrayList<>();
        for (String value : values) {
            Set<String> routeDirections = pathDirectionsBySegmentId.get(value);
            if (routeDirections == null || routeDirections.isEmpty()) {
                continue;
            }
            if (matchesCurrentSegmentImpact(
                activeSegmentImpacts.getOrDefault(value, List.of()),
                routeDirections,
                cardId,
                expectedKind
            )) {
                matches.add(value);
            }
        }
        return matches.stream().distinct().toList();
    }

    private boolean matchesCurrentSegmentImpact(
        List<AlertDashboardService.SegmentImpact> impacts,
        Set<String> routeDirections,
        String cardId,
        String expectedKind
    ) {
        if (impacts == null || impacts.isEmpty()) {
            return true;
        }
        return impacts.stream().anyMatch(impact ->
            impactIdentityMatches(impact, cardId, expectedKind)
                && travelDirectionMatches(routeDirections, impact.travelDirection())
        );
    }

    private boolean impactIdentityMatches(
        AlertDashboardService.SegmentImpact impact,
        String cardId,
        String expectedKind
    ) {
        if (expectedKind != null && !expectedKind.equals(impact.kind())) {
            return false;
        }
        if (cardId == null || cardId.isBlank()) {
            return true;
        }
        return cardId.equals(impact.cardId())
            || (impact.sourceAlertIds() != null && impact.sourceAlertIds().contains(cardId));
    }

    private boolean travelDirectionMatches(Set<String> routeDirections, String impactTravelDirection) {
        String direction = normalizedTravelDirection(impactTravelDirection);
        return "bidirectional".equals(direction)
            || routeDirections.contains("bidirectional")
            || routeDirections.contains(direction);
    }

    private String normalizedTravelDirection(String value) {
        if (value == null || value.isBlank()) {
            return "bidirectional";
        }
        String normalized = value.trim().toLowerCase(java.util.Locale.ROOT);
        return switch (normalized) {
            case "forward", "reverse" -> normalized;
            default -> "bidirectional";
        };
    }

    private List<String> intersection(List<String> values, Set<String> pathValues) {
        if (values == null || values.isEmpty() || pathValues.isEmpty()) {
            return List.of();
        }
        List<String> matches = new ArrayList<>();
        for (String value : values) {
            if (pathValues.contains(value)) {
                matches.add(value);
            }
        }
        return matches.stream().distinct().toList();
    }

    private void putMatch(Map<String, CommuteResponses.MatchedImpactResponse> matchesByIdentity, CommuteResponses.MatchedImpactResponse match) {
        if (match.id() == null || match.id().isBlank()) {
            return;
        }
        matchesByIdentity.putIfAbsent(match.kind() + "|" + match.id(), match);
    }

    public CommuteResponses.ImpactResponse responseForMatches(
        CommuteResponses.PathResponse path,
        List<CommuteResponses.MatchedImpactResponse> matches
    ) {
        List<CommuteResponses.MatchedImpactResponse> routeMatches = matches == null ? List.of() : matches;
        List<CommuteResponses.MatchedImpactResponse> countedMatches = routeMatches.stream()
            .filter(match -> !match.ignoredByRule())
            .toList();
        if (countedMatches.isEmpty()) {
            return new CommuteResponses.ImpactResponse(
                "clear",
                "clear",
                routeMatches.isEmpty() ? "Clear" : "Clear by filters",
                clearDetail(routeMatches),
                routeMatches,
                travelTimeEstimate(path, routeMatches)
            );
        }
        boolean hasCurrent = countedMatches.stream().anyMatch(match -> "current".equals(match.status()));
        String topSeverity = countedMatches.stream()
            .map(CommuteResponses.MatchedImpactResponse::severity)
            .max(Comparator.comparingInt(this::severityPriority))
            .orElse("planned");
        return new CommuteResponses.ImpactResponse(
            hasCurrent ? "affected" : "planned",
            topSeverity,
            hasCurrent ? "Affected now" : "Planned impact",
            detail(countedMatches, hasCurrent),
            routeMatches,
            travelTimeEstimate(path, routeMatches)
        );
    }

    private String clearDetail(List<CommuteResponses.MatchedImpactResponse> routeMatches) {
        if (routeMatches == null || routeMatches.isEmpty()) {
            return "No active or planned LineWatch impacts match this route.";
        }
        int ignoredCount = routeMatches.size();
        return "No monitored LineWatch impacts match this route. "
            + ignoredCount
            + " route "
            + (ignoredCount == 1 ? "impact is" : "impacts are")
            + " ignored by this commute's route filters. Travel time still reflects immediate route conditions.";
    }

    private CommuteResponses.TravelTimeEstimateResponse travelTimeEstimate(
        CommuteResponses.PathResponse path,
        List<CommuteResponses.MatchedImpactResponse> matches
    ) {
        int baselineSeconds = Math.max(0, path.estimatedTravelSeconds());
        List<CommuteResponses.MatchedImpactResponse> immediateMatches = matches.stream()
            .filter(match -> "current".equals(match.status()))
            .toList();
        if (hasUnreliableTravelTimeImpact(immediateMatches)) {
            return new CommuteResponses.TravelTimeEstimateResponse(
                "unreliable",
                baselineSeconds,
                null,
                null,
                null,
                null,
                "low",
                "Typical commute: " + durationLabel(baselineSeconds)
                    + (immediateMatches.stream().anyMatch(match -> "limited-service".equals(match.serviceEffect()))
                        ? ". Limited service on this route; additional travel time is unknown."
                        : ". Major disruption on this route; travel time is not reliable.")
            );
        }

        int extraLowSeconds = 0;
        int extraHighSeconds = 0;
        for (CommuteResponses.MatchedImpactResponse match : immediateMatches) {
            int affectedSeconds = affectedPathSeconds(path, match);
            switch (match.kind()) {
                case "delay" -> {
                    extraLowSeconds += Math.max(DELAY_LOW_MIN_SECONDS, roundToMinute(affectedSeconds));
                    extraHighSeconds += Math.max(DELAY_HIGH_MIN_SECONDS, roundToMinute(affectedSeconds * 2));
                }
                case "reduced-speed-zone" -> {
                    extraLowSeconds += Math.max(REDUCED_SPEED_LOW_MIN_SECONDS, roundToMinute(affectedSeconds / 2));
                    extraHighSeconds += Math.max(REDUCED_SPEED_HIGH_MIN_SECONDS, roundToMinute(affectedSeconds));
                }
                default -> {
                    extraLowSeconds += Math.max(DELAY_LOW_MIN_SECONDS, roundToMinute(affectedSeconds));
                    extraHighSeconds += Math.max(DELAY_HIGH_MIN_SECONDS, roundToMinute(affectedSeconds * 2));
                }
            }
        }

        extraLowSeconds = Math.min(extraLowSeconds, MAX_EXTRA_SECONDS);
        extraHighSeconds = Math.min(Math.max(extraHighSeconds, extraLowSeconds), MAX_EXTRA_SECONDS);

        if (extraHighSeconds <= 0) {
            return standardTravelTimeEstimate(path);
        }

        int estimatedLowSeconds = baselineSeconds + extraLowSeconds;
        int estimatedHighSeconds = baselineSeconds + extraHighSeconds;
        return new CommuteResponses.TravelTimeEstimateResponse(
            "estimated",
            baselineSeconds,
            estimatedLowSeconds,
            estimatedHighSeconds,
            extraLowSeconds,
            extraHighSeconds,
            "regional-topology-estimate".equals(path.weightSource())
                ? "low"
                : immediateMatches.size() == 1 ? "medium" : "low",
            "Typical commute: " + durationLabel(baselineSeconds)
                + ". With current impacts: " + durationRangeLabel(estimatedLowSeconds, estimatedHighSeconds)
                + ". Extra time: " + extraRangeLabel(extraLowSeconds, extraHighSeconds) + "."
        );
    }

    private boolean hasUnreliableTravelTimeImpact(List<CommuteResponses.MatchedImpactResponse> matches) {
        return matches.stream().anyMatch(match ->
            "suspension".equals(match.kind()) || "planned-closure".equals(match.kind())
                || "limited-service".equals(match.serviceEffect())
        );
    }

    private CommuteResponses.TravelTimeEstimateResponse standardTravelTimeEstimate(CommuteResponses.PathResponse path) {
        int baselineSeconds = Math.max(0, path.estimatedTravelSeconds());
        boolean regionalEstimate = "regional-topology-estimate".equals(path.weightSource());
        return new CommuteResponses.TravelTimeEstimateResponse(
            "standard",
            baselineSeconds,
            baselineSeconds,
            baselineSeconds,
            0,
            0,
            regionalEstimate ? "low" : "high",
            regionalEstimate
                ? "Planning estimate: " + durationLabel(baselineSeconds) + ". No extra time estimated from current matched impacts."
                : "Typical commute: " + durationLabel(baselineSeconds) + ". No extra time estimated."
        );
    }

    private CommuteResponses.TravelTimeEstimateResponse unavailableTravelTimeEstimate() {
        return new CommuteResponses.TravelTimeEstimateResponse(
            "unavailable",
            0,
            null,
            null,
            null,
            null,
            "none",
            "Travel time estimate unavailable because no route path could be computed."
        );
    }

    private int affectedPathSeconds(
        CommuteResponses.PathResponse path,
        CommuteResponses.MatchedImpactResponse match
    ) {
        int baselineSeconds = Math.max(0, path.estimatedTravelSeconds());
        if (baselineSeconds <= 0) {
            return 0;
        }

        int routeSegmentCount = Math.max(1, path.segmentIds().size());
        long matchedSegmentCount = match.matchedSegmentIds() == null
            ? 0
            : match.matchedSegmentIds().stream()
                .filter(path.segmentIds()::contains)
                .distinct()
                .count();
        if (matchedSegmentCount > 0) {
            return Math.max(60, Math.round(baselineSeconds * (float) matchedSegmentCount / routeSegmentCount));
        }

        int routeStationCount = Math.max(1, path.stationIds().size());
        long matchedStationCount = match.matchedStationIds() == null
            ? 0
            : match.matchedStationIds().stream()
                .filter(path.stationIds()::contains)
                .distinct()
                .count();
        if (matchedStationCount > 0) {
            return Math.max(60, Math.round(baselineSeconds * (float) matchedStationCount / routeStationCount));
        }

        return Math.max(60, Math.round(baselineSeconds / (float) routeSegmentCount));
    }

    private int roundToMinute(int seconds) {
        if (seconds <= 0) {
            return 0;
        }
        return Math.max(60, Math.round(seconds / 60.0f) * 60);
    }

    private String durationLabel(int seconds) {
        return "about " + minutes(seconds) + " min";
    }

    private String durationRangeLabel(int lowSeconds, int highSeconds) {
        int lowMinutes = minutes(lowSeconds);
        int highMinutes = minutes(highSeconds);
        if (lowMinutes == highMinutes) {
            return "about " + lowMinutes + " min";
        }
        return "about " + lowMinutes + "-" + highMinutes + " min";
    }

    private String extraRangeLabel(int lowSeconds, int highSeconds) {
        int lowMinutes = minutes(lowSeconds);
        int highMinutes = minutes(highSeconds);
        if (lowMinutes == highMinutes) {
            return "+" + lowMinutes + " min";
        }
        return "+" + lowMinutes + "-" + highMinutes + " min";
    }

    private int minutes(int seconds) {
        if (seconds <= 0) {
            return 0;
        }
        return Math.max(1, Math.round(seconds / 60.0f));
    }

    private String detail(List<CommuteResponses.MatchedImpactResponse> matches, boolean hasCurrent) {
        long currentCount = matches.stream().filter(match -> "current".equals(match.status())).count();
        long plannedCount = matches.stream().filter(match -> "planned".equals(match.status())).count();
        if (hasCurrent) {
            String currentPart = currentCount == 1
                ? "1 current impact matches this route"
                : currentCount + " current impacts match this route";
            return plannedCount == 0
                ? currentPart + "."
                : currentPart + ", plus " + plannedCount + " planned " + (plannedCount == 1 ? "impact" : "impacts") + ".";
        }
        return plannedCount == 1
            ? "1 upcoming planned impact matches this route."
            : plannedCount + " upcoming planned impacts match this route.";
    }

    private String severityForKind(String kind) {
        return switch (kind) {
            case "suspension" -> "suspended";
            case "planned-closure" -> "major";
            case "delay", "reduced-speed-zone" -> "minor";
            default -> "minor";
        };
    }

    private int severityPriority(String severity) {
        return switch (severity) {
            case "suspended" -> 5;
            case "major" -> 4;
            case "minor" -> 3;
            case "planned" -> 2;
            case "clear" -> 1;
            default -> 0;
        };
    }
}
