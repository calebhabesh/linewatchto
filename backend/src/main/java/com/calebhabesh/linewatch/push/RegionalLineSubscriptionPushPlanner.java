package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.regional.RegionalAlertStore;
import com.calebhabesh.linewatch.regional.RegionalIngestionFreshness;
import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import com.calebhabesh.linewatch.regional.RegionalNormalizedAlert;
import com.calebhabesh.linewatch.regional.RegionalServiceDateFormatter;
import com.calebhabesh.linewatch.regional.RegionalTripChangeResponses;
import com.calebhabesh.linewatch.regional.RegionalTripChangeService;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

/** Plans corridor Web Push candidates from fresh dashboard impacts and structured trip cancellations. */
@Service
public class RegionalLineSubscriptionPushPlanner {
    private final RegionalAlertStore alertStore;
    private final RegionalIngestionFreshness freshness;
    private final Clock clock;
    private final PushNotificationFormatter formatter;
    private final RegionalTripChangeService tripChangeService;

    @Autowired
    public RegionalLineSubscriptionPushPlanner(
        RegionalAlertStore alertStore,
        RegionalIngestionFreshness freshness,
        Clock clock,
        PushNotificationFormatter formatter,
        RegionalTripChangeService tripChangeService
    ) {
        this.alertStore = alertStore;
        this.freshness = freshness;
        this.clock = clock;
        this.formatter = formatter;
        this.tripChangeService = tripChangeService;
    }

    public RegionalLineSubscriptionPushPlanner(
        RegionalAlertStore alertStore,
        RegionalIngestionFreshness freshness,
        Clock clock,
        PushNotificationFormatter formatter
    ) {
        this(alertStore, freshness, clock, formatter, null);
    }

    public List<PushNotificationCandidate> candidatesFor(
        String accountId,
        List<String> subscribedLineIds,
        PlannedClosureFollowUpPolicy followUpPolicy
    ) {
        if (!freshness.isFresh() || subscribedLineIds == null || subscribedLineIds.isEmpty()) {
            return List.of();
        }
        PlannedClosureFollowUpPolicy effectivePolicy = followUpPolicy == null
            ? PlannedClosureFollowUpPolicy.SMART
            : followUpPolicy;
        Instant now = clock.instant();
        List<PushNotificationCandidate> candidates = new ArrayList<>();
        for (RegionalNormalizedAlert alert : alertStore.findActiveAlerts()) {
            if ("advisory".equals(alert.impactKind())) continue;
            if (!subscribedLineIds.contains(alert.lineId())) {
                continue;
            }
            boolean planned = "planned-closure".equals(alert.impactKind())
                && alert.activePeriodStart() != null
                && now.isBefore(alert.activePeriodStart().toInstant());
            String category = planned ? "line-planned" : "line-current";
            String reminderBucket = planned
                ? effectivePolicy.reminderBucket(now, alert.activePeriodStart().toInstant())
                : "on-change";
            candidates.add(candidate(accountId, alert, category, reminderBucket));
        }
        if (tripChangeService != null) {
            tripChangeService.get(null, null, 250).changes().stream()
                .filter(change -> "cancellation".equals(change.kind()))
                .filter(change -> subscribedLineIds.contains(change.lineId()))
                .map(change -> cancellationCandidate(accountId, change))
                .forEach(candidates::add);
        }
        return List.copyOf(candidates);
    }

    private PushNotificationCandidate cancellationCandidate(
        String accountId,
        RegionalTripChangeResponses.TripChange change
    ) {
        String location = cancellationLocation(change);
        String eventType = "trip-cancellation";
        String category = "line-trip-change";
        String url = "/?network=regional&panel=trip-changes";
        FormattedPushNotification notification = formatter.formatActive(new PushNotificationFacts(
            change.lineId(), change.lineNumber(), eventType, "on-change", location, null, false,
            null, null,
            change.scheduleMatched() && change.scheduledStartAt() != null
                ? change.scheduledStartAt().toInstant() : null,
            change.cause(), change.title(), change.description(), null, null
        ));
        String sourceIncidentKey = String.join("|", category, change.lineId(), change.id());
        String notificationKey = String.join("|", category, change.lineId(), eventType, change.id());
        String updateFingerprint = PushNotificationUpdateFingerprint.forRegionalCandidate(eventType, notification, url);
        String dedupeKey = String.join(
            "|", accountId, "line", change.lineId(), eventType, change.id(), "update", updateFingerprint
        );
        return new PushNotificationCandidate(
            accountId, null, null, change.lineId(), change.lineNumber(), category, eventType, "on-change",
            sourceIncidentKey, notificationKey, dedupeKey, notification, url, updateFingerprint, true,
            change.updatedAt() == null ? null : change.updatedAt().toInstant()
        );
    }

    private String cancellationLocation(RegionalTripChangeResponses.TripChange change) {
        if (change.affectedStops().isEmpty()) return RegionalNetworkCatalog.route(change.lineId())
            .map(RegionalNetworkCatalog.Route::displayName).orElse(change.lineName());
        String first = change.affectedStops().getFirst().stationName();
        String last = change.affectedStops().getLast().stationName();
        return first.equals(last) ? first : first + " → " + last;
    }

    private PushNotificationCandidate candidate(
        String accountId,
        RegionalNormalizedAlert alert,
        String category,
        String reminderBucket
    ) {
        RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(alert.lineId()).orElse(null);
        String lineNumber = route == null ? "" : route.number();
        String location = location(alert, route);
        Instant sourceEventAt = alert.activePeriodStart() == null || alert.hasDateOnlyServiceWindow()
            ? null : alert.activePeriodStart().toInstant();
        String eventType = alert.impactKind();
        String url = "/?network=regional&panel=" + panel(eventType)
            + "&impactKind=" + eventType + "&impactId=" + alert.id();
        FormattedPushNotification notification = formatter.formatActive(new PushNotificationFacts(
            alert.lineId(),
            lineNumber,
            eventType,
            reminderBucket,
            location,
            null,
            false,
            null,
            null,
            sourceEventAt,
            alert.cause(),
            alert.title(),
            alert.description(),
            null,
            alert.hasDateOnlyServiceWindow()
                ? RegionalServiceDateFormatter.format(alert.activePeriodStart(), alert.activePeriodEnd())
                : null
        ));
        String sourceIncidentKey = String.join("|", category, alert.lineId(), alert.id());
        String notificationKey = String.join("|", category, alert.lineId(), eventType, alert.id());
        String updateFingerprint = PushNotificationUpdateFingerprint.forRegionalCandidate(
            eventType, notification, url
        );
        String dedupeKey = String.join(
            "|", accountId, "line", alert.lineId(), eventType, reminderBucket,
            alert.id(), "update", updateFingerprint
        );
        return new PushNotificationCandidate(
            accountId,
            null,
            null,
            alert.lineId(),
            lineNumber,
            category,
            eventType,
            reminderBucket,
            sourceIncidentKey,
            notificationKey,
            dedupeKey,
            notification,
            url,
            updateFingerprint,
            true,
            alert.sourceUpdatedAt() == null ? null : alert.sourceUpdatedAt().toInstant()
        );
    }

    private String location(RegionalNormalizedAlert alert, RegionalNetworkCatalog.Route route) {
        if (alert.stationIds() == null || alert.stationIds().isEmpty()) {
            return route == null ? "Regional line" : route.displayName();
        }
        List<String> orderedIds = route == null
            ? alert.stationIds()
            : route.stationIds().stream().filter(alert.stationIds()::contains).toList();
        List<String> names = orderedIds.stream()
            .map(id -> RegionalNetworkCatalog.station(id).map(station -> station.name()).orElse(id))
            .toList();
        if (names.isEmpty()) {
            return "Matched route segment";
        }
        return names.size() == 1 ? names.getFirst() : names.getFirst() + " ↔ " + names.getLast();
    }

    private String panel(String eventType) {
        return switch (eventType) {
            case "suspension" -> "alerts";
            case "planned-closure" -> "closures";
            default -> "delays";
        };
    }
}
