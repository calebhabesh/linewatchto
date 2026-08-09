package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.commute.CommuteImpactService;
import com.calebhabesh.linewatch.commute.CommutePathService;
import com.calebhabesh.linewatch.commute.CommuteResponses;
import com.calebhabesh.linewatch.regional.RegionalCommuteImpactService;
import com.calebhabesh.linewatch.regional.RegionalCommutePathService;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class SavedCommutePushPlannerTest {
    private final CommutePathService commutePathService = mock(CommutePathService.class);
    private final CommuteImpactService commuteImpactService = mock(CommuteImpactService.class);
    private final java.time.Clock clock = java.time.Clock.fixed(Instant.parse("2026-06-05T15:00:00Z"), java.time.ZoneOffset.UTC);
    private final PushNotificationFormatter formatter = new PushNotificationFormatter();
    private final SavedCommutePushPlanner planner = new SavedCommutePushPlanner(commutePathService, commuteImpactService, clock, formatter);

    private final AccountEntity account = AccountEntity.create(
        "user_1",
        "rider@example.com",
        "Rider",
        "$2a$hash",
        false,
        Instant.parse("2026-06-05T14:00:00Z")
    );

    @Test
    void createsCurrentImpactCandidateForSavedCommuteOutboundLeg() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            true,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        CommuteResponses.PathResponse outboundPath = path("finch", "union", "line-1-finch-union");
        CommuteResponses.PathResponse returnPath = path("union", "finch", "line-1-finch-union");
        when(commutePathService.path("finch", "union")).thenReturn(outboundPath);
        when(commutePathService.path("union", "finch")).thenReturn(returnPath);
        when(commuteImpactService.impactFor(outboundPath)).thenReturn(impactWith(
            new CommuteResponses.MatchedImpactResponse(
                "delay-line-1",
                "delay",
                "current",
                "minor",
                "Delay",
                "line-1",
                "1",
                "Finch to Union",
                "Southbound",
                "Line 1 Yonge-University: Delays southbound from Finch to Union due to signal problems.",
                "TTC Live Alerts",
                List.of("line-1-finch-union"),
                List.of(),
                OffsetDateTime.parse("2026-06-05T10:20:00-04:00"),
                OffsetDateTime.parse("2026-06-05T10:25:00-04:00"),
                null,
                "active-now",
                OffsetDateTime.parse("2026-06-05T10:20:00-04:00")
            )
        ));
        when(commuteImpactService.impactFor(returnPath)).thenReturn(clearImpact());

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).singleElement().satisfies(candidate -> {
            assertThat(candidate.accountId()).isEqualTo("user_1");
            assertThat(candidate.commuteId()).isEqualTo("commute_1");
            assertThat(candidate.legId()).isEqualTo("outbound");
            assertThat(candidate.category()).isEqualTo("saved-commute-current");
            assertThat(candidate.sourceIncidentKey()).isEqualTo("saved-commute-current|commute_1|outbound|delay-line-1");
            assertThat(candidate.notificationKey()).isEqualTo("saved-commute-current|commute_1|outbound|delay|delay-line-1");
            assertThat(candidate.title()).isEqualTo("⚠️ Line 1 Yonge-University Delay");
            assertThat(candidate.body()).isEqualTo("""
                Delays southbound from Finch to Union due to signal problems.
                Affects Morning commute (Outbound).
                🕗 Jun 5, 10:20 AM""");
            assertThat(candidate.notificationSubject()).isEqualTo("Line 1 Yonge-University Delay");
            assertThat(candidate.scopeLabel()).isEqualTo("Morning commute (Outbound)");
            assertThat(candidate.sourceEventAt()).isEqualTo(Instant.parse("2026-06-05T14:20:00Z"));
            assertThat(candidate.url()).isEqualTo("/?panel=commutes&commute=commute_1");
            assertThat(candidate.dedupeKey()).startsWith(
                "user_1|commute_1|outbound|delay|on-change|delay-line-1|segments:line-1-finch-union|stations:|update:"
            );
            assertThat(candidate.updateFingerprint()).hasSize(64);
        });
    }

    @Test
    void plansReturnTripImpactWhenReturnTripIsWatched() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_2",
            account,
            "Evening Route",
            "union",
            "keele",
            true,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        CommuteResponses.PathResponse outboundPath = path("union", "keele", "line-2-union-keele");
        CommuteResponses.PathResponse returnPath = path("keele", "union", "line-2-union-keele");
        when(commutePathService.path("union", "keele")).thenReturn(outboundPath);
        when(commutePathService.path("keele", "union")).thenReturn(returnPath);
        when(commuteImpactService.impactFor(outboundPath)).thenReturn(clearImpact());
        when(commuteImpactService.impactFor(returnPath)).thenReturn(impactWith(
            new CommuteResponses.MatchedImpactResponse(
                "closure-line-2",
                "planned-closure",
                "planned",
                "planned",
                "There will be no subway service between Keele and Union stations overnight from Sunday, June 7 "
                    + "through Monday, June 8. Each nightly closure runs from 12:00 AM until 5:00 AM "
                    + "the following morning.",
                "line-2",
                "2",
                "Keele to Union",
                null,
                null,
                "TTC Service Advisory",
                List.of("line-2-union-keele"),
                List.of(),
                OffsetDateTime.parse("2026-06-07T00:00:00-04:00"),
                OffsetDateTime.parse("2026-06-05T09:00:00-04:00"),
                "Sat 12:00 AM - Mon 5:00 AM",
                "upcoming",
                OffsetDateTime.parse("2026-06-07T00:00:00-04:00"),
                "12:00 AM – 5:00 AM",
                "Sun, Jun 7 – Mon, Jun 8",
                false,
                "There will be no subway service between Keele and Union stations",
                "planned track work",
                true
            )
        ));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).singleElement().satisfies(candidate -> {
            assertThat(candidate.legId()).isEqualTo("return");
            assertThat(candidate.title()).isEqualTo("⚠️ Line 2 Bloor-Danforth Planned Closure");
            assertThat(candidate.body()).startsWith(
                "There will be no subway service between Keele and Union stations."
            );
            assertThat(candidate.body()).doesNotContain("Each nightly closure runs");
            assertThat(candidate.body()).contains("Closure dates: Sun, Jun 7 – Mon, Jun 8.");
            assertThat(candidate.body()).contains("Closure hours: 12:00 AM – 5:00 AM.");
            assertThat(candidate.body()).contains("Shuttle buses are running.");
            assertThat(candidate.body()).contains("Affects Evening Route (Return).");
            assertThat(candidate.body()).endsWith("🕗 Closure starts Jun 7, 12:00 AM");
            assertThat(candidate.category()).isEqualTo("saved-commute-planned");
        });
    }

    @Test
    void ignoresReturnTripWhenReturnTripIsNotWatched() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_3",
            account,
            "One way",
            "finch",
            "union",
            false,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        CommuteResponses.PathResponse outboundPath = path("finch", "union", "line-1-finch-union");
        when(commutePathService.path("finch", "union")).thenReturn(outboundPath);
        when(commuteImpactService.impactFor(outboundPath)).thenReturn(clearImpact());

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).isEmpty();
        verify(commutePathService, never()).path("union", "finch");
    }

    @Test
    void activePlannedClosureKeepsItsWindowStartForCurrentCommuteNotifications() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_active_closure", account, "Late shift", "finch", "union", false,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        CommuteResponses.PathResponse outboundPath = path("finch", "union", "line-1-finch-union");
        OffsetDateTime alertOpenedAt = OffsetDateTime.parse("2026-06-04T09:00:00-04:00");
        OffsetDateTime windowStart = OffsetDateTime.parse("2026-06-05T10:30:00-04:00");
        when(commutePathService.path("finch", "union")).thenReturn(outboundPath);
        when(commuteImpactService.impactFor(outboundPath)).thenReturn(impactWith(
            new CommuteResponses.MatchedImpactResponse(
                "closure-line-1", "planned-closure", "current", "major", "Planned Closure",
                "line-1", "1", "Finch to Union", null, null, "TTC Service Advisory",
                List.of("line-1-finch-union"), List.of(), alertOpenedAt, windowStart,
                "Today", "active-now", windowStart
            )
        ));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).singleElement().satisfies(candidate -> {
            assertThat(candidate.category()).isEqualTo("saved-commute-current");
            assertThat(candidate.sourceEventAt()).isEqualTo(windowStart.toInstant());
            assertThat(candidate.body()).endsWith("🕗 Closure starts Jun 5, 10:30 AM");
        });
    }

    @Test
    void reducedSpeedZoneCreatesCurrentCandidateWithCorrectEventType() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            false,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        CommuteResponses.PathResponse outboundPath = path("finch", "union", "line-1-finch-union");
        when(commutePathService.path("finch", "union")).thenReturn(outboundPath);
        when(commuteImpactService.impactFor(outboundPath)).thenReturn(impactWith(
            new CommuteResponses.MatchedImpactResponse(
                "rsz-line-1",
                "reduced-speed-zone",
                "current",
                "minor",
                "Slowdown",
                "line-1",
                "1",
                "Finch to Union",
                "Southbound",
                null,
                "TTC Live Alerts",
                List.of("line-1-finch-union"),
                List.of(),
                OffsetDateTime.parse("2026-06-05T10:20:00-04:00"),
                OffsetDateTime.parse("2026-06-05T10:25:00-04:00"),
                null,
                "active-now",
                OffsetDateTime.parse("2026-06-05T10:20:00-04:00")
            )
        ));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).singleElement().satisfies(candidate -> {
            assertThat(candidate.category()).isEqualTo("saved-commute-current");
            assertThat(candidate.eventType()).isEqualTo("reduced-speed-zone");
            assertThat(candidate.reminderBucket()).isEqualTo("on-change");
            assertThat(candidate.sourceIncidentKey()).isEqualTo("saved-commute-current|commute_1|outbound|rsz-line-1");
            assertThat(candidate.title()).isEqualTo("⚠️ Line 1 Yonge-University Reduced Speed Zone");
        });
    }

    @Test
    void plannedClosureInside24hCreatesOnlyTheMostRelevantReminder() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            false,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        CommuteResponses.PathResponse outboundPath = path("finch", "union", "line-1-finch-union");
        when(commutePathService.path("finch", "union")).thenReturn(outboundPath);
        OffsetDateTime eventStart = OffsetDateTime.parse("2026-06-06T04:00:00Z");
        when(commuteImpactService.impactFor(outboundPath)).thenReturn(impactWith(
            new CommuteResponses.MatchedImpactResponse(
                "closure-line-1",
                "planned-closure",
                "planned",
                "planned",
                "Planned Closure",
                "line-1",
                "1",
                "Finch to Union",
                null,
                null,
                "TTC Service Advisory",
                List.of("line-1-finch-union"),
                List.of(),
                eventStart,
                eventStart,
                "Fri 4:00 PM",
                "upcoming",
                eventStart
            )
        ));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).singleElement()
            .satisfies(candidate -> assertThat(candidate.reminderBucket()).isEqualTo("closure-24h"));
    }

    @Test
    void plannedClosureOnSameTorontoDateAtMorningAvoidsAThreePushBurst() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            false,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        CommuteResponses.PathResponse outboundPath = path("finch", "union", "line-1-finch-union");
        when(commutePathService.path("finch", "union")).thenReturn(outboundPath);
        OffsetDateTime eventStart = OffsetDateTime.parse("2026-06-05T23:00:00-04:00");
        when(commuteImpactService.impactFor(outboundPath)).thenReturn(impactWith(
            new CommuteResponses.MatchedImpactResponse(
                "closure-line-1",
                "planned-closure",
                "planned",
                "planned",
                "Planned Closure",
                "line-1",
                "1",
                "Finch to Union",
                null,
                null,
                "TTC Service Advisory",
                List.of("line-1-finch-union"),
                List.of(),
                eventStart,
                eventStart,
                "Fri 11:00 PM",
                "upcoming",
                eventStart
            )
        ));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).singleElement()
            .satisfies(candidate -> assertThat(candidate.reminderBucket()).isEqualTo("closure-morning"));
    }

    @Test
    void announcementOnlyPolicyKeepsPlannedClosureUpdatesAutomaticWithoutFollowUps() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_announcement", account, "Morning commute", "finch", "union", false,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        CommuteResponses.PathResponse outboundPath = path("finch", "union", "line-1-finch-union");
        OffsetDateTime eventStart = OffsetDateTime.parse("2026-06-05T23:00:00-04:00");
        when(commutePathService.path("finch", "union")).thenReturn(outboundPath);
        when(commuteImpactService.impactFor(outboundPath)).thenReturn(impactWith(
            new CommuteResponses.MatchedImpactResponse(
                "closure-line-1", "planned-closure", "planned", "planned", "Planned Closure",
                "line-1", "1", "Finch to Union", null, null, "TTC Service Advisory",
                List.of("line-1-finch-union"), List.of(), eventStart, eventStart,
                "Fri 11:00 PM", "upcoming", eventStart
            )
        ));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(
            commute,
            PlannedClosureFollowUpPolicy.ANNOUNCEMENTS_ONLY
        );

        assertThat(candidates).singleElement()
            .satisfies(candidate -> assertThat(candidate.reminderBucket()).isEqualTo("on-change"));
    }

    @Test
    void keepsCurrentImpactCandidateButSuppressesDeliveryOutsideCommuteWindow() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_4",
            account,
            "Evening commute",
            "queen",
            "bloor-yonge",
            false,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        commute.updateNotificationRule(
            true,
            62,
            16 * 60 + 30,
            17 * 60 + 30,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            Instant.parse("2026-06-05T14:31:00Z")
        );
        CommuteResponses.PathResponse outboundPath = path("queen", "bloor-yonge", "line-1-queen-bloor-yonge");
        when(commutePathService.path("queen", "bloor-yonge")).thenReturn(outboundPath);
        when(commuteImpactService.impactFor(outboundPath)).thenReturn(impactWith(currentDelay("delay-line-1", "line-1-queen-bloor-yonge")));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).singleElement().satisfies(candidate -> {
            assertThat(candidate.notificationKey()).isEqualTo("saved-commute-current|commute_4|outbound|delay|delay-line-1");
            assertThat(candidate.deliveryAllowed()).isFalse();
        });
    }

    @Test
    void evaluatesOutboundAndReturnLegSchedulesIndependently() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_legs", account, "Work", "finch", "union", true,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        commute.updateNotificationRule(
            true,
            62, 7 * 60, 9 * 60,
            62, 10 * 60, 12 * 60,
            true, true,
            true, true, true, true, true,
            Instant.parse("2026-06-05T14:31:00Z")
        );
        CommuteResponses.PathResponse outboundPath = path("finch", "union", "line-1-finch-union");
        CommuteResponses.PathResponse returnPath = path("union", "finch", "line-1-finch-union");
        when(commutePathService.path("finch", "union")).thenReturn(outboundPath);
        when(commutePathService.path("union", "finch")).thenReturn(returnPath);
        when(commuteImpactService.impactFor(outboundPath)).thenReturn(impactWith(
            currentDelay("delay-outbound", "line-1-finch-union")
        ));
        when(commuteImpactService.impactFor(returnPath)).thenReturn(impactWith(
            currentDelay("delay-return", "line-1-finch-union")
        ));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).hasSize(2);
        assertThat(candidates).filteredOn(candidate -> "outbound".equals(candidate.legId()))
            .singleElement().satisfies(candidate -> assertThat(candidate.deliveryAllowed()).isFalse());
        assertThat(candidates).filteredOn(candidate -> "return".equals(candidate.legId()))
            .singleElement().satisfies(candidate -> assertThat(candidate.deliveryAllowed()).isTrue());
    }

    @Test
    void plannedClosureWaitsForTheConfiguredDeliveryWindowEvenWhenItsStartIsRelevant() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_planned_window", account, "Work", "finch", "union", false,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        commute.updateNotificationRule(
            true, 62, 7 * 60, 9 * 60, true, true,
            true, true, true, true, true, Instant.parse("2026-06-05T14:31:00Z")
        );
        CommuteResponses.PathResponse outboundPath = path("finch", "union", "line-1-finch-union");
        OffsetDateTime eventStart = OffsetDateTime.parse("2026-06-08T08:00:00-04:00");
        when(commutePathService.path("finch", "union")).thenReturn(outboundPath);
        when(commuteImpactService.impactFor(outboundPath)).thenReturn(impactWith(
            new CommuteResponses.MatchedImpactResponse(
                "closure-line-1", "planned-closure", "planned", "planned", "Planned Closure",
                "line-1", "1", "Finch to Union", null, null, "TTC Service Advisory",
                List.of("line-1-finch-union"), List.of(), eventStart, eventStart,
                "Mon 8:00 AM", "upcoming", eventStart
            )
        ));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).singleElement()
            .satisfies(candidate -> assertThat(candidate.deliveryAllowed()).isFalse());
    }

    @Test
    void wholeRouteMatchingAllowsAnImpactOnAnySavedRouteSegment() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_5",
            account,
            "Whole route",
            "queen",
            "union",
            false,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        commute.updateNotificationRule(
            true,
            127,
            null,
            null,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            Instant.parse("2026-06-05T14:31:00Z")
        );
        CommuteResponses.PathResponse outboundPath = pathWithStations(
            List.of("queen", "king", "union"),
            List.of("line-1-queen-king", "line-1-king-union")
        );
        when(commutePathService.path("queen", "union")).thenReturn(outboundPath);
        when(commuteImpactService.impactFor(outboundPath)).thenReturn(impactWith(currentDelay("delay-line-1", "line-1-king-union")));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).singleElement().satisfies(candidate -> {
            assertThat(candidate.notificationKey()).isEqualTo("saved-commute-current|commute_5|outbound|delay|delay-line-1");
            assertThat(candidate.deliveryAllowed()).isTrue();
        });
    }

    @Test
    void disabledSavedCommuteEventTypeSuppressesDeliveryButKeepsRouteVisibleCandidate() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_6",
            account,
            "No delays",
            "finch",
            "union",
            false,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        commute.updateNotificationRule(
            true,
            127,
            null,
            null,
            true,
            true,
            true,
            false,
            true,
            true,
            true,
            Instant.parse("2026-06-05T14:31:00Z")
        );
        CommuteResponses.PathResponse outboundPath = path("finch", "union", "line-1-finch-union");
        when(commutePathService.path("finch", "union")).thenReturn(outboundPath);
        when(commuteImpactService.impactFor(outboundPath)).thenReturn(impactWith(currentDelay("delay-line-1", "line-1-finch-union")));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).singleElement().satisfies(candidate -> {
            assertThat(candidate.eventType()).isEqualTo("delay");
            assertThat(candidate.deliveryAllowed()).isFalse();
        });
    }

    @Test
    void createsFreshRegionalCommuteCandidateWithRegionalIdentityAndDeepLink() {
        RegionalCommutePathService regionalPathService = mock(RegionalCommutePathService.class);
        RegionalCommuteImpactService regionalImpactService = mock(RegionalCommuteImpactService.class);
        SavedCommutePushPlanner regionalPlanner = new SavedCommutePushPlanner(
            commutePathService,
            commuteImpactService,
            regionalPathService,
            regionalImpactService,
            clock,
            formatter
        );
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_regional",
            account,
            "Airport",
            "regional",
            "bloor",
            "pearson-airport",
            true,
            Instant.parse("2026-07-28T14:30:00Z")
        );
        CommuteResponses.PathResponse outboundPath = new CommuteResponses.PathResponse(
            "available",
            List.of("bloor", "weston", "pearson-airport"),
            List.of("segment-up-bloor-weston", "segment-up-weston-pearson-airport"),
            List.of(),
            List.of("regional-up"),
            List.of(),
            900,
            "regional-topology-estimate",
            "Default regional route: 3 stations on UP, planning estimate about 15 min"
        );
        when(regionalPathService.path("bloor", "pearson-airport")).thenReturn(outboundPath);
        when(regionalPathService.path("pearson-airport", "bloor")).thenReturn(outboundPath);
        when(regionalImpactService.impactFor(outboundPath)).thenReturn(impactWith(
            new CommuteResponses.MatchedImpactResponse(
                "regional-up-delay", "delay", "current", "minor", "UP Express delay",
                "regional-up", "UP", "Weston to Pearson Airport", null,
                "UP Express trains are delayed between Weston and Pearson Airport.",
                "Metrolinx UP Express GTFS-RT",
                List.of("segment-up-weston-pearson-airport"), List.of(),
                OffsetDateTime.parse("2026-07-29T08:15:00-04:00"),
                OffsetDateTime.parse("2026-07-29T08:20:00-04:00"),
                "Now", "active", OffsetDateTime.parse("2026-07-29T08:15:00-04:00")
            )
        ));

        assertThat(regionalPlanner.candidatesFor(commute)).hasSize(2).allSatisfy(candidate -> {
            assertThat(candidate.lineId()).isEqualTo("regional-up");
            assertThat(candidate.title()).isEqualTo("⚠️ UP Express Delay");
            assertThat(candidate.url()).isEqualTo("/?network=regional&panel=commutes&commute=commute_regional");
        });
        verify(commutePathService, never()).path("bloor", "pearson-airport");
        verify(commutePathService, never()).path("pearson-airport", "bloor");
    }

    @Test
    void dateOnlyRegionalClosureMatchesTheCommuteServiceDateWithoutInventingMidnight() {
        RegionalCommutePathService regionalPathService = mock(RegionalCommutePathService.class);
        RegionalCommuteImpactService regionalImpactService = mock(RegionalCommuteImpactService.class);
        Clock mondayMorning = Clock.fixed(Instant.parse("2026-08-10T12:00:00Z"), java.time.ZoneOffset.UTC);
        SavedCommutePushPlanner regionalPlanner = new SavedCommutePushPlanner(
            commutePathService, commuteImpactService, regionalPathService, regionalImpactService,
            mondayMorning, formatter
        );
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_barrie", account, "Barrie commute", "regional", "allandale-waterfront", "union",
            false, Instant.parse("2026-08-01T12:00:00Z")
        );
        commute.updateNotificationRule(
            true, 2, 7 * 60, 9 * 60, true, true,
            true, true, true, true, true, Instant.parse("2026-08-01T12:01:00Z")
        );
        CommuteResponses.PathResponse regionalPath = new CommuteResponses.PathResponse(
            "available", List.of("allandale-waterfront", "union"), List.of("segment-br-allandale-union"),
            List.of(), List.of("regional-br"), List.of(), 3600,
            "regional-topology-estimate", "Low-confidence regional planning estimate"
        );
        OffsetDateTime start = OffsetDateTime.parse("2026-08-17T00:00:00-04:00");
        OffsetDateTime end = OffsetDateTime.parse("2026-08-19T00:00:00-04:00");
        when(regionalPathService.path("allandale-waterfront", "union")).thenReturn(regionalPath);
        when(regionalImpactService.impactFor(regionalPath)).thenReturn(impactWith(
            new CommuteResponses.MatchedImpactResponse(
                "regional-go-123-br", "planned-closure", "planned", "planned", "Aug. 17–18 closure",
                "regional-br", "BR", "Full corridor", null, "No GO train service on the Barrie line.",
                "Metrolinx Open API", List.of("segment-br-allandale-union"), List.of(), start,
                OffsetDateTime.parse("2026-08-07T12:00:00-04:00"), "Upcoming", "scheduled", start,
                null, "Aug 17–18", false, "Aug. 17–18 closure", "construction", false, end
            )
        ));

        PushNotificationCandidate candidate = regionalPlanner.candidatesFor(commute).getFirst();

        assertThat(candidate.deliveryAllowed()).isTrue();
        assertThat(candidate.body()).contains("Closure dates: Aug 17–18.");
        assertThat(candidate.body()).doesNotContain("12:00 AM").doesNotContain("Closure starts");
        assertThat(candidate.sourceEventAt()).isNull();
    }

    private CommuteResponses.PathResponse path(String fromStationId, String toStationId, String segmentId) {
        return new CommuteResponses.PathResponse(
            "available",
            List.of(fromStationId, toStationId),
            List.of(segmentId),
            List.of(new CommuteResponses.PathSegmentHopResponse(segmentId, "line-1", fromStationId, toStationId, "forward")),
            List.of("line-1"),
            List.of(),
            300,
            "gtfs-scheduled-median",
            "Default scheduled route: 2 stations on Line 1, about 5 min"
        );
    }

    private CommuteResponses.PathResponse pathWithStations(List<String> stationIds, List<String> segmentIds) {
        return new CommuteResponses.PathResponse(
            "available",
            stationIds,
            segmentIds,
            List.of(
                new CommuteResponses.PathSegmentHopResponse(segmentIds.get(0), "line-1", stationIds.get(0), stationIds.get(1), "forward"),
                new CommuteResponses.PathSegmentHopResponse(segmentIds.get(1), "line-1", stationIds.get(1), stationIds.get(2), "forward")
            ),
            List.of("line-1"),
            List.of(),
            420,
            "gtfs-scheduled-median",
            "Default scheduled route: 3 stations on Line 1, about 7 min"
        );
    }

    private CommuteResponses.MatchedImpactResponse currentDelay(String id, String segmentId) {
        return new CommuteResponses.MatchedImpactResponse(
            id,
            "delay",
            "current",
            "minor",
            "Delay",
            "line-1",
            "1",
            "Queen to Union",
            "Southbound",
            "Line 1 Yonge-University: Delays southbound.",
            "TTC Live Alerts",
            List.of(segmentId),
            List.of(),
            OffsetDateTime.parse("2026-06-05T10:20:00-04:00"),
            OffsetDateTime.parse("2026-06-05T10:25:00-04:00"),
            null,
            "active-now",
            OffsetDateTime.parse("2026-06-05T10:20:00-04:00")
        );
    }

    private CommuteResponses.ImpactResponse impactWith(CommuteResponses.MatchedImpactResponse match) {
        return new CommuteResponses.ImpactResponse(
            "current".equals(match.status()) ? "affected" : "planned",
            match.severity(),
            "current".equals(match.status()) ? "Affected now" : "Planned impact",
            "1 impact matches this route.",
            List.of(match)
        );
    }

    private CommuteResponses.ImpactResponse clearImpact() {
        return new CommuteResponses.ImpactResponse(
            "clear",
            "clear",
            "Clear",
            "No active or planned LineWatch impacts match this route.",
            List.of()
        );
    }
}
