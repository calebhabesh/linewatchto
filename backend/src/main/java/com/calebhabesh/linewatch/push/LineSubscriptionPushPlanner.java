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
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    @Autowired
    public LineSubscriptionPushPlanner(AlertDashboardService dashboardService, Clock clock) {
        this.dashboardService = dashboardService;
        this.clock = clock;
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
                    accountId, alert.lineId(), alert.lineNumber(), "line-current", "suspension", "on-change",
                    alert.id(), "Line " + alert.lineNumber() + " service alert",
                    "Suspension on Line " + alert.lineNumber() + ": " + alert.location(),
                    "/?panel=alerts"
                ));
            }
        }

        for (AlertDashboardService.DelayAlertDto delay : dashboardService.delays()) {
            if (subscribedLineIds.contains(delay.lineId())) {
                candidates.add(createLineCandidate(
                    accountId, delay.lineId(), delay.lineNumber(), "line-current", "delay", "on-change",
                    delay.id(), "Line " + delay.lineNumber() + " delay",
                    "Delay on Line " + delay.lineNumber() + ": " + delay.location(),
                    "/?panel=delays"
                ));
            }
        }

        for (AlertDashboardService.ReducedSpeedZoneDto zone : dashboardService.reducedSpeedZones()) {
            if (subscribedLineIds.contains(zone.lineId())) {
                candidates.add(createLineCandidate(
                    accountId, zone.lineId(), zone.lineNumber(), "line-current", "reduced-speed-zone", "on-change",
                    zone.id(), "Line " + zone.lineNumber() + " service alert",
                    "Reduced Speed Zone on Line " + zone.lineNumber() + ": " + zone.location(),
                    "/?panel=reduced-speed-zones"
                ));
            }
        }

        for (AlertDashboardService.PlannedClosureDto closure : dashboardService.plannedClosures()) {
            if (subscribedLineIds.contains(closure.lineId())) {
                String eventType = "planned-closure";
                String category = "line-planned";
                String url = "/?panel=closures";
                String title = "Line " + closure.lineNumber() + " planned closure";
                String body = "Planned Closure on Line " + closure.lineNumber() + ": " + closure.location();

                candidates.add(createLineCandidate(accountId, closure.lineId(), closure.lineNumber(), category, eventType, "on-change", closure.id(), title, body, url));

                OffsetDateTime eventStartAt = closure.nextWindowStart() != null
                    ? closure.nextWindowStart()
                    : closure.activeWindowStart() != null
                        ? closure.activeWindowStart()
                        : closure.startedAt();

                if (eventStartAt != null) {
                    Instant startInstant = eventStartAt.toInstant();
                    
                    Instant twentyFourHoursBefore = startInstant.minus(java.time.Duration.ofHours(24));
                    if (!now.isBefore(twentyFourHoursBefore) && now.isBefore(startInstant)) {
                        candidates.add(createLineCandidate(accountId, closure.lineId(), closure.lineNumber(), category, eventType, "closure-24h", closure.id(), title, body, url));
                    }

                    ZonedDateTime nowToronto = now.atZone(TORONTO_ZONE);
                    ZonedDateTime startToronto = eventStartAt.atZoneSameInstant(TORONTO_ZONE);
                    if (nowToronto.toLocalDate().equals(startToronto.toLocalDate()) && nowToronto.getHour() >= 6) {
                        candidates.add(createLineCandidate(accountId, closure.lineId(), closure.lineNumber(), category, eventType, "closure-morning", closure.id(), title, body, url));
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
        String title,
        String body,
        String url
    ) {
        String notificationKey = String.join("|", category, lineId, eventType, sourceId);
        String dedupeKey = String.join("|", accountId, "line", lineId, eventType, reminderBucket, sourceId);

        return new PushNotificationCandidate(
            accountId,
            null,
            null,
            lineId,
            category,
            eventType,
            reminderBucket,
            notificationKey,
            dedupeKey,
            title,
            body,
            url
        );
    }
}
