package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class PushNotificationFormatterTest {
    // Sat, Jun 6, 6:00 AM in Toronto.
    private final PushNotificationFormatter formatter =
        new PushNotificationFormatter(Clock.fixed(Instant.parse("2026-06-06T10:00:00Z"), ZoneOffset.UTC));

    private static PushNotificationFormatter formatterAt(String instant) {
        return new PushNotificationFormatter(Clock.fixed(Instant.parse(instant), ZoneOffset.UTC));
    }

    private static PushNotificationFacts plannedFacts(
        String reminderBucket,
        String description,
        String start,
        String end,
        String closureHours,
        String closureDates,
        String currentEffect
    ) {
        return new PushNotificationFacts(
            "line-2", "2", "planned-closure", reminderBucket, "Jane to Ossington", "Eastbound & Westbound",
            true, null, null, Instant.parse(start), "Planned track work",
            "Line 2 Bloor-Danforth: Jane to Ossington", description, closureHours, closureDates,
            end == null ? null : Instant.parse(end), currentEffect
        );
    }

    @Test
    void plannedClosureInEffectReadsAsItsLiveEffectWithStartAndEnd() {
        // Nov 1, 2026 (the autumn DST change): TTC's live child alert appeared at 8:00 AM.
        FormattedPushNotification result = formatterAt("2026-11-01T13:00:53Z").formatActive(plannedFacts(
            "on-change",
            "There is no subway service between Jane and Ossington stations due to planned track work. "
                + "Shuttle buses are running.",
            "2026-11-01T13:00:00Z", "2026-11-01T17:00:00Z", null, null, "suspension"
        ));

        assertThat(result.title()).isEqualTo("⚠️ Line 2 Bloor-Danforth Suspension");
        // Cleared and window-ended notifications reuse the subject.
        assertThat(result.notificationSubject()).isEqualTo("Line 2 Bloor-Danforth Planned Advisory");
        assertThat(result.body()).isEqualTo("""
            There is no subway service between Jane and Ossington stations due to planned track work. Shuttle buses are running.
            🕗 Planned advisory · Started 8:00 AM · Until 12:00 PM""");
    }

    @Test
    void plannedReminderSaysWhenItStartsRelativeToToday() {
        FormattedPushNotification sameDay = formatterAt("2026-11-01T11:00:00Z").formatActive(plannedFacts(
            "closure-morning",
            "On Sunday, November 1, subway service between Jane and Ossington stations will start by 12 p.m.",
            "2026-11-01T13:00:00Z", "2026-11-01T17:00:00Z", "8:00 AM – 12:00 PM", "Sun, Nov 1", null
        ));
        // The start rides in the title, so a collapsed notification shows it.
        assertThat(sameDay.title()).isEqualTo("⚠️ Line 2 Bloor-Danforth Planned Advisory · Today 8 AM");
        assertThat(sameDay.notificationSubject()).isEqualTo("Line 2 Bloor-Danforth Planned Advisory");
        // A single occurrence drops the dates and hours lines its start and end line repeats.
        assertThat(sameDay.body()).isEqualTo("""
            On Sunday, November 1, subway service between Jane and Ossington stations will start by 12 p.m.
            Shuttle buses are running.
            🕗 Starts today at 8:00 AM · Until 12:00 PM""");

        FormattedPushNotification tonight = formatterAt("2026-11-09T15:00:00Z").formatActive(plannedFacts(
            "closure-morning", null,
            "2026-11-10T04:59:00Z", "2026-11-10T11:00:00Z", "11:59 PM – 6:00 AM", "Mon, Nov 9 – Thu, Nov 12", null
        ));
        assertThat(tonight.title()).endsWith(" · Today 11:59 PM");
        assertThat(tonight.body()).contains("Advisory dates: Mon, Nov 9 – Thu, Nov 12.")
            .endsWith("🕗 Starts today at 11:59 PM · Until tomorrow 6:00 AM");

        FormattedPushNotification tomorrow = formatterAt("2026-11-06T15:00:00Z").formatActive(plannedFacts(
            "closure-24h", null,
            "2026-11-07T05:00:00Z", "2026-11-09T11:00:00Z", "All Day", "Sat, Nov 7 – Sun, Nov 8", null
        ));
        assertThat(tomorrow.title()).endsWith(" · Tomorrow 12 AM");
        assertThat(tomorrow.body()).endsWith("🕗 Starts tomorrow at 12:00 AM · Until Mon 6:00 AM");

        FormattedPushNotification announced = formatterAt("2026-11-01T15:00:00Z").formatActive(plannedFacts(
            "on-change", null,
            "2026-11-10T04:59:00Z", "2026-11-10T11:00:00Z", "11:59 PM – 6:00 AM", "Mon, Nov 9 – Thu, Nov 12", null
        ));
        assertThat(announced.title()).isEqualTo("⚠️ Line 2 Bloor-Danforth Planned Advisory · Mon, Nov 9");
        assertThat(announced.body()).endsWith("🕗 Starts Mon, Nov 9 at 11:59 PM · Until Tue 6:00 AM");
        assertThat(announced.body()).doesNotContain("Starts within", "Starts today.");
    }

    @Test
    void formatsActiveSuspensionWithCanonicalTitleAndTorontoTime() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-2",
            "2",
            "suspension",
            "on-change",
            "Broadview to Victoria Park",
            null,
            false,
            null,
            null,
            Instant.parse("2026-06-21T23:19:00Z")
        ));

        assertThat(result.title()).isEqualTo("⚠️ Line 2 Bloor-Danforth Suspension");
        assertThat(result.body()).isEqualTo("""
            No service between Broadview and Victoria Park stations.
            🕗 Jun 21, 7:19 PM""");
        assertThat(result.notificationSubject()).isEqualTo("Line 2 Bloor-Danforth Suspension");
        assertThat(result.eventLocation()).isEqualTo("Broadview to Victoria Park");
        assertThat(result.scopeLabel()).isNull();
        assertThat(result.sourceEventAt()).isEqualTo(Instant.parse("2026-06-21T23:19:00Z"));
    }

    @Test
    void formatsSavedCommuteContextWithoutChangingUserCapitalization() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-1",
            "1",
            "delay",
            "on-change",
            "Finch to Union",
            "Southbound",
            false,
            "Morning commute",
            "outbound",
            Instant.parse("2026-06-05T14:20:00Z")
        ));

        assertThat(result.title()).isEqualTo("⚠️ Line 1 Yonge-University Delay");
        assertThat(result.body()).isEqualTo("""
            Delays southbound between Finch and Union stations.
            Affects Morning commute (Outbound).
            🕗 Jun 5, 10:20 AM""");
        assertThat(result.scopeLabel()).isEqualTo("Morning commute (Outbound)");
    }

    @Test
    void formatsReturnLegAndPlannedReminder() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-2",
            "2",
            "planned-closure",
            "closure-morning",
            "Keele to Union",
            null,
            true,
            "Evening Route",
            "return",
            Instant.parse("2026-06-07T04:00:00Z"),
            null,
            null,
            null,
            "11:59 PM – 5:00 AM",
            "Sat, Jun 6 – Sun, Jun 7"
        ));

        assertThat(result.body()).isEqualTo("""
            Planned advisory between Keele and Union stations.
            Advisory dates: Sat, Jun 6 – Sun, Jun 7.
            Advisory hours: 11:59 PM – 5:00 AM.
            Shuttle buses are running.
            Affects Evening Route (Return).
            🕗 Starts tomorrow at 12:00 AM""");
    }

    @Test
    void omitsClockLineWhenSourceStartIsUnknown() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-4",
            "4",
            "delay",
            "on-change",
            null,
            null,
            false,
            null,
            null,
            null
        ));

        assertThat(result.title()).isEqualTo("⚠️ Line 4 Sheppard Delay");
        assertThat(result.body()).isEqualTo("Service is affected on this line.");
        assertThat(result.body()).doesNotContain("🕗");
    }

    @Test
    void formatsClearanceFromPersistedContextAndSuppliedClock() {
        FormattedPushNotification result = formatter.formatCleared(
            "Line 2 Bloor-Danforth Suspension",
            "Broadview to Victoria Park",
            null,
            Instant.parse("2026-06-22T00:04:00Z")
        );

        assertThat(result.title()).isEqualTo("✅ Line 2 Bloor-Danforth Suspension Cleared");
        assertThat(result.body()).isEqualTo("""
            Service between Broadview and Victoria Park stations has resumed.
            🕗 Jun 21, 8:04 PM""");
        assertThat(result.sourceEventAt()).isEqualTo(Instant.parse("2026-06-22T00:04:00Z"));
    }

    @Test
    void formatsStationOnlyClearanceAndSavedCommuteContext() {
        FormattedPushNotification result = formatter.formatCleared(
            "Line 2 Bloor-Danforth Delay",
            "Main Street Station",
            "Work Trip (Outbound)",
            Instant.parse("2026-06-05T15:00:00Z")
        );

        assertThat(result.body()).isEqualTo("""
            Service affecting Main Street Station has resumed.
            No longer affects Work Trip (Outbound).
            🕗 Jun 5, 11:00 AM""");
    }

    @Test
    void formatsClearanceWithResumedStationRangeCopy() {
        FormattedPushNotification result = formatter.formatCleared(
            "Line 5 Eglinton Suspension",
            "Don Valley to Pharmacy",
            null,
            Instant.parse("2026-06-25T03:20:00Z")
        );

        assertThat(result.body()).isEqualTo("""
            Service between Don Valley and Pharmacy stations has resumed.
            🕗 Jun 24, 11:20 PM""");
    }

    @Test
    void formatsTmuAcronymInPersistedClearanceLocation() {
        FormattedPushNotification result = formatter.formatCleared(
            "Line 1 Yonge-University Delay",
            "Tmu station",
            "Northbound",
            null,
            Instant.parse("2026-07-04T02:07:00Z")
        );

        assertThat(result.body()).isEqualTo("""
            Service has resumed northbound at TMU station.
            🕗 Jul 3, 10:07 PM""");
        assertThat(result.eventLocation()).isEqualTo("TMU station");
    }

    @Test
    void formatsWinterTimeUsingTorontoStandardTime() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-5",
            "5",
            "reduced-speed-zone",
            "on-change",
            "Mount Dennis to Keelesdale",
            null,
            false,
            null,
            null,
            Instant.parse("2026-01-21T00:19:00Z")
        ));

        assertThat(result.body()).endsWith("🕗 Jan 20, 7:19 PM");
    }

    @Test
    void convertsSourceClockTimesToTwelveHourPushCopy() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "regional-ki",
            "KI",
            "delay",
            "on-change",
            "Bramalea to Union",
            null,
            false,
            null,
            null,
            Instant.parse("2026-08-03T19:00:00Z"),
            null,
            "Kitchener service update",
            "Trains will operate hourly from 15:30 to 23:00."
        ));

        assertThat(result.body()).isEqualTo("""
            Trains will operate hourly from 3:30 PM to 11:00 PM.
            🕗 Aug 3, 3:00 PM""");
    }

    @Test
    void prioritizesGroupedReducedSpeedZoneStationRangeOverGenericDescription() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-1",
            "1",
            "reduced-speed-zone",
            "on-change",
            "Eglinton <-> Davisville",
            "Northbound & Southbound",
            false,
            null,
            null,
            Instant.parse("2026-07-22T14:40:00Z"),
            null,
            "Reduced Speed Zone",
            "TTC reports reduced speeds on this corridor."
        ));

        assertThat(result.body()).isEqualTo("""
            Reduced speeds in both directions between Eglinton and Davisville stations.
            🕗 Jul 22, 10:40 AM""");
        assertThat(result.eventLocation()).isEqualTo("Eglinton <-> Davisville");
    }

    @Test
    void formatsGroupedReducedSpeedZoneClearanceAsStationRange() {
        FormattedPushNotification result = formatter.formatCleared(
            "Line 1 Yonge-University Reduced Speed Zone",
            "Eglinton <-> Davisville",
            "Northbound & Southbound",
            null,
            Instant.parse("2026-07-22T16:00:00Z")
        );

        assertThat(result.body()).isEqualTo("""
            Service has resumed in both directions between Eglinton and Davisville stations.
            🕗 Jul 22, 12:00 PM""");
    }

    @Test
    void formatsMultiSectionReducedSpeedZoneClearanceWithEverySection() {
        FormattedPushNotification result = formatter.formatCleared(
            "Line 1 Yonge-University Reduced Speed Zone",
            "Eglinton to Davisville (Northbound); St Clair to Summerhill (Southbound)",
            "Northbound & Southbound",
            null,
            Instant.parse("2026-07-22T16:00:00Z")
        );

        assertThat(result.body()).isEqualTo("""
            Service across Eglinton to Davisville (Northbound) and St Clair to Summerhill (Southbound) has resumed.
            🕗 Jul 22, 12:00 PM""");
    }

    @Test
    void includesCauseWhenSourceSuppliesReason() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-5",
            "5",
            "delay",
            "on-change",
            "Pharmacy to Sloan",
            "Westbound",
            false,
            null,
            null,
            Instant.parse("2026-06-24T12:10:00Z"),
            "collision blocking the tracks"
        ));

        assertThat(result.body()).isEqualTo("""
            Delays westbound between Pharmacy and Sloan stations due to collision blocking the tracks.
            🕗 Jun 24, 8:10 AM""");
    }

    @Test
    void formatsStructuredFallbackAsNaturalSentenceWithoutCauseLabel() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-6",
            "6",
            "delay",
            "on-change",
            "Finch West to Humber College",
            "Eastbound & Westbound",
            false,
            null,
            null,
            Instant.parse("2026-06-25T09:03:00Z"),
            "Due to an earlier switch issue"
        ));

        assertThat(result.body()).isEqualTo("""
            Delays in both directions between Finch West and Humber College stations due to an earlier switch issue.
            🕗 Jun 25, 5:03 AM""");
    }

    @Test
    void usesControlledFallbacksForUnknownLineAndEvent() {
        FormattedPushNotification numbered = formatter.formatActive(new PushNotificationFacts(
            "line-3", "3", "unknown", "on-change", "Test location", null, false, null, null, null
        ));
        FormattedPushNotification unnumbered = formatter.formatActive(new PushNotificationFacts(
            "unknown", null, "delay", "on-change", null, null, false, null, null, null
        ));

        assertThat(numbered.title()).isEqualTo("⚠️ Line 3 Service Alert");
        assertThat(unnumbered.title()).isEqualTo("⚠️ TTC Service Alert");
    }

    @Test
    void normalizesWhitespaceAndAvoidsDuplicateDirectionAndPunctuation() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-1",
            "1",
            "delay",
            "closure-24h",
            "  Delays   southbound at Eglinton Station... ",
            "Southbound",
            false,
            null,
            null,
            null
        ));

        assertThat(result.body()).isEqualTo("Delays southbound at Eglinton Station.");
    }
}
