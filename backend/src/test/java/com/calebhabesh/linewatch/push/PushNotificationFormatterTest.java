package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class PushNotificationFormatterTest {
    private final PushNotificationFormatter formatter = new PushNotificationFormatter();

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
            Planned closure between Keele and Union stations.
            Closure dates: Sat, Jun 6 – Sun, Jun 7.
            Closure hours: 11:59 PM – 5:00 AM.
            Shuttle buses are running.
            Starts today.
            Affects Evening Route (Return).
            🕗 Closure starts Jun 7, 12:00 AM""");
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

        assertThat(result.body()).isEqualTo("""
            Delays southbound at Eglinton Station.
            Starts within 24 hours.""");
    }
}
