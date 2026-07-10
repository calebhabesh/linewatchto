package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.SavedCommuteAlertRules;
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
    private final PushNotificationFormatter formatter;
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

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
                candidates.add(candidateFor(commute, legId, path, match, "saved-commute-current", eventType, "on-change"));
            } else if ("planned".equals(match.status())) {
                String eventType = "planned-closure";
                
                // 1. on-change candidate
                candidates.add(candidateFor(commute, legId, path, match, "saved-commute-planned", eventType, "on-change"));
                
                OffsetDateTime eventStartAt = match.eventStartAt();
                if (eventStartAt != null) {
                    Instant startInstant = eventStartAt.toInstant();
                    
                    // 2. closure-24h candidate
                    Instant twentyFourHoursBefore = startInstant.minus(java.time.Duration.ofHours(24));
                    if (!now.isBefore(twentyFourHoursBefore) && now.isBefore(startInstant)) {
                        candidates.add(candidateFor(commute, legId, path, match, "saved-commute-planned", eventType, "closure-24h"));
                    }
                    
                    // 3. closure-morning candidate
                    ZonedDateTime nowToronto = now.atZone(TORONTO_ZONE);
                    ZonedDateTime startToronto = eventStartAt.atZoneSameInstant(TORONTO_ZONE);
                    if (nowToronto.toLocalDate().equals(startToronto.toLocalDate()) && nowToronto.getHour() >= 6) {
                        candidates.add(candidateFor(commute, legId, path, match, "saved-commute-planned", eventType, "closure-morning"));
                    }
                }
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
        boolean planned = "saved-commute-planned".equals(category);
        OffsetDateTime eventTime = planned ? match.eventStartAt() : match.startedAt();
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
            match.description()
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
            deliveryAllowed
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
        if (!SavedCommuteAlertRules.matchesMonitoredSection(commute, path, match)) {
            return false;
        }
        Instant scheduleInstant = scheduleInstant(match);
        return matchesNotificationSchedule(commute, scheduleInstant);
    }

    private Instant scheduleInstant(CommuteResponses.MatchedImpactResponse match) {
        if ("planned".equals(match.status()) && match.eventStartAt() != null) {
            return match.eventStartAt().toInstant();
        }
        return clock.instant();
    }

    private boolean matchesNotificationSchedule(SavedCommuteEntity commute, Instant instant) {
        ZonedDateTime local = instant.atZone(TORONTO_ZONE);
        int dayBit = dayBit(local);
        if ((commute.getNotificationDayMask() & dayBit) == 0) {
            return false;
        }
        Integer start = commute.getNotificationStartMinute();
        Integer end = commute.getNotificationEndMinute();
        if (start == null || end == null) {
            return true;
        }
        int minute = local.getHour() * 60 + local.getMinute();
        if (start < end) {
            return minute >= start && minute <= end;
        }
        return minute >= start || minute <= end;
    }

    private int dayBit(ZonedDateTime local) {
        return switch (local.getDayOfWeek()) {
            case SUNDAY -> 1;
            case MONDAY -> 2;
            case TUESDAY -> 4;
            case WEDNESDAY -> 8;
            case THURSDAY -> 16;
            case FRIDAY -> 32;
            case SATURDAY -> 64;
        };
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
