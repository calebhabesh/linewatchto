package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.regional.RegionalAlertStore;
import com.calebhabesh.linewatch.regional.RegionalIngestionFreshness;
import com.calebhabesh.linewatch.regional.RegionalNormalizedAlert;
import com.calebhabesh.linewatch.regional.RegionalTripChangeResponses;
import com.calebhabesh.linewatch.regional.RegionalTripChangeService;
import java.time.LocalDate;
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
    void uncertainNoticeCannotProduceADefiniteLineNotification() {
        when(freshness.isFresh()).thenReturn(true);
        when(alertStore.findActiveAlerts()).thenReturn(List.of(new RegionalNormalizedAlert(
            "regional-uncertain", "metrolinx-go-service-alerts", "M-uncertain", "regional-br",
            "advisory", "Possible closure", "Timing unverified", "construction", null, null,
            OffsetDateTime.parse("2026-07-29T11:00:00Z"), List.of(), List.of(), "unknown", ""
        )));
        assertThat(planner.candidatesFor(
            "user_1", List.of("regional-br"), PlannedClosureFollowUpPolicy.SMART
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

    @Test
    void formatsDateOnlyPlannedClosureWithoutAFalseMidnightStart() {
        RegionalNormalizedAlert closure = new RegionalNormalizedAlert(
            "regional-go-123-br", "metrolinx-go-service-alerts", "M00123", "regional-br",
            "planned-closure", "Aug. 30–31 closure", "No GO train service on the Barrie line.",
            "construction", OffsetDateTime.parse("2026-08-30T00:00:00-04:00"),
            OffsetDateTime.parse("2026-09-01T00:00:00-04:00"),
            OffsetDateTime.parse("2026-08-07T12:00:00-04:00"), List.of(), List.of(),
            "text-date-range", "{}"
        );
        when(freshness.isFresh()).thenReturn(true);
        when(alertStore.findActiveAlerts()).thenReturn(List.of(closure));

        PushNotificationCandidate candidate = planner.candidatesFor(
            "user_1", List.of("regional-br"), PlannedClosureFollowUpPolicy.SMART
        ).getFirst();

        assertThat(candidate.category()).isEqualTo("line-planned");
        assertThat(candidate.body()).contains("Closure dates: Aug 30–31.");
        assertThat(candidate.body()).doesNotContain("12:00 AM").doesNotContain("Closure starts");
        assertThat(candidate.sourceEventAt()).isNull();
    }

    @Test
    void plansATrainCancellationForTheSubscribedCorridorWithoutCallingItADelay() {
        RegionalTripChangeService tripChangeService = mock(RegionalTripChangeService.class);
        RegionalLineSubscriptionPushPlanner cancellationPlanner = new RegionalLineSubscriptionPushPlanner(
            alertStore, freshness, clock, new PushNotificationFormatter(), tripChangeService
        );
        when(freshness.isFresh()).thenReturn(true);
        when(alertStore.findActiveAlerts()).thenReturn(List.of());
        when(tripChangeService.get(null, null, 250)).thenReturn(new RegionalTripChangeResponses.Response(
            OffsetDateTime.now(clock), true, "Metrolinx GO trip-change feeds", OffsetDateTime.now(clock), 1,
            List.of(cancellation())
        ));

        assertThat(cancellationPlanner.candidatesFor(
            "user_1", List.of("regional-st"), PlannedClosureFollowUpPolicy.SMART
        )).singleElement().satisfies(candidate -> {
            assertThat(candidate.eventType()).isEqualTo("trip-cancellation");
            assertThat(candidate.category()).isEqualTo("line-trip-change");
            assertThat(candidate.title()).isEqualTo("⚠️ GO ST Stouffville Train Cancellation");
            assertThat(candidate.url()).isEqualTo("/?network=regional&panel=trip-changes");
        });
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

    private RegionalTripChangeResponses.TripChange cancellation() {
        return new RegionalTripChangeResponses.TripChange(
            "regional-trip-change-2026-07-29-ST7824-cancellation", "cancellation", "ST7824", "7824",
            "regional-st", "ST", "Stouffville", "Old Elm", LocalDate.parse("2026-07-29"),
            OffsetDateTime.parse("2026-07-29T08:00:00-04:00"), OffsetDateTime.now(clock), true,
            "Train cancelled - Union Station 8:00 AM - Old Elm GO 9:13 AM",
            "The Union Station 8:00 AM train has been cancelled due to an operational issue.",
            "operational issue", List.of("metrolinx-go-service-alerts"), List.of(
                new RegionalTripChangeResponses.AffectedStop(
                    "union", "Union Station", "cancellation", OffsetDateTime.parse("2026-07-29T08:00:00-04:00"), ""
                ),
                new RegionalTripChangeResponses.AffectedStop(
                    "old-elm", "Old Elm", "cancellation", OffsetDateTime.parse("2026-07-29T09:13:00-04:00"), ""
                )
            )
        );
    }
}
