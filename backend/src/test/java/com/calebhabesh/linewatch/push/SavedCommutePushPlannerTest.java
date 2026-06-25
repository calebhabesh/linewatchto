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
            assertThat(candidate.dedupeKey()).isEqualTo(
                "user_1|commute_1|outbound|delay|on-change|delay-line-1|segments:line-1-finch-union|stations:"
            );
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
                "Weekend closure",
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
                OffsetDateTime.parse("2026-06-07T00:00:00-04:00")
            )
        ));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).singleElement().satisfies(candidate -> {
            assertThat(candidate.legId()).isEqualTo("return");
            assertThat(candidate.title()).isEqualTo("⚠️ Line 2 Bloor-Danforth Planned Closure");
            assertThat(candidate.body()).contains("Affects Evening Route (Return).");
            assertThat(candidate.body()).endsWith("🕗 Jun 7, 12:00 AM");
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
            assertThat(candidate.title()).isEqualTo("⚠️ Line 1 Yonge-University Reduced Speed Zone");
        });
    }

    @Test
    void plannedClosureInside24hCreatesOnChangeAnd24hCandidates() {
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

        assertThat(candidates).hasSize(2);
        assertThat(candidates).extracting(PushNotificationCandidate::reminderBucket)
            .containsExactlyInAnyOrder("on-change", "closure-24h");
    }

    @Test
    void plannedClosureOnSameTorontoDateAtMorningCreatesClosureMorningCandidate() {
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

        assertThat(candidates).hasSize(3);
        assertThat(candidates).extracting(PushNotificationCandidate::reminderBucket)
            .containsExactlyInAnyOrder("on-change", "closure-24h", "closure-morning");
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
