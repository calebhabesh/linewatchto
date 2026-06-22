package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class LineSubscriptionPushPlanner {
    private final AlertDashboardService dashboardService;
    private final Clock clock;
    private final PushNotificationFormatter formatter;
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    @Autowired
    public LineSubscriptionPushPlanner(
        AlertDashboardService dashboardService,
        Clock clock,
        PushNotificationFormatter formatter
    ) {
        this.dashboardService = dashboardService;
        this.clock = clock;
        this.formatter = formatter;
    }

    public List<PushNotificationCandidate> candidatesFor(String accountId, List<String> subscribedLineIds) {
        if (subscribedLineIds == null || subscribedLineIds.isEmpty()) {
            return List.of();
        }

        List<PushNotificationCandidate> candidates = new ArrayList<>();
        Instant now = clock.instant();

        for (AlertDashboardService.ActiveAlertDto alert : dashboardService.activeAlerts()) {
            if ("suspension".equals(alert.severity()) && subscribedLineIds.contains(alert.lineId())) {
                candidates.add(createLineCandidate(
                    accountId,
                    alert.lineId(),
                    alert.lineNumber(),
                    "line-current",
                    "suspension",
                    "on-change",
                    alert.id(),
                    alert.location(),
                    alert.displayDirection(),
                    alert.shuttle(),
                    alert.startedAt() == null ? null : alert.startedAt().toInstant(),
                    "/?panel=alerts"
                ));
            }
        }

        for (AlertDashboardService.DelayAlertDto delay : dashboardService.delays()) {
            if (subscribedLineIds.contains(delay.lineId())) {
                candidates.add(createLineCandidate(
                    accountId,
                    delay.lineId(),
                    delay.lineNumber(),
                    "line-current",
                    "delay",
                    "on-change",
                    delay.id(),
                    delay.location(),
                    delay.displayDirection(),
                    false,
                    delay.startedAt() == null ? null : delay.startedAt().toInstant(),
                    "/?panel=delays"
                ));
            }
        }

        for (AlertDashboardService.ReducedSpeedZoneDto zone : dashboardService.reducedSpeedZones()) {
            if (subscribedLineIds.contains(zone.lineId())) {
                candidates.add(createLineCandidate(
                    accountId,
                    zone.lineId(),
                    zone.lineNumber(),
                    "line-current",
                    "reduced-speed-zone",
                    "on-change",
                    zone.id(),
                    zone.location(),
                    zone.displayDirection(),
                    false,
                    zone.startedAt() == null ? null : zone.startedAt().toInstant(),
                    "/?panel=reduced-speed-zones"
                ));
            }
        }

        for (AlertDashboardService.PlannedClosureDto closure : dashboardService.plannedClosures()) {
            if (subscribedLineIds.contains(closure.lineId())) {
                String eventType = "planned-closure";
                String category = "line-planned";
                String url = "/?panel=closures";

                OffsetDateTime eventStartAt = closure.nextWindowStart() != null
                    ? closure.nextWindowStart()
                    : closure.activeWindowStart() != null
                        ? closure.activeWindowStart()
                        : closure.startedAt();
                Instant sourceEventAt = eventStartAt == null ? null : eventStartAt.toInstant();

                candidates.add(createLineCandidate(
                    accountId,
                    closure.lineId(),
                    closure.lineNumber(),
                    category,
                    eventType,
                    "on-change",
                    closure.id(),
                    closure.location(),
                    closure.displayDirection(),
                    closure.shuttle(),
                    sourceEventAt,
                    url
                ));

                if (eventStartAt != null) {
                    Instant startInstant = eventStartAt.toInstant();
                    
                    Instant twentyFourHoursBefore = startInstant.minus(java.time.Duration.ofHours(24));
                    if (!now.isBefore(twentyFourHoursBefore) && now.isBefore(startInstant)) {
                        candidates.add(createLineCandidate(
                            accountId,
                            closure.lineId(),
                            closure.lineNumber(),
                            category,
                            eventType,
                            "closure-24h",
                            closure.id(),
                            closure.location(),
                            closure.displayDirection(),
                            closure.shuttle(),
                            sourceEventAt,
                            url
                        ));
                    }

                    ZonedDateTime nowToronto = now.atZone(TORONTO_ZONE);
                    ZonedDateTime startToronto = eventStartAt.atZoneSameInstant(TORONTO_ZONE);
                    if (nowToronto.toLocalDate().equals(startToronto.toLocalDate()) && nowToronto.getHour() >= 6) {
                        candidates.add(createLineCandidate(
                            accountId,
                            closure.lineId(),
                            closure.lineNumber(),
                            category,
                            eventType,
                            "closure-morning",
                            closure.id(),
                            closure.location(),
                            closure.displayDirection(),
                            closure.shuttle(),
                            sourceEventAt,
                            url
                        ));
                    }
                }
            }
        }

        return candidates;
    }

    private PushNotificationCandidate createLineCandidate(
        String accountId,
        String lineId,
        String lineNumber,
        String category,
        String eventType,
        String reminderBucket,
        String sourceId,
        String location,
        String displayDirection,
        boolean shuttle,
        Instant sourceEventAt,
        String url
    ) {
        String notificationKey = String.join("|", category, lineId, eventType, sourceId);
        String dedupeKey = String.join("|", accountId, "line", lineId, eventType, reminderBucket, sourceId);
        FormattedPushNotification notification = formatter.formatActive(new PushNotificationFacts(
            lineId,
            lineNumber,
            eventType,
            reminderBucket,
            location,
            displayDirection,
            shuttle,
            null,
            null,
            sourceEventAt
        ));

        return new PushNotificationCandidate(
            accountId,
            null,
            null,
            lineId,
            lineNumber,
            category,
            eventType,
            reminderBucket,
            notificationKey,
            dedupeKey,
            notification,
            url
        );
    }
}
