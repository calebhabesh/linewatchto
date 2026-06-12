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
    private final SavedCommutePushPlanner planner = new SavedCommutePushPlanner(commutePathService, commuteImpactService);

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
                "TTC Live Alerts",
                List.of("line-1-finch-union"),
                List.of(),
                OffsetDateTime.parse("2026-06-05T10:20:00-04:00"),
                OffsetDateTime.parse("2026-06-05T10:25:00-04:00"),
                null,
                "active-now"
            )
        ));
        when(commuteImpactService.impactFor(returnPath)).thenReturn(clearImpact());

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).singleElement().satisfies(candidate -> {
            assertThat(candidate.accountId()).isEqualTo("user_1");
            assertThat(candidate.commuteId()).isEqualTo("commute_1");
            assertThat(candidate.legId()).isEqualTo("outbound");
            assertThat(candidate.category()).isEqualTo("saved-commute-impact");
            assertThat(candidate.title()).isEqualTo("Morning commute affected");
            assertThat(candidate.body()).isEqualTo("Delay on Line 1: Finch to Union");
            assertThat(candidate.url()).isEqualTo("/?panel=commutes&commute=commute_1");
            assertThat(candidate.dedupeKey()).isEqualTo(
                "user_1|commute_1|outbound|delay|delay-line-1|segments:line-1-finch-union|stations:"
            );
        });
    }

    @Test
    void plansReturnTripImpactWhenReturnTripIsWatched() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_2",
            account,
            "Evening route",
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
                "TTC Service Advisory",
                List.of("line-2-union-keele"),
                List.of(),
                OffsetDateTime.parse("2026-06-06T00:00:00-04:00"),
                OffsetDateTime.parse("2026-06-05T09:00:00-04:00"),
                "Sat 12:00 AM - Mon 5:00 AM",
                "upcoming"
            )
        ));

        List<PushNotificationCandidate> candidates = planner.candidatesFor(commute);

        assertThat(candidates).singleElement().satisfies(candidate -> {
            assertThat(candidate.legId()).isEqualTo("return");
            assertThat(candidate.title()).isEqualTo("Evening route planned closure");
            assertThat(candidate.body()).isEqualTo("Planned Closure on Line 2: Keele to Union");
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
