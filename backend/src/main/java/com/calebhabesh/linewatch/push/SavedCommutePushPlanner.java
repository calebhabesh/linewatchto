package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.commute.CommuteImpactService;
import com.calebhabesh.linewatch.commute.CommutePathService;
import com.calebhabesh.linewatch.commute.CommuteResponses;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;

@Service
public class SavedCommutePushPlanner {
    private final CommutePathService commutePathService;
    private final CommuteImpactService commuteImpactService;

    public SavedCommutePushPlanner(
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService
    ) {
        this.commutePathService = commutePathService;
        this.commuteImpactService = commuteImpactService;
    }

    public List<PushNotificationCandidate> candidatesFor(SavedCommuteEntity commute) {
        if (commute == null || commute.getAccount() == null) {
            return List.of();
        }

        List<PushNotificationCandidate> candidates = new ArrayList<>();
        candidates.addAll(candidatesForLeg(
            commute,
            "outbound",
            commute.getOriginStationId(),
            commute.getDestinationStationId()
        ));
        if (commute.isWatchReturnTrip()) {
            candidates.addAll(candidatesForLeg(
                commute,
                "return",
                commute.getDestinationStationId(),
                commute.getOriginStationId()
            ));
        }
        return candidates;
    }

    private List<PushNotificationCandidate> candidatesForLeg(
        SavedCommuteEntity commute,
        String legId,
        String originStationId,
        String destinationStationId
    ) {
        CommuteResponses.PathResponse path = commutePathService.path(originStationId, destinationStationId);
        CommuteResponses.ImpactResponse impact = commuteImpactService.impactFor(path);
        if (impact == null || impact.matchedImpacts() == null || impact.matchedImpacts().isEmpty()) {
            return List.of();
        }

        return impact.matchedImpacts().stream()
            .filter(match -> "current".equals(match.status()) || "planned".equals(match.status()))
            .map(match -> candidateFor(commute, legId, match))
            .toList();
    }

    private PushNotificationCandidate candidateFor(
        SavedCommuteEntity commute,
        String legId,
        CommuteResponses.MatchedImpactResponse match
    ) {
        boolean planned = "planned".equals(match.status());
        String category = planned ? "saved-commute-planned" : "saved-commute-impact";
        String title = commute.getLabel() + (planned ? " planned closure" : " affected");
        String body = impactKindLabel(match.kind()) + linePart(match.lineNumber()) + locationPart(match.location());
        return new PushNotificationCandidate(
            commute.getAccount().getId(),
            commute.getId(),
            legId,
            category,
            dedupeKey(commute, legId, match),
            title,
            body,
            "/?panel=commutes&commute=" + commute.getId()
        );
    }

    private String dedupeKey(
        SavedCommuteEntity commute,
        String legId,
        CommuteResponses.MatchedImpactResponse match
    ) {
        return String.join(
            "|",
            commute.getAccount().getId(),
            commute.getId(),
            legId,
            safe(match.kind()),
            safe(match.id()),
            "segments:" + String.join(",", emptyWhenNull(match.matchedSegmentIds())),
            "stations:" + String.join(",", emptyWhenNull(match.matchedStationIds()))
        );
    }

    private List<String> emptyWhenNull(List<String> values) {
        return values == null ? List.of() : values;
    }

    private String impactKindLabel(String kind) {
        return switch (safe(kind)) {
            case "reduced-speed-zone" -> "Reduced Speed Zone";
            case "planned-closure" -> "Planned Closure";
            case "suspension" -> "Suspension";
            case "delay" -> "Delay";
            default -> "Service Alert";
        };
    }

    private String linePart(String lineNumber) {
        return lineNumber == null || lineNumber.isBlank() ? "" : " on Line " + lineNumber.trim();
    }

    private String locationPart(String location) {
        return location == null || location.isBlank() ? "" : ": " + location.trim();
    }

    private String safe(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
