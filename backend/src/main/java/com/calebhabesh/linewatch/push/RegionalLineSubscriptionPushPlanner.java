package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.regional.RegionalAlertStore;
import com.calebhabesh.linewatch.regional.RegionalIngestionFreshness;
import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import com.calebhabesh.linewatch.regional.RegionalNormalizedAlert;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/** Plans corridor-wide Web Push candidates only from fresh dashboard-visible Metrolinx alerts. */
@Service
public class RegionalLineSubscriptionPushPlanner {
    private final RegionalAlertStore alertStore;
    private final RegionalIngestionFreshness freshness;
    private final Clock clock;
    private final PushNotificationFormatter formatter;

    public RegionalLineSubscriptionPushPlanner(
        RegionalAlertStore alertStore,
        RegionalIngestionFreshness freshness,
        Clock clock,
        PushNotificationFormatter formatter
    ) {
        this.alertStore = alertStore;
        this.freshness = freshness;
        this.clock = clock;
        this.formatter = formatter;
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
        return List.copyOf(candidates);
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
        Instant sourceEventAt = alert.activePeriodStart() == null ? null : alert.activePeriodStart().toInstant();
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
            null
        ));
        String sourceIncidentKey = String.join("|", category, alert.lineId(), alert.id());
        String notificationKey = String.join("|", category, alert.lineId(), eventType, alert.id());
        String updateFingerprint = PushNotificationUpdateFingerprint.forCandidate(
            alert.sourceUpdatedAt(), eventType, notification, url
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
            return route == null ? "Full corridor" : route.name() + " corridor";
        }
        List<String> orderedIds = route == null
            ? alert.stationIds()
            : route.stationIds().stream().filter(alert.stationIds()::contains).toList();
        List<String> names = orderedIds.stream()
            .map(id -> RegionalNetworkCatalog.station(id).map(station -> station.name()).orElse(id))
            .toList();
        if (names.isEmpty()) {
            return "Matched corridor segment";
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
