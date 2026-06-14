package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.commute.CommuteImpactService;
import com.calebhabesh.linewatch.commute.CommutePathService;
import com.calebhabesh.linewatch.commute.CommuteResponses;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class SavedCommutePushPlanner {
    private final CommutePathService commutePathService;
    private final CommuteImpactService commuteImpactService;
    private final Clock clock;
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    @Autowired
    public SavedCommutePushPlanner(
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService,
        Clock clock
    ) {
        this.commutePathService = commutePathService;
        this.commuteImpactService = commuteImpactService;
        this.clock = clock;
    }

    public SavedCommutePushPlanner(
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService
    ) {
        this(commutePathService, commuteImpactService, Clock.systemUTC());
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

        Instant now = clock.instant();
        List<PushNotificationCandidate> candidates = new ArrayList<>();

        for (CommuteResponses.MatchedImpactResponse match : impact.matchedImpacts()) {
            if ("current".equals(match.status())) {
                String eventType = match.kind(); // e.g. "delay", "suspension", "reduced-speed-zone"
                candidates.add(candidateFor(commute, legId, match, "saved-commute-current", eventType, "on-change"));
            } else if ("planned".equals(match.status())) {
                String eventType = "planned-closure";
                
                // 1. on-change candidate
                candidates.add(candidateFor(commute, legId, match, "saved-commute-planned", eventType, "on-change"));
                
                OffsetDateTime eventStartAt = match.eventStartAt();
                if (eventStartAt != null) {
                    Instant startInstant = eventStartAt.toInstant();
                    
                    // 2. closure-24h candidate
                    Instant twentyFourHoursBefore = startInstant.minus(java.time.Duration.ofHours(24));
                    if (!now.isBefore(twentyFourHoursBefore) && now.isBefore(startInstant)) {
                        candidates.add(candidateFor(commute, legId, match, "saved-commute-planned", eventType, "closure-24h"));
                    }
                    
                    // 3. closure-morning candidate
                    ZonedDateTime nowToronto = now.atZone(TORONTO_ZONE);
                    ZonedDateTime startToronto = eventStartAt.atZoneSameInstant(TORONTO_ZONE);
                    if (nowToronto.toLocalDate().equals(startToronto.toLocalDate()) && nowToronto.getHour() >= 6) {
                        candidates.add(candidateFor(commute, legId, match, "saved-commute-planned", eventType, "closure-morning"));
                    }
                }
            }
        }
        return candidates;
    }

    private PushNotificationCandidate candidateFor(
        SavedCommuteEntity commute,
        String legId,
        CommuteResponses.MatchedImpactResponse match,
        String category,
        String eventType,
        String reminderBucket
    ) {
        boolean planned = "saved-commute-planned".equals(category);
        String title = titleCase(commute.getLabel() + (planned ? " planned closure" : " affected"));
        String body = impactKindLabel(match.kind()) + linePart(match.lineNumber()) + locationPart(match.location());
        
        String segmentIds = String.join(",", emptyWhenNull(match.matchedSegmentIds()));
        String stationIds = String.join(",", emptyWhenNull(match.matchedStationIds()));
        
        String dedupeKey = String.join(
            "|",
            commute.getAccount().getId(),
            commute.getId(),
            legId,
            eventType,
            reminderBucket,
            safe(match.id()),
            "segments:" + segmentIds,
            "stations:" + stationIds
        );
        
        String notificationKey = String.join(
            "|",
            category,
            commute.getId(),
            legId,
            eventType,
            stableImpactPart(match)
        );

        return new PushNotificationCandidate(
            commute.getAccount().getId(),
            commute.getId(),
            legId,
            match.lineId(),
            category,
            eventType,
            reminderBucket,
            notificationKey,
            dedupeKey,
            title,
            body,
            "/?panel=commutes&commute=" + commute.getId()
        );
    }

    private String stableImpactPart(CommuteResponses.MatchedImpactResponse match) {
        String id = safe(match.id());
        if (!id.isBlank()) {
            return id;
        }
        String segments = String.join(",", emptyWhenNull(match.matchedSegmentIds()));
        if (!segments.isBlank()) {
            return "segments:" + segments;
        }
        String stations = String.join(",", emptyWhenNull(match.matchedStationIds()));
        return stations.isBlank() ? "unknown" : "stations:" + stations;
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

    private String titleCase(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            return "";
        }

        StringBuilder builder = new StringBuilder(trimmed.length());
        boolean nextLetterStartsWord = true;
        for (int index = 0; index < trimmed.length(); index++) {
            char current = trimmed.charAt(index);
            if (Character.isLetter(current)) {
                builder.append(nextLetterStartsWord ? Character.toUpperCase(current) : current);
                nextLetterStartsWord = false;
            } else {
                builder.append(current);
                nextLetterStartsWord = Character.isWhitespace(current) || current == '-' || current == '/';
            }
        }
        return builder.toString();
    }
}
