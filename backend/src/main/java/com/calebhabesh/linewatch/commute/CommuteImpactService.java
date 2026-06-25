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
                "LineWatchTO could not compute a rapid-transit path for this saved commute.",
                List.of()
            );
        }

        Set<String> pathSegmentIds = new LinkedHashSet<>(path.segmentIds());
        Set<String> pathStationIds = new LinkedHashSet<>(path.stationIds());
        Map<String, Set<String>> pathDirectionsBySegmentId = pathDirectionsBySegmentId(path);
        Map<String, List<AlertDashboardService.SegmentImpact>> activeSegmentImpacts = activeSegmentImpacts();
        Map<String, CommuteResponses.MatchedImpactResponse> matchesByIdentity = new LinkedHashMap<>();

        for (AlertDashboardService.ActiveAlertDto alert : dashboardService.activeAlerts()) {
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

        for (AlertDashboardService.DelayAlertDto alert : dashboardService.delays()) {
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
                alert.startedAt(), alert.updatedAt(), null, "active-now", alert.startedAt()
            ));
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
            putMatch(matchesByIdentity, new CommuteResponses.MatchedImpactResponse(
                impact.cardId(), impact.kind(), "current", severityForKind(impact.kind()), impact.title(),
                null, null, impact.stationId(), null, null, impact.source(), List.of(), List.of(impact.stationId()),
                null, null, null, "active-now", null
            ));
        }

        for (AlertDashboardService.PlannedClosureDto closure : dashboardService.plannedClosures()) {
            List<String> matchedSegmentIds = intersection(closure.previewSegmentIds(), pathSegmentIds);
            if (matchedSegmentIds.isEmpty()) {
                continue;
            }
            OffsetDateTime eventStartAt = closure.nextWindowStart() != null
                ? closure.nextWindowStart()
                : closure.activeWindowStart() != null
                    ? closure.activeWindowStart()
                    : closure.startedAt();
            putMatch(matchesByIdentity, new CommuteResponses.MatchedImpactResponse(
                closure.id(), "planned-closure", "planned", "planned", closure.title(), closure.lineId(), closure.lineNumber(),
                closure.location(), closure.displayDirection(), closure.description(), closure.source(), matchedSegmentIds, List.of(),
                closure.startedAt(), closure.updatedAt(), closure.window(), closure.timingStatus(), eventStartAt
            ));
        }

        List<CommuteResponses.MatchedImpactResponse> matches = matchesByIdentity.values().stream()
            .sorted(Comparator
                .comparingInt((CommuteResponses.MatchedImpactResponse match) -> severityPriority(match.severity())).reversed()
                .thenComparing(CommuteResponses.MatchedImpactResponse::kind)
                .thenComparing(CommuteResponses.MatchedImpactResponse::id))
            .toList();

        return responseFor(matches);
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

    private CommuteResponses.ImpactResponse responseFor(List<CommuteResponses.MatchedImpactResponse> matches) {
        if (matches.isEmpty()) {
            return new CommuteResponses.ImpactResponse(
                "clear",
                "clear",
                "Clear",
                "No active or planned LineWatch impacts match this route.",
                List.of()
            );
        }
        boolean hasCurrent = matches.stream().anyMatch(match -> "current".equals(match.status()));
        String topSeverity = matches.stream()
            .map(CommuteResponses.MatchedImpactResponse::severity)
            .max(Comparator.comparingInt(this::severityPriority))
            .orElse("planned");
        return new CommuteResponses.ImpactResponse(
            hasCurrent ? "affected" : "planned",
            topSeverity,
            hasCurrent ? "Affected now" : "Planned impact",
            detail(matches, hasCurrent),
            matches
        );
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
