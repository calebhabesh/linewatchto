package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.commute.CommuteResponses;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class SavedCommuteTripTimesTest {
    private final SavedCommuteEntity commute = weekdayCommute();

    // Mon Nov 16 11:00 PM to Tue 5:30 AM: misses both weekday trips.
    private final CommuteResponses.ServiceWindow monNight = window("2026-11-16T23:00:00-05:00", "2026-11-17T05:30:00-05:00");
    // Thu Nov 19 6:00 PM to Fri 5:30 AM: meets Thursday's return trip only.
    private final CommuteResponses.ServiceWindow thuEvening = window("2026-11-19T18:00:00-05:00", "2026-11-20T05:30:00-05:00");
    // Tue Nov 17 11:00 PM to Wed 7:00 AM: meets Wednesday's outbound trip.
    private final CommuteResponses.ServiceWindow tueNightLate = window("2026-11-17T23:00:00-05:00", "2026-11-18T07:00:00-05:00");

    private static SavedCommuteEntity weekdayCommute() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "c", AccountEntity.create("user_1", "rider@example.com", "Rider", "$2a$hash", false,
                Instant.parse("2026-06-05T14:00:00Z")),
            "Work", "a", "b", true, Instant.parse("2026-06-05T14:30:00Z"));
        // Weekdays, 6:30 to 9:30 AM out and 3:00 to 7:00 PM back.
        commute.updateNotificationRule(true, 62, 390, 570, 62, 900, 1140, true, true, true, true, true, true, true,
            Instant.parse("2026-06-05T14:31:00Z"));
        return commute;
    }

    @Test
    void completeListMissingEveryTripIsOutsideAndNeverPushed() {
        CommuteResponses.MatchedImpactResponse nightly = planned(List.of(monNight), true);
        assertThat(SavedCommuteTripTimes.outside(commute, "outbound", nightly)).isTrue();
        assertThat(SavedCommuteTripTimes.outside(commute, "return", nightly)).isTrue();
        assertThat(SavedCommuteTripTimes.pushRelevant(commute, "outbound", nightly)).isFalse();
    }

    @Test
    void theFirstMeetingWindowIsJudgedPerLegAndIsTheOccurrencePushesFollow() {
        CommuteResponses.MatchedImpactResponse series = planned(List.of(thuEvening, monNight, tueNightLate), true);
        // Outbound: Wednesday morning is the first trip it meets, though Monday night comes first.
        assertThat(SavedCommuteTripTimes.firstMeetingWindow(commute, "outbound", series)).contains(tueNightLate);
        // Return: only Thursday evening meets the trip home.
        assertThat(SavedCommuteTripTimes.firstMeetingWindow(commute, "return", series)).contains(thuEvening);
        assertThat(SavedCommuteTripTimes.outside(commute, "outbound", series)).isFalse();
        assertThat(SavedCommuteTripTimes.pushRelevant(commute, "return", series)).isTrue();
    }

    @Test
    void partialListMissingEveryTripIsNotPushedYetButNotCalledOutside() {
        CommuteResponses.MatchedImpactResponse partial = planned(List.of(monNight), false);
        assertThat(SavedCommuteTripTimes.outside(commute, "outbound", partial)).isFalse();
        assertThat(SavedCommuteTripTimes.pushRelevant(commute, "outbound", partial)).isFalse();
        // A later listed night that meets the trip makes it relevant.
        assertThat(SavedCommuteTripTimes.pushRelevant(commute, "outbound", planned(List.of(monNight, tueNightLate), false))).isTrue();
    }

    @Test
    void withNoWindowsPushesFallBackToTheStartTimeAndTheDashboardCountsIt() {
        CommuteResponses.MatchedImpactResponse startsAtNight = planned(null, false)
            .withEventStartAt(OffsetDateTime.parse("2026-11-16T23:00:00-05:00"));
        CommuteResponses.MatchedImpactResponse startsInTheMorning = planned(null, false)
            .withEventStartAt(OffsetDateTime.parse("2026-11-17T07:00:00-05:00"));
        assertThat(SavedCommuteTripTimes.outside(commute, "outbound", startsAtNight)).isFalse();
        assertThat(SavedCommuteTripTimes.pushRelevant(commute, "outbound", startsAtNight)).isFalse();
        assertThat(SavedCommuteTripTimes.pushRelevant(commute, "outbound", startsInTheMorning)).isTrue();
        assertThat(SavedCommuteTripTimes.pushRelevant(commute, "outbound", planned(null, false))).isTrue();
    }

    @Test
    void workInEffectNowIsNeverJudgedByItsWindows() {
        CommuteResponses.MatchedImpactResponse current = planned(List.of(monNight), true);
        current = new CommuteResponses.MatchedImpactResponse(
            current.id(), current.kind(), "current", "major", current.title(), current.lineId(), current.lineNumber(),
            null, null, null, "TTC", List.of(), List.of(), null, null, null, "active-now", null, false)
            .withServiceWindows(current.serviceWindows());
        assertThat(SavedCommuteTripTimes.outside(commute, "outbound", current)).isFalse();
        assertThat(SavedCommuteTripTimes.firstMeetingWindow(commute, "outbound", current)).isEmpty();
    }

    @Test
    void openEndedAndDateOnlyWindows() {
        // A window with no end runs on into the trips.
        assertThat(SavedCommuteTripTimes.outside(commute, "outbound", planned(List.of(
            new CommuteResponses.ServiceWindow(monNight.startsAt(), null, false)), true))).isFalse();
        // Date-only GO/UP windows compare service days: a weekend misses weekday trips.
        CommuteResponses.ServiceWindow weekend = new CommuteResponses.ServiceWindow(
            OffsetDateTime.parse("2026-11-21T00:00:00-05:00"), OffsetDateTime.parse("2026-11-23T00:00:00-05:00"), true);
        assertThat(SavedCommuteTripTimes.outside(commute, "outbound", planned(List.of(weekend), true))).isTrue();
        CommuteResponses.ServiceWindow monday = new CommuteResponses.ServiceWindow(
            OffsetDateTime.parse("2026-11-23T00:00:00-05:00"), OffsetDateTime.parse("2026-11-24T00:00:00-05:00"), true);
        assertThat(SavedCommuteTripTimes.pushRelevant(commute, "outbound", planned(List.of(monday), true))).isTrue();
    }

    private static CommuteResponses.ServiceWindow window(String start, String end) {
        return new CommuteResponses.ServiceWindow(OffsetDateTime.parse(start), OffsetDateTime.parse(end), false);
    }

    private static CommuteResponses.MatchedImpactResponse planned(List<CommuteResponses.ServiceWindow> windows, boolean complete) {
        return new CommuteResponses.MatchedImpactResponse(
            "p", "planned-closure", "planned", "planned", "Planned Closure", "line-1", "1", null, null, null, "TTC",
            List.of(), List.of(), null, null, null, "upcoming", null, false)
            .withServiceWindows(windows == null ? null : new CommuteResponses.ServiceWindows(windows, complete));
    }
}
