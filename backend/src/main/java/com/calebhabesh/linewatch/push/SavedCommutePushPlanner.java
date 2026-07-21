package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.SavedCommuteAlertRules;
import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteNotificationSchedule;
import com.calebhabesh.linewatch.commute.CommuteImpactService;
import com.calebhabesh.linewatch.commute.CommutePathService;
import com.calebhabesh.linewatch.commute.CommuteResponses;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
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
    private final PushNotificationFormatter formatter;

    @Autowired
    public SavedCommutePushPlanner(
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService,
        Clock clock,
        PushNotificationFormatter formatter
    ) {
        this.commutePathService = commutePathService;
        this.commuteImpactService = commuteImpactService;
        this.clock = clock;
        this.formatter = formatter;
    }

    public SavedCommutePushPlanner(
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService
    ) {
        this(
            commutePathService,
            commuteImpactService,
            Clock.systemUTC(),
            new PushNotificationFormatter()
        );
    }

    public List<PushNotificationCandidate> candidatesFor(SavedCommuteEntity commute) {
        return candidatesFor(commute, PlannedClosureFollowUpPolicy.SMART);
    }

    public List<PushNotificationCandidate> candidatesFor(
        SavedCommuteEntity commute,
        PlannedClosureFollowUpPolicy followUpPolicy
    ) {
        if (commute == null || commute.getAccount() == null) {
            return List.of();
        }

        PlannedClosureFollowUpPolicy effectivePolicy = followUpPolicy == null
            ? PlannedClosureFollowUpPolicy.SMART
            : followUpPolicy;

        List<PushNotificationCandidate> candidates = new ArrayList<>();
        candidates.addAll(candidatesForLeg(
            commute,
            "outbound",
            commute.getOriginStationId(),
            commute.getDestinationStationId(),
            effectivePolicy
        ));
        if (commute.isWatchReturnTrip()) {
            candidates.addAll(candidatesForLeg(
                commute,
                "return",
                commute.getDestinationStationId(),
                commute.getOriginStationId(),
                effectivePolicy
            ));
        }
        return candidates;
    }

    private List<PushNotificationCandidate> candidatesForLeg(
        SavedCommuteEntity commute,
        String legId,
        String originStationId,
        String destinationStationId,
        PlannedClosureFollowUpPolicy followUpPolicy
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
                candidates.add(candidateFor(commute, legId, path, match, "saved-commute-current", eventType, "on-change"));
            } else if ("planned".equals(match.status())) {
                String eventType = "planned-closure";
                OffsetDateTime eventStartAt = match.eventStartAt();
                String reminderBucket = "on-change";
                if (eventStartAt != null) {
                    Instant startInstant = eventStartAt.toInstant();
                    if (!now.isBefore(startInstant)) {
                        continue;
                    }
                    reminderBucket = followUpPolicy.reminderBucket(now, startInstant);
                }
                candidates.add(candidateFor(
                    commute,
                    legId,
                    path,
                    match,
                    "saved-commute-planned",
                    eventType,
                    reminderBucket
                ));
            }
        }
        return candidates;
    }

    private PushNotificationCandidate candidateFor(
        SavedCommuteEntity commute,
        String legId,
        CommuteResponses.PathResponse path,
        CommuteResponses.MatchedImpactResponse match,
        String category,
        String eventType,
        String reminderBucket
    ) {
        boolean plannedClosure = "planned-closure".equals(eventType);
        OffsetDateTime eventTime = plannedClosure ? match.eventStartAt() : match.startedAt();
        Instant sourceEventAt = eventTime == null ? null : eventTime.toInstant();

        FormattedPushNotification notification = formatter.formatActive(new PushNotificationFacts(
            match.lineId(),
            match.lineNumber(),
            eventType,
            reminderBucket,
            match.location(),
            match.displayDirection(),
            false,
            commute.getLabel(),
            legId,
            sourceEventAt,
            null,
            null,
            match.description(),
            match.closureHours(),
            match.closureDates()
        ));

        String segmentIds = String.join(",", emptyWhenNull(match.matchedSegmentIds()));
        String stationIds = String.join(",", emptyWhenNull(match.matchedStationIds()));
        
        String stableImpactPart = stableImpactPart(match);

        String sourceIncidentKey = String.join(
            "|",
            category,
            commute.getId(),
            legId,
            stableImpactPart
        );

        String notificationKey = String.join(
            "|",
            category,
            commute.getId(),
            legId,
            eventType,
            stableImpactPart
        );

        String updateFingerprint = PushNotificationUpdateFingerprint.forCandidate(
            match.updatedAt(), eventType, notification, "/?panel=commutes&commute=" + commute.getId()
        );
        String dedupeKey = String.join(
            "|",
            commute.getAccount().getId(),
            commute.getId(),
            legId,
            eventType,
            reminderBucket,
            safe(match.id()),
            "segments:" + segmentIds,
            "stations:" + stationIds,
            "update:" + updateFingerprint
        );

        boolean deliveryAllowed = deliveryAllowedFor(commute, legId, path, match, eventType);

        return new PushNotificationCandidate(
            commute.getAccount().getId(),
            commute.getId(),
            legId,
            match.lineId(),
            match.lineNumber(),
            category,
            eventType,
            reminderBucket,
            sourceIncidentKey,
            notificationKey,
            dedupeKey,
            notification,
            "/?panel=commutes&commute=" + commute.getId(),
            updateFingerprint,
            deliveryAllowed,
            match.updatedAt() == null ? null : match.updatedAt().toInstant()
        );
    }

    private boolean deliveryAllowedFor(
        SavedCommuteEntity commute,
        String legId,
        CommuteResponses.PathResponse path,
        CommuteResponses.MatchedImpactResponse match,
        String eventType
    ) {
        if (!commute.isNotificationEnabled()) {
            return false;
        }
        if (!SavedCommuteAlertRules.legAllowed(commute, legId)) {
            return false;
        }
        if (!SavedCommuteAlertRules.eventTypeAllowed(commute, eventType)) {
            return false;
        }
        if ("planned".equals(match.status()) && match.eventStartAt() != null) {
            if (!SavedCommuteNotificationSchedule.matches(commute, legId, match.eventStartAt().toInstant())) {
                return false;
            }
        }
        return SavedCommuteNotificationSchedule.matches(commute, legId, clock.instant());
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

    private String safe(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
