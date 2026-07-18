package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class LineSubscriptionPushPlannerTest {
    private final AlertDashboardService dashboardService = mock(AlertDashboardService.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-05T15:00:00Z"), ZoneOffset.UTC);
    private final PushNotificationFormatter formatter = new PushNotificationFormatter();
    private final LineSubscriptionPushPlanner planner = new LineSubscriptionPushPlanner(dashboardService, clock, formatter);

    @Test
    void plansLineSuspensionAndDelayAndRSZAndPlannedClosure() {
        AlertDashboardService.ActiveAlertDto suspension = new AlertDashboardService.ActiveAlertDto(
            "alert-1",
            "line-1",
            "1",
            "Suspension",
            "suspension",
            "St George to Sheppard West",
            null,
            "Suspended",
            OffsetDateTime.parse("2026-06-05T10:00:00Z"),
            OffsetDateTime.parse("2026-06-05T10:05:00Z"),
            List.of(),
            false,
            "TTC Live Alerts",
            "collision blocking the tracks",
            null
        );

        AlertDashboardService.DelayAlertDto delay = new AlertDashboardService.DelayAlertDto(
            "alert-2",
            "line-5",
            "5",
            "Delay",
            "Don Valley",
            "Eastbound",
            "Line 5 Eglinton: Delays eastbound at Don Valley station due to a medical emergency.",
            List.of(),
            OffsetDateTime.parse("2026-06-25T03:16:00Z"),
            OffsetDateTime.parse("2026-06-25T03:16:00Z"),
            "TTC Live Alerts",
            "LRT - Medical emergency"
        );

        AlertDashboardService.ReducedSpeedZoneDto zone = new AlertDashboardService.ReducedSpeedZoneDto(
            "zone-1",
            "line-1",
            "1",
            "Slowdown",
            "Eglinton to Davisville",
            null,
            "Slowdown",
            OffsetDateTime.parse("2026-06-05T10:00:00Z"),
            OffsetDateTime.parse("2026-06-05T10:05:00Z"),
            List.of(),
            List.of(),
            List.of(),
            "TTC Live Alerts",
            null,
            null,
            null,
            null,
            null,
            null,
            null
        );

        OffsetDateTime eventStart = OffsetDateTime.parse("2026-06-06T04:00:00Z");
        AlertDashboardService.PlannedClosureDto closure = new AlertDashboardService.PlannedClosureDto(
            "closure-1",
            "line-1",
            "1",
            "Planned Closure",
            "Sat-Sun",
            "St George to Sheppard West",
            null,
            "Closed",
            eventStart,
            eventStart,
            List.of(),
            true,
            "TTC Service Advisory",
            null,
            null,
            false,
            "upcoming",
            false,
            null,
            null,
            null,
            eventStart,
            eventStart.plusDays(2),
            "Weekend",
            null,
            null
        );

        when(dashboardService.activeAlerts()).thenReturn(List.of(suspension));
        when(dashboardService.delays()).thenReturn(List.of(delay));
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of(zone));
        when(dashboardService.plannedClosures()).thenReturn(List.of(closure));

        List<PushNotificationCandidate> candidates = planner.candidatesFor("user_1", List.of("line-1", "line-5"));

        assertThat(candidates).filteredOn(c -> "suspension".equals(c.eventType())).singleElement().satisfies(c -> {
            assertThat(c.category()).isEqualTo("line-current");
            assertThat(c.lineId()).isEqualTo("line-1");
            assertThat(c.sourceIncidentKey()).isEqualTo("line-current|line-1|alert-1");
            assertThat(c.notificationKey()).isEqualTo("line-current|line-1|suspension|alert-1");
            assertThat(c.dedupeKey()).startsWith("user_1|line|line-1|suspension|on-change|alert-1|update|");
            assertThat(c.updateFingerprint()).hasSize(64);
            assertThat(c.title()).isEqualTo("⚠️ Line 1 Yonge-University Suspension");
            assertThat(c.body()).isEqualTo("""
                No service between St George and Sheppard West stations due to collision blocking the tracks.
                🕗 Jun 5, 6:00 AM""");
            assertThat(c.notificationSubject()).isEqualTo("Line 1 Yonge-University Suspension");
            assertThat(c.eventLocation()).isEqualTo("St George to Sheppard West");
            assertThat(c.sourceEventAt()).isEqualTo(Instant.parse("2026-06-05T10:00:00Z"));
            assertThat(c.url()).isEqualTo("/?panel=alerts&impactKind=suspension&impactId=alert-1");
        });

        assertThat(candidates).filteredOn(c -> "delay".equals(c.eventType())).singleElement().satisfies(c -> {
            assertThat(c.category()).isEqualTo("line-current");
            assertThat(c.lineId()).isEqualTo("line-5");
            assertThat(c.sourceIncidentKey()).isEqualTo("line-current|line-5|alert-2");
            assertThat(c.notificationKey()).isEqualTo("line-current|line-5|delay|alert-2");
            assertThat(c.title()).isEqualTo("⚠️ Line 5 Eglinton Delay");
            assertThat(c.body()).isEqualTo("""
                Delays eastbound at Don Valley station due to a medical emergency.
                🕗 Jun 24, 11:16 PM""");
            assertThat(c.url()).isEqualTo("/?panel=delays&impactKind=delay&impactId=alert-2");
        });

        assertThat(candidates).filteredOn(c -> "reduced-speed-zone".equals(c.eventType())).singleElement().satisfies(c -> {
            assertThat(c.category()).isEqualTo("line-current");
            assertThat(c.lineId()).isEqualTo("line-1");
            assertThat(c.sourceIncidentKey()).isEqualTo("line-current|line-1|zone-1");
            assertThat(c.notificationKey()).isEqualTo("line-current|line-1|reduced-speed-zone|zone-1");
            assertThat(c.title()).isEqualTo("⚠️ Line 1 Yonge-University Reduced Speed Zone");
            assertThat(c.body()).contains("Reduced speeds between Eglinton and Davisville stations.");
            assertThat(c.url()).isEqualTo("/?panel=reduced-speed-zones&impactKind=reduced-speed-zone&impactId=zone-1");
        });

        List<PushNotificationCandidate> closureCandidates = candidates.stream()
            .filter(c -> "planned-closure".equals(c.eventType()))
            .toList();
        assertThat(closureCandidates).singleElement()
            .satisfies(candidate -> assertThat(candidate.reminderBucket()).isEqualTo("closure-24h"));

        for (PushNotificationCandidate candidate : closureCandidates) {
            assertThat(candidate.title()).isEqualTo("⚠️ Line 1 Yonge-University Planned Closure");
            assertThat(candidate.sourceEventAt()).isEqualTo(eventStart.toInstant());
            assertThat(candidate.url()).isEqualTo("/?panel=closures&impactKind=planned-closure&impactId=closure-1");
            if ("closure-24h".equals(candidate.reminderBucket())) {
                assertThat(candidate.body()).contains("Starts within 24 hours.");
            }
        }
    }

    @Test
    void announcementOnlyPolicyDoesNotCreateScheduledClosureReminderCandidates() {
        OffsetDateTime eventStart = OffsetDateTime.parse("2026-06-06T04:00:00Z");
        AlertDashboardService.PlannedClosureDto closure = new AlertDashboardService.PlannedClosureDto(
            "closure-1", "line-1", "1", "Planned Closure", "Sat-Sun",
            "St George to Sheppard West", null, "Closed", eventStart, eventStart,
            List.of(), true, "TTC Service Advisory", null, null, false, "upcoming",
            false, null, null, null, eventStart, eventStart.plusDays(2), "Weekend", null, null
        );
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of(closure));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(
            "user_1",
            List.of("line-1"),
            PlannedClosureFollowUpPolicy.ANNOUNCEMENTS_ONLY
        );

        assertThat(candidates).singleElement()
            .satisfies(candidate -> assertThat(candidate.reminderBucket()).isEqualTo("on-change"));
    }

    @Test
    void usesDetailedDelayTitleBeforeGenericTravelTimeDescription() {
        AlertDashboardService.DelayAlertDto delay = new AlertDashboardService.DelayAlertDto(
            "alert-line-5-delay",
            "line-5",
            "5",
            "Delays between Mount Dennis and Kennedy stations while the maintainer fixes a track problem.",
            "between Mount Dennis and Kennedy stations",
            "Eastbound & Westbound",
            "Customers may experience longer than normal travel times of up to 20 minutes.",
            List.of(),
            OffsetDateTime.parse("2026-06-30T20:34:00Z"),
            OffsetDateTime.parse("2026-06-30T20:34:00Z"),
            "TTC Live Alert",
            "LRT - Track Problem"
        );

        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of(delay));
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of());

        List<PushNotificationCandidate> candidates = planner.candidatesFor("user_1", List.of("line-5"));

        assertThat(candidates).singleElement().satisfies(c -> {
            assertThat(c.title()).isEqualTo("⚠️ Line 5 Eglinton Delay");
            assertThat(c.body()).isEqualTo("""
                Delays between Mount Dennis and Kennedy stations while the maintainer fixes a track problem.
                🕗 Jun 30, 4:34 PM""");
        });
    }

    @Test
    void assignsANewDedupeRevisionWhenTheSameSourceAlertIsUpdated() {
        AlertDashboardService.DelayAlertDto initial = new AlertDashboardService.DelayAlertDto(
            "alert-line-6", "line-6", "6", "Delay", "Humber College to Mount Olive", "Both Ways",
            "Delays due to a switch issue.", List.of(),
            OffsetDateTime.parse("2026-07-10T18:20:00Z"), OffsetDateTime.parse("2026-07-10T18:25:00Z"),
            "TTC Service Advisory", "Switch issue"
        );
        AlertDashboardService.DelayAlertDto updated = new AlertDashboardService.DelayAlertDto(
            "alert-line-6", "line-6", "6", "Delay", "Humber College to Mount Olive", "Both Ways",
            "Delays remain between Humber College and Mount Olive.", List.of(),
            OffsetDateTime.parse("2026-07-10T18:20:00Z"), OffsetDateTime.parse("2026-07-10T18:30:00Z"),
            "TTC Service Advisory", "Switch issue"
        );
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of(initial), List.of(updated));

        PushNotificationCandidate first = planner.candidatesFor("user_1", List.of("line-6")).getFirst();
        PushNotificationCandidate revision = planner.candidatesFor("user_1", List.of("line-6")).getFirst();

        assertThat(revision.sourceIncidentKey()).isEqualTo(first.sourceIncidentKey());
        assertThat(revision.notificationKey()).isEqualTo(first.notificationKey());
        assertThat(revision.updateFingerprint()).isNotEqualTo(first.updateFingerprint());
        assertThat(revision.dedupeKey()).isNotEqualTo(first.dedupeKey());
    }
}
