package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.SavedCommuteAlertRules;
import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteNotificationSchedule;
import com.calebhabesh.linewatch.commute.CommuteImpactService;
import com.calebhabesh.linewatch.commute.CommutePathService;
import com.calebhabesh.linewatch.commute.CommuteResponses;
import com.calebhabesh.linewatch.regional.RegionalCommuteImpactService;
import com.calebhabesh.linewatch.regional.RegionalCommutePathService;
import com.calebhabesh.linewatch.regional.RegionalTripChangeResponses;
import com.calebhabesh.linewatch.regional.RegionalTripChangeService;
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
    private final RegionalCommutePathService regionalCommutePathService;
    private final RegionalCommuteImpactService regionalCommuteImpactService;
    private final Clock clock;
    private final PushNotificationFormatter formatter;
    private final RegionalTripChangeService regionalTripChangeService;

    @Autowired
    public SavedCommutePushPlanner(
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService,
        RegionalCommutePathService regionalCommutePathService,
        RegionalCommuteImpactService regionalCommuteImpactService,
        Clock clock,
        PushNotificationFormatter formatter,
        RegionalTripChangeService regionalTripChangeService
    ) {
        this.commutePathService = commutePathService;
        this.commuteImpactService = commuteImpactService;
        this.regionalCommutePathService = regionalCommutePathService;
        this.regionalCommuteImpactService = regionalCommuteImpactService;
        this.clock = clock;
        this.formatter = formatter;
        this.regionalTripChangeService = regionalTripChangeService;
    }

    public SavedCommutePushPlanner(
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService,
        RegionalCommutePathService regionalCommutePathService,
        RegionalCommuteImpactService regionalCommuteImpactService,
        Clock clock,
        PushNotificationFormatter formatter
    ) {
        this(
            commutePathService, commuteImpactService, regionalCommutePathService,
            regionalCommuteImpactService, clock, formatter, null
        );
    }

    public SavedCommutePushPlanner(
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService,
        Clock clock,
        PushNotificationFormatter formatter
    ) {
        this(commutePathService, commuteImpactService, null, null, clock, formatter, null);
    }

    public SavedCommutePushPlanner(
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService
    ) {
        this(
            commutePathService,
            commuteImpactService,
            null,
            null,
            Clock.systemUTC(),
            new PushNotificationFormatter(),
            null
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
        if ("regional".equals(commute.getNetworkId())
            && (regionalCommutePathService == null || regionalCommuteImpactService == null)) {
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
        boolean regional = "regional".equals(commute.getNetworkId());
        CommuteResponses.PathResponse path = regional
            ? regionalCommutePathService.path(originStationId, destinationStationId)
            : commutePathService.path(originStationId, destinationStationId);
        CommuteResponses.ImpactResponse impact = regional
            ? regionalCommuteImpactService.impactFor(path)
            : commuteImpactService.impactFor(path);
        Instant now = clock.instant();
        List<PushNotificationCandidate> candidates = new ArrayList<>();

        for (CommuteResponses.MatchedImpactResponse match : impact == null || impact.matchedImpacts() == null
            ? List.<CommuteResponses.MatchedImpactResponse>of()
            : impact.matchedImpacts()) {
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
        if (regional && regionalTripChangeService != null) {
            candidates.addAll(cancellationCandidatesForLeg(commute, legId, path));
        }
        return candidates;
    }

    private List<PushNotificationCandidate> cancellationCandidatesForLeg(
        SavedCommuteEntity commute,
        String legId,
        CommuteResponses.PathResponse path
    ) {
        if (path == null || !path.available() || path.stationIds() == null || path.stationIds().size() < 2) {
            return List.of();
        }
        return regionalTripChangeService.get(null, null, 250).changes().stream()
            .filter(change -> "cancellation".equals(change.kind()) && change.scheduleMatched())
            .map(change -> cancellationOverlap(path.stationIds(), change))
            .filter(java.util.Objects::nonNull)
            .map(overlap -> cancellationCandidate(commute, legId, overlap))
            .toList();
    }

    private CancellationOverlap cancellationOverlap(
        List<String> pathStations,
        RegionalTripChangeResponses.TripChange change
    ) {
        List<RegionalTripChangeResponses.AffectedStop> overlapping = pathStations.stream()
            .map(pathStation -> change.affectedStops().stream()
                .filter(stop -> stop.stationId().equals(pathStation))
                .findFirst().orElse(null))
            .filter(java.util.Objects::nonNull)
            .toList();
        if (overlapping.size() < 2) return null;
        int previous = -1;
        for (RegionalTripChangeResponses.AffectedStop stop : overlapping) {
            int current = change.affectedStops().indexOf(stop);
            if (current <= previous) return null;
            previous = current;
        }
        OffsetDateTime relevantTime = overlapping.stream()
            .map(RegionalTripChangeResponses.AffectedStop::scheduledAt)
            .filter(java.util.Objects::nonNull)
            .findFirst().orElse(change.scheduledStartAt());
        return relevantTime == null ? null : new CancellationOverlap(change, overlapping, relevantTime);
    }

    private PushNotificationCandidate cancellationCandidate(
        SavedCommuteEntity commute,
        String legId,
        CancellationOverlap overlap
    ) {
        RegionalTripChangeResponses.TripChange change = overlap.change();
        String eventType = "trip-cancellation";
        String category = "saved-commute-trip-change";
        String location = overlap.stops().getFirst().stationName() + " → " + overlap.stops().getLast().stationName();
        String url = "/?network=regional&panel=trip-changes";
        FormattedPushNotification notification = formatter.formatActive(new PushNotificationFacts(
            change.lineId(), change.lineNumber(), eventType, "on-change", location, null, false,
            commute.getLabel(), legId, overlap.relevantTime().toInstant(), change.cause(),
            change.title(), change.description(), null, null
        ));
        String sourceIncidentKey = String.join("|", category, commute.getId(), legId, change.id());
        String notificationKey = String.join("|", category, commute.getId(), legId, eventType, change.id());
        String updateFingerprint = PushNotificationUpdateFingerprint.forRegionalCandidate(eventType, notification, url);
        String dedupeKey = String.join(
            "|", commute.getAccount().getId(), commute.getId(), legId, eventType, change.id(),
            "update", updateFingerprint
        );
        boolean deliveryAllowed = commute.isNotificationEnabled()
            && SavedCommuteAlertRules.legAllowed(commute, legId)
            && SavedCommuteAlertRules.eventTypeAllowed(commute, eventType)
            && SavedCommuteNotificationSchedule.matches(commute, legId, overlap.relevantTime().toInstant())
            && SavedCommuteNotificationSchedule.matches(commute, legId, clock.instant());
        return new PushNotificationCandidate(
            commute.getAccount().getId(), commute.getId(), legId, change.lineId(), change.lineNumber(),
            category, eventType, "on-change", sourceIncidentKey, notificationKey, dedupeKey,
            notification, url, updateFingerprint, deliveryAllowed,
            change.updatedAt() == null ? null : change.updatedAt().toInstant()
        );
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
        boolean regional = "regional".equals(commute.getNetworkId());
        boolean plannedClosure = "planned-closure".equals(eventType);
        boolean dateOnlyServiceWindow = regional && match.notificationServiceEndAt() != null;
        OffsetDateTime eventTime = plannedClosure ? match.eventStartAt() : match.startedAt();
        Instant sourceEventAt = eventTime == null || dateOnlyServiceWindow ? null : eventTime.toInstant();

        FormattedPushNotification notification = formatter.formatActive(new PushNotificationFacts(
            match.lineId(),
            match.lineNumber(),
            eventType,
            reminderBucket,
            match.location(),
            match.displayDirection(),
            plannedClosure && match.notificationShuttle(),
            commute.getLabel(),
            legId,
            sourceEventAt,
            plannedClosure ? match.notificationCause() : null,
            plannedClosure ? notificationTitle(match.notificationTitle(), match.title()) : null,
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

        String url = ("regional".equals(commute.getNetworkId()) ? "/?network=regional&" : "/?")
            + "panel=commutes&commute=" + commute.getId();
        String updateFingerprint = regional
            ? PushNotificationUpdateFingerprint.forRegionalCandidate(eventType, notification, url)
            : PushNotificationUpdateFingerprint.forCandidate(match.updatedAt(), eventType, notification, url);
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
            url,
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
            boolean dateOnlyServiceWindow = "regional".equals(commute.getNetworkId())
                && match.notificationServiceEndAt() != null;
            boolean relevantToLeg = dateOnlyServiceWindow
                ? SavedCommuteNotificationSchedule.overlapsServiceDates(
                    commute, legId, match.eventStartAt(), match.notificationServiceEndAt()
                )
                : SavedCommuteNotificationSchedule.matches(commute, legId, match.eventStartAt().toInstant());
            if (!relevantToLeg) {
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

    private String notificationTitle(String notificationTitle, String displayTitle) {
        return notificationTitle == null || notificationTitle.isBlank()
            ? displayTitle
            : notificationTitle;
    }

    private record CancellationOverlap(
        RegionalTripChangeResponses.TripChange change,
        List<RegionalTripChangeResponses.AffectedStop> stops,
        OffsetDateTime relevantTime
    ) {}
}
