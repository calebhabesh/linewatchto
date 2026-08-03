package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.regional.RegionalAlertStore;
import com.calebhabesh.linewatch.regional.RegionalIngestionFreshness;
import com.calebhabesh.linewatch.regional.RegionalNormalizedAlert;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class RegionalLineSubscriptionPushPlannerTest {
    private final RegionalAlertStore alertStore = mock(RegionalAlertStore.class);
    private final RegionalIngestionFreshness freshness = mock(RegionalIngestionFreshness.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-07-29T12:00:00Z"), ZoneOffset.UTC);
    private final RegionalLineSubscriptionPushPlanner planner = new RegionalLineSubscriptionPushPlanner(
        alertStore, freshness, clock, new PushNotificationFormatter()
    );

    @Test
    void plansSubscribedCorridorAlertOnlyWhileRegionalIngestionIsFresh() {
        RegionalNormalizedAlert alert = new RegionalNormalizedAlert(
            "regional-alert-lw",
            "metrolinx-go-service-alerts",
            "lw-123",
            "regional-lw",
            "delay",
            "Lakeshore West trains are delayed",
            "Lakeshore West trains are delayed between Oakville and Union.",
            "signal issue",
            OffsetDateTime.parse("2026-07-29T07:40:00-04:00"),
            null,
            OffsetDateTime.parse("2026-07-29T07:55:00-04:00"),
            List.of("union", "oakville"),
            List.of(),
            "{}"
        );
        when(freshness.isFresh()).thenReturn(true, false);
        when(alertStore.findActiveAlerts()).thenReturn(List.of(alert));

        assertThat(planner.candidatesFor(
            "user_1", List.of("regional-lw"), PlannedClosureFollowUpPolicy.SMART
        )).singleElement().satisfies(candidate -> {
            assertThat(candidate.title()).isEqualTo("⚠️ GO LW Lakeshore West Delay");
            assertThat(candidate.category()).isEqualTo("line-current");
            assertThat(candidate.url()).isEqualTo(
                "/?network=regional&panel=delays&impactKind=delay&impactId=regional-alert-lw"
            );
        });
        assertThat(planner.candidatesFor(
            "user_1", List.of("regional-lw"), PlannedClosureFollowUpPolicy.SMART
        )).isEmpty();
    }

    @Test
    void feedTimestampRefreshDoesNotChangeRegionalNotificationIdentity() {
        RegionalNormalizedAlert firstPoll = alertWithSourceUpdatedAt("2026-08-03T19:20:00Z");
        RegionalNormalizedAlert secondPoll = alertWithSourceUpdatedAt("2026-08-03T19:25:00Z");
        when(freshness.isFresh()).thenReturn(true);
        when(alertStore.findActiveAlerts()).thenReturn(List.of(firstPoll), List.of(secondPoll));

        PushNotificationCandidate first = planner.candidatesFor(
            "user_1", List.of("regional-br"), PlannedClosureFollowUpPolicy.SMART
        ).getFirst();
        PushNotificationCandidate second = planner.candidatesFor(
            "user_1", List.of("regional-br"), PlannedClosureFollowUpPolicy.SMART
        ).getFirst();

        assertThat(second.sourceUpdatedAt()).isNotEqualTo(first.sourceUpdatedAt());
        assertThat(second.updateFingerprint()).isEqualTo(first.updateFingerprint());
        assertThat(second.dedupeKey()).isEqualTo(first.dedupeKey());
    }

    private RegionalNormalizedAlert alertWithSourceUpdatedAt(String sourceUpdatedAt) {
        return new RegionalNormalizedAlert(
            "regional-alert-br",
            "metrolinx-go-service-alerts",
            "br-123",
            "regional-br",
            "delay",
            "Barrie train delay",
            "The Aurora GO train will begin at Maple GO due to an earlier signal issue.",
            "signal issue",
            OffsetDateTime.parse("2026-08-03T15:05:00-04:00"),
            null,
            OffsetDateTime.parse(sourceUpdatedAt),
            List.of("aurora", "maple", "union"),
            List.of(),
            "{}"
        );
    }
}
