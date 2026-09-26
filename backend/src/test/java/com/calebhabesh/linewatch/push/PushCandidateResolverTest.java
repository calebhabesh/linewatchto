package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class PushCandidateResolverTest {
    private final SavedCommutePushPlanner savedCommutePushPlanner = mock(SavedCommutePushPlanner.class);
    private final LineSubscriptionPushPlanner lineSubscriptionPushPlanner = mock(LineSubscriptionPushPlanner.class);
    private final RegionalLineSubscriptionPushPlanner regionalLineSubscriptionPushPlanner =
        mock(RegionalLineSubscriptionPushPlanner.class);

    private PushCandidateResolver resolver;

    private final AccountEntity account = AccountEntity.create(
        "user_1",
        "user@example.com",
        "Rider",
        "hash",
        false,
        Instant.parse("2026-06-01T00:00:00Z")
    );

    @BeforeEach
    void setUp() {
        resolver = new PushCandidateResolver(
            savedCommutePushPlanner,
            lineSubscriptionPushPlanner,
            regionalLineSubscriptionPushPlanner
        );
    }

    private PushNotificationCandidate candidate(String lineId, String notificationKey) {
        return new PushNotificationCandidate(
            "user_1",
            null,
            null,
            lineId,
            lineId,
            "line-current",
            "delay",
            "bucket",
            notificationKey,
            notificationKey,
            notificationKey,
            new FormattedPushNotification("Title", "Body", "Subject", "Location", "Direction", "Scope", Instant.now()),
            "/",
            "fp",
            true
        );
    }

    @Test
    void isRegionalLineIdentifiesRegionalPrefix() {
        assertThat(PushCandidateResolver.isRegionalLine("regional-lakeshore-west")).isTrue();
        assertThat(PushCandidateResolver.isRegionalLine("regional-stouffville")).isTrue();
        assertThat(PushCandidateResolver.isRegionalLine("line-1")).isFalse();
        assertThat(PushCandidateResolver.isRegionalLine("line-2")).isFalse();
        assertThat(PushCandidateResolver.isRegionalLine("")).isFalse();
        assertThat(PushCandidateResolver.isRegionalLine(null)).isFalse();
    }

    @Test
    void resolveCommuteCandidatesHandlesNullAndDelegatesWithoutPolicy() {
        assertThat(resolver.resolveCommuteCandidates(null, (PlannedClosureFollowUpPolicy) null)).isEmpty();
        assertThat(resolver.resolveCommuteCandidates(null, (PushNotificationPreferenceEntity) null)).isEmpty();

        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1", account, "Work", "finch", "union", false, Instant.now()
        );
        PushNotificationCandidate expected = candidate("line-1", "commute_1_key");
        when(savedCommutePushPlanner.candidatesFor(commute)).thenReturn(List.of(expected));

        List<PushNotificationCandidate> result = resolver.resolveCommuteCandidates(commute, (PlannedClosureFollowUpPolicy) null);
        assertThat(result).containsExactly(expected);
        verify(savedCommutePushPlanner).candidatesFor(commute);

        // Alias check
        assertThat(resolver.candidatesFor(commute, (PlannedClosureFollowUpPolicy) null)).containsExactly(expected);
    }

    @ParameterizedTest
    @EnumSource(PlannedClosureFollowUpPolicy.class)
    void resolveCommuteCandidatesPassesExplicitPolicy(PlannedClosureFollowUpPolicy policy) {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1", account, "Work", "finch", "union", false, Instant.now()
        );
        PushNotificationCandidate expected = candidate("line-1", "commute_policy_key");
        when(savedCommutePushPlanner.candidatesFor(commute, policy)).thenReturn(List.of(expected));

        List<PushNotificationCandidate> result = resolver.resolveCommuteCandidates(commute, policy);
        assertThat(result).containsExactly(expected);
        verify(savedCommutePushPlanner).candidatesFor(commute, policy);

        // Via preferences entity
        PushNotificationPreferenceEntity preferences = mock(PushNotificationPreferenceEntity.class);
        when(preferences.getPlannedClosureFollowUpPolicy()).thenReturn(policy);
        assertThat(resolver.resolveCommuteCandidates(commute, preferences)).containsExactly(expected);
    }

    @Test
    void resolveLineCandidatesReturnsEmptyForNullOrEmptySubscribedLines() {
        assertThat(resolver.resolveLineCandidates("user_1", null, (PlannedClosureFollowUpPolicy) null)).isEmpty();
        assertThat(resolver.resolveLineCandidates("user_1", List.of(), (PlannedClosureFollowUpPolicy) null)).isEmpty();
        assertThat(resolver.resolveLineCandidates("user_1", null, (PushNotificationPreferenceEntity) null)).isEmpty();
        verifyNoInteractions(lineSubscriptionPushPlanner, regionalLineSubscriptionPushPlanner);
    }

    @Test
    void resolveLineCandidatesForTtcOnlyLinesRoutesOnlyToTtcPlanner() {
        PushNotificationCandidate ttcCandidate = candidate("line-1", "ttc_key");
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-1", "line-2")))
            .thenReturn(List.of(ttcCandidate));

        List<PushNotificationCandidate> result = resolver.resolveLineCandidates(
            "user_1",
            List.of("line-1", "line-2"),
            (PlannedClosureFollowUpPolicy) null
        );

        assertThat(result).containsExactly(ttcCandidate);
        verify(lineSubscriptionPushPlanner).candidatesFor("user_1", List.of("line-1", "line-2"));
        verifyNoInteractions(regionalLineSubscriptionPushPlanner);
    }

    @Test
    void resolveLineCandidatesForRegionalOnlyLinesRoutesOnlyToRegionalPlannerWithSmartDefault() {
        PushNotificationCandidate regionalCandidate = candidate("regional-lw", "regional_key");
        when(regionalLineSubscriptionPushPlanner.candidatesFor(
            "user_1",
            List.of("regional-lw"),
            PlannedClosureFollowUpPolicy.SMART
        )).thenReturn(List.of(regionalCandidate));

        List<PushNotificationCandidate> result = resolver.resolveLineCandidates(
            "user_1",
            List.of("regional-lw"),
            (PlannedClosureFollowUpPolicy) null
        );

        assertThat(result).containsExactly(regionalCandidate);
        verify(regionalLineSubscriptionPushPlanner).candidatesFor(
            "user_1",
            List.of("regional-lw"),
            PlannedClosureFollowUpPolicy.SMART
        );
        verifyNoInteractions(lineSubscriptionPushPlanner);
    }

    @Test
    void resolveLineCandidatesForMixedSubscriptionsPreservesOrderingAndPartitionsLines() {
        PushNotificationCandidate ttc1 = candidate("line-1", "ttc_1");
        PushNotificationCandidate ttc2 = candidate("line-2", "ttc_2");
        PushNotificationCandidate reg1 = candidate("regional-lw", "reg_1");
        PushNotificationCandidate reg2 = candidate("regional-le", "reg_2");

        List<String> subscribedLines = List.of("line-1", "regional-lw", "line-2", "regional-le");

        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-1", "line-2"), PlannedClosureFollowUpPolicy.DAY_OF))
            .thenReturn(List.of(ttc1, ttc2));
        when(regionalLineSubscriptionPushPlanner.candidatesFor("user_1", List.of("regional-lw", "regional-le"), PlannedClosureFollowUpPolicy.DAY_OF))
            .thenReturn(List.of(reg1, reg2));

        List<PushNotificationCandidate> result = resolver.resolveLineCandidates(
            "user_1",
            subscribedLines,
            PlannedClosureFollowUpPolicy.DAY_OF
        );

        // Ordering invariant: TTC candidates first, followed by Regional candidates
        assertThat(result).containsExactly(ttc1, ttc2, reg1, reg2);

        // Preference entity overload
        PushNotificationPreferenceEntity preferences = mock(PushNotificationPreferenceEntity.class);
        when(preferences.getPlannedClosureFollowUpPolicy()).thenReturn(PlannedClosureFollowUpPolicy.DAY_OF);
        assertThat(resolver.resolveLineCandidates("user_1", subscribedLines, preferences))
            .containsExactly(ttc1, ttc2, reg1, reg2);
    }

    @Test
    void constructorRequiresNonNullPlanners() {
        org.junit.jupiter.api.Assertions.assertThrows(
            NullPointerException.class,
            () -> new PushCandidateResolver(null, lineSubscriptionPushPlanner, regionalLineSubscriptionPushPlanner)
        );
        org.junit.jupiter.api.Assertions.assertThrows(
            NullPointerException.class,
            () -> new PushCandidateResolver(savedCommutePushPlanner, null, regionalLineSubscriptionPushPlanner)
        );
        org.junit.jupiter.api.Assertions.assertThrows(
            NullPointerException.class,
            () -> new PushCandidateResolver(savedCommutePushPlanner, lineSubscriptionPushPlanner, null)
        );
    }
}
