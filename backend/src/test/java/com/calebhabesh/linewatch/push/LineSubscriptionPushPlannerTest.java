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
            null,
            null
        );

        AlertDashboardService.DelayAlertDto delay = new AlertDashboardService.DelayAlertDto(
            "alert-2",
            "line-2",
            "2",
            "Delay",
            "Keele to Jane",
            null,
            "Delay",
            List.of(),
            OffsetDateTime.parse("2026-06-05T10:00:00Z"),
            OffsetDateTime.parse("2026-06-05T10:05:00Z"),
            "TTC Live Alerts",
            null
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
            "Weekend"
        );

        when(dashboardService.activeAlerts()).thenReturn(List.of(suspension));
        when(dashboardService.delays()).thenReturn(List.of(delay));
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of(zone));
        when(dashboardService.plannedClosures()).thenReturn(List.of(closure));

        List<PushNotificationCandidate> candidates = planner.candidatesFor("user_1", List.of("line-1"));

        assertThat(candidates).filteredOn(c -> "suspension".equals(c.eventType())).singleElement().satisfies(c -> {
            assertThat(c.category()).isEqualTo("line-current");
            assertThat(c.lineId()).isEqualTo("line-1");
            assertThat(c.notificationKey()).isEqualTo("line-current|line-1|suspension|alert-1");
            assertThat(c.dedupeKey()).isEqualTo("user_1|line|line-1|suspension|on-change|alert-1");
            assertThat(c.title()).isEqualTo("⚠️ Line 1 Yonge-University Suspension");
            assertThat(c.body()).isEqualTo("""
                St George to Sheppard West.
                🕗 Jun 5, 6:00 AM""");
            assertThat(c.notificationSubject()).isEqualTo("Line 1 Yonge-University Suspension");
            assertThat(c.eventLocation()).isEqualTo("St George to Sheppard West");
            assertThat(c.sourceEventAt()).isEqualTo(Instant.parse("2026-06-05T10:00:00Z"));
        });

        assertThat(candidates).filteredOn(c -> "delay".equals(c.eventType())).isEmpty();

        assertThat(candidates).filteredOn(c -> "reduced-speed-zone".equals(c.eventType())).singleElement().satisfies(c -> {
            assertThat(c.category()).isEqualTo("line-current");
            assertThat(c.lineId()).isEqualTo("line-1");
            assertThat(c.notificationKey()).isEqualTo("line-current|line-1|reduced-speed-zone|zone-1");
            assertThat(c.title()).isEqualTo("⚠️ Line 1 Yonge-University Reduced Speed Zone");
            assertThat(c.body()).contains("Eglinton to Davisville.");
        });

        List<PushNotificationCandidate> closureCandidates = candidates.stream()
            .filter(c -> "planned-closure".equals(c.eventType()))
            .toList();
        assertThat(closureCandidates).hasSize(2);
        assertThat(closureCandidates).extracting(PushNotificationCandidate::reminderBucket)
            .containsExactlyInAnyOrder("on-change", "closure-24h");

        for (PushNotificationCandidate candidate : closureCandidates) {
            assertThat(candidate.title()).isEqualTo("⚠️ Line 1 Yonge-University Planned Closure");
            assertThat(candidate.sourceEventAt()).isEqualTo(eventStart.toInstant());
            if ("closure-24h".equals(candidate.reminderBucket())) {
                assertThat(candidate.body()).contains("Starts within 24 hours.");
            }
        }
    }
}
