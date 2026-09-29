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
    void plannedLimitedServiceKeepsOccurrenceNotificationIdentityAndPreferenceType() {
        OffsetDateTime startsAt = OffsetDateTime.parse("2026-06-05T14:00:00Z");
        when(dashboardService.activeAlerts()).thenReturn(List.of(new AlertDashboardService.ActiveAlertDto(
            "parent", "line-1", "1", "Nightly closure", "planned", "Vaughan to Finch West", "Both directions",
            "There is no subway service.", startsAt, startsAt, List.of("affected"), false,
            "TTC Live Alerts", "Closure - Planned Track Work", null, null)));
        PushNotificationCandidate before = planner.candidatesFor("account", List.of("line-1")).getFirst();
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of(new AlertDashboardService.DelayAlertDto(
            "child", "line-1", "1", "Limited service", "Vaughan to Finch West", "Both directions",
            "There is limited subway service.", List.of("affected"), startsAt, startsAt,
            "TTC Live Alerts", "Closure - Planned Track Work", "limited-service", "parent", startsAt.plusHours(3),
            false, "There is limited subway service.")));
        List<PushNotificationCandidate> corrected = planner.candidatesFor("account", List.of("line-1"));
        assertThat(corrected).hasSize(1);
        assertThat(corrected.getFirst().eventType()).isEqualTo("planned-closure");
        assertThat(corrected.getFirst().sourceIncidentKey()).isEqualTo(before.sourceIncidentKey());
        assertThat(corrected.getFirst().notification().body()).contains("limited subway service");
        assertThat(corrected.getFirst().notification().title()).contains("Planned limited service");
        assertThat(corrected.getFirst().url()).contains("panel=delays");
    }

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
            "There will be no subway service between St George and Sheppard West stations overnight from "
                + "Saturday, June 6 through Monday, June 8. Each nightly closure runs from "
                + "12:00 AM until 5:00 AM the following morning.",
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
            "12:00 AM – 5:00 AM",
            "Sat, Jun 6 – Mon, Jun 8",
            "There will be no subway service between St George and Sheppard West stations"
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
            assertThat(candidate.title()).isEqualTo("⚠️ Line 1 Yonge-University Planned Advisory");
            assertThat(candidate.sourceEventAt()).isEqualTo(eventStart.toInstant());
            assertThat(candidate.url()).isEqualTo("/?panel=closures&impactKind=planned-closure&impactId=closure-1");
            if ("closure-24h".equals(candidate.reminderBucket())) {
                assertThat(candidate.body()).contains("Starts within 24 hours.");
            }
            assertThat(candidate.body()).contains("Advisory dates: Sat, Jun 6 – Mon, Jun 8.");
            assertThat(candidate.body()).contains("Advisory hours: 12:00 AM – 5:00 AM.");
            assertThat(candidate.body()).startsWith(
                "Synthetic scenario: no subway service between St George and Sheppard West for a test closure."
            );
            assertThat(candidate.body()).doesNotContain("Each nightly closure runs");
        }
    }

    @Test
    void describesEverySectionInAGroupedReducedSpeedZoneNotification() {
        AlertDashboardService.ReducedSpeedZoneDto zone = new AlertDashboardService.ReducedSpeedZoneDto(
            "zone-grouped",
            "line-1",
            "1",
            "Reduced Speed Zone",
            "Multiple affected sections",
            "Northbound & Southbound",
            "TTC reports reduced speeds on this corridor.",
            OffsetDateTime.parse("2026-06-05T14:55:00Z"),
            OffsetDateTime.parse("2026-06-05T14:56:00Z"),
            List.of(),
            List.of("rsz-north", "rsz-south"),
            List.of(
                new AlertDashboardService.DirectionalDetailDto(
                    "rsz-north",
                    "Northbound",
                    "Eglinton to Davisville",
                    "Northbound trains are moving slowly.",
                    null
                ),
                new AlertDashboardService.DirectionalDetailDto(
                    "rsz-south",
                    "Southbound",
                    "St Clair to Summerhill",
                    "Southbound trains are moving slowly.",
                    null
                )
            ),
            "TTC Live Alerts",
            null,
            null,
            null,
            null,
            null,
            null,
            null
        );
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of(zone));
        when(dashboardService.plannedClosures()).thenReturn(List.of());

        PushNotificationCandidate candidate = planner.candidatesFor("user_1", List.of("line-1")).getFirst();

        assertThat(candidate.body()).isEqualTo("""
            Reduced speeds across Eglinton to Davisville (Northbound) and St Clair to Summerhill (Southbound).
            🕗 Jun 5, 10:55 AM""");
        assertThat(candidate.body()).doesNotContain("on this corridor");
        assertThat(candidate.eventLocation()).isEqualTo(
            "Eglinton to Davisville (Northbound); St Clair to Summerhill (Southbound)"
        );
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
    void lateOpeningNotificationUsesScheduledServiceStartInsteadOfMidnight() {
        OffsetDateTime scheduledOpening = OffsetDateTime.parse("2026-08-23T08:07:00-04:00");
        OffsetDateTime advertisedOpening = OffsetDateTime.parse("2026-08-23T11:00:00-04:00");
        AlertDashboardService.PlannedClosureDto closure = new AlertDashboardService.PlannedClosureDto(
            "late-opening", "line-2", "2", "Line 2 late opening", "Sunday morning",
            "St George to Chester", "Eastbound & Westbound",
            "Subway service will start at 11 a.m. due to planned work.",
            OffsetDateTime.parse("2026-08-20T10:00:00-04:00"),
            OffsetDateTime.parse("2026-08-20T10:00:00-04:00"),
            List.of("line-2-st-george-chester"), true,
            "TTC.ca Subway Service Advisories", "Planned work", null,
            false, "upcoming", false, null, null, null,
            scheduledOpening, advertisedOpening, "Sun 8:07 AM - 11:00 AM",
            "8:07 AM – 11:00 AM", "Sun, Aug 23", "Line 2 late opening"
        );
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of(closure));

        assertThat(planner.candidatesFor("user_1", List.of("line-2")))
            .singleElement()
            .satisfies(candidate -> {
                assertThat(candidate.sourceEventAt()).isEqualTo(scheduledOpening.toInstant());
                assertThat(candidate.body()).contains("Advisory hours: 8:07 AM – 11:00 AM.");
                assertThat(candidate.body()).doesNotContain("12:00 AM");
            });
    }

    @Test
    void plansActiveClosureWhenAnUpcomingClosureWindowStarts() {
        OffsetDateTime windowStart = OffsetDateTime.parse("2026-06-05T14:30:00Z");
        AlertDashboardService.ActiveAlertDto activeClosure = new AlertDashboardService.ActiveAlertDto(
            "closure-child-1",
            "line-2",
            "2",
            "No subway service between Jane and Ossington stations overnight from Saturday, June 6 through "
                + "Sunday, June 7. Each nightly closure runs from 11:00 PM until 5:00 AM the following morning.",
            "planned",
            "Jane to Ossington",
            "Eastbound & Westbound",
            "Shuttle buses are running between Jane and Ossington stations.",
            windowStart,
            OffsetDateTime.parse("2026-06-05T14:31:00Z"),
            List.of("line-2-jane-runnymede", "line-2-runnymede-high-park"),
            true,
            "TTC Service Advisory",
            "planned track work",
            null,
            "closure-parent-1",
            "No subway service between Jane and Ossington stations due to planned track work."
        );

        when(dashboardService.activeAlerts()).thenReturn(List.of(activeClosure));
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of());

        List<PushNotificationCandidate> candidates = planner.candidatesFor("user_1", List.of("line-2"));

        assertThat(candidates).singleElement().satisfies(candidate -> {
            assertThat(candidate.category()).isEqualTo("line-current");
            assertThat(candidate.eventType()).isEqualTo("planned-closure");
            assertThat(candidate.reminderBucket()).isEqualTo("on-change");
            assertThat(candidate.sourceIncidentKey())
                .startsWith("line-current|line-2|planned-closure-");
            assertThat(candidate.notificationKey())
                .startsWith("line-current|line-2|planned-closure|planned-closure-");
            assertThat(candidate.title()).isEqualTo("⚠️ Line 2 Bloor-Danforth Planned Advisory");
            assertThat(candidate.body()).contains("No subway service between Jane and Ossington stations");
            assertThat(candidate.body()).doesNotContain("Each nightly closure runs");
            assertThat(candidate.sourceEventAt()).isEqualTo(windowStart.toInstant());
            assertThat(candidate.url())
                .isEqualTo("/?panel=closures&impactKind=planned-closure&impactId=closure-parent-1");
        });
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
            "TTC Live Alerts",
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

    @Test
    void keepsNotificationIdentityWhenAWebsiteClosureMovesToLiveAlerts() {
        OffsetDateTime eventStart = OffsetDateTime.parse("2026-06-06T04:00:00Z");
        AlertDashboardService.PlannedClosureDto website = plannedClosure(
            "ttc-route-website-closure",
            "TTC.ca Subway Service Advisories",
            OffsetDateTime.parse("2026-06-05T13:00:00Z"),
            eventStart,
            "11:59 PM – 6:00 AM",
            true
        );
        AlertDashboardService.PlannedClosureDto live = plannedClosure(
            "ttc-route-live-73253",
            "TTC Service Advisory",
            OffsetDateTime.parse("2026-06-05T14:00:00Z"),
            eventStart,
            "11:59 PM – 6:00 AM",
            true
        );
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of(website), List.of(live));

        PushNotificationCandidate websiteCandidate = planner
            .candidatesFor("user_1", List.of("line-2")).getFirst();
        PushNotificationCandidate liveCandidate = planner
            .candidatesFor("user_1", List.of("line-2")).getFirst();

        assertThat(liveCandidate.sourceIncidentKey()).isEqualTo(websiteCandidate.sourceIncidentKey());
        assertThat(liveCandidate.notificationKey()).isEqualTo(websiteCandidate.notificationKey());
        assertThat(liveCandidate.updateFingerprint()).isEqualTo(websiteCandidate.updateFingerprint());
        assertThat(liveCandidate.dedupeKey()).isEqualTo(websiteCandidate.dedupeKey());
        assertThat(liveCandidate.url()).isNotEqualTo(websiteCandidate.url());
    }

    private AlertDashboardService.PlannedClosureDto plannedClosure(
        String id,
        String source,
        OffsetDateTime updatedAt,
        OffsetDateTime eventStart,
        String closureHours,
        boolean shuttle
    ) {
        return new AlertDashboardService.PlannedClosureDto(
            id,
            "line-2",
            "2",
            "Line 2 closure between St George and Broadview",
            "Upcoming",
            "St George to Broadview",
            "Eastbound & Westbound",
            "Subway service will end early for planned track work.",
            eventStart,
            updatedAt,
            List.of("line-2-st-george-bay", "line-2-bay-bloor-yonge", "line-2-castle-frank-broadview"),
            shuttle,
            source,
            "planned track work",
            null,
            false,
            "upcoming",
            true,
            null,
            null,
            null,
            eventStart,
            eventStart.plusHours(6),
            "Tonight",
            closureHours,
            "Sat, Jun 6",
            "No subway service between St George and Broadview stations",
            "bidirectional"
        );
    }
}
