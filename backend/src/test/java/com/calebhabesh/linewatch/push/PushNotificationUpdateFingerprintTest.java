package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class PushNotificationUpdateFingerprintTest {
    @Test
    void ignoresRenderedCopyAndNavigationChanges() {
        OffsetDateTime sourceUpdatedAt = OffsetDateTime.parse("2026-07-21T15:30:00-04:00");
        FormattedPushNotification original = notification(
            "⚠️ Line 2 Bloor-Danforth Planned Closure",
            "Starts today."
        );
        FormattedPushNotification revisedCopy = notification(
            "⚠️ Line 2 Bloor-Danforth Planned Closure",
            "Closure dates: Tue, Jul 21 – Wed, Jul 22.\nStarts today."
        );

        assertThat(PushNotificationUpdateFingerprint.forCandidate(
            sourceUpdatedAt, "planned-closure", original, "/?panel=closures"
        )).isEqualTo(PushNotificationUpdateFingerprint.forCandidate(
            sourceUpdatedAt, "planned-closure", revisedCopy, "/?panel=closures&view=current"
        ));
    }

    @Test
    void changesWhenTheSourceRevisionChanges() {
        FormattedPushNotification notification = notification(
            "⚠️ Line 2 Bloor-Danforth Planned Closure",
            "Starts today."
        );

        assertThat(PushNotificationUpdateFingerprint.forCandidate(
            OffsetDateTime.parse("2026-07-21T15:30:00-04:00"),
            "planned-closure",
            notification,
            "/?panel=closures"
        )).isNotEqualTo(PushNotificationUpdateFingerprint.forCandidate(
            OffsetDateTime.parse("2026-07-21T15:35:00-04:00"),
            "planned-closure",
            notification,
            "/?panel=closures"
        ));
    }

    @Test
    void regionalContentIgnoresDayWordsButNotTheEventTime() {
        java.time.Instant start = java.time.Instant.parse("2026-11-07T05:00:00Z");
        FormattedPushNotification announced = regional(
            "No train service between Union and Exhibition.\n🕗 Starts Sat, Nov 7 at 12:00 AM", start
        );
        FormattedPushNotification dayBefore = new FormattedPushNotification(
            "⚠️ Lakeshore West Planned Advisory · Tomorrow 12 AM",
            "No train service between Union and Exhibition.\n🕗 Starts tomorrow at 12:00 AM",
            "Lakeshore West Planned Advisory", "Union to Exhibition", null, null, start
        );
        FormattedPushNotification moved = regional(
            "No train service between Union and Exhibition.\n🕗 Starts tomorrow at 12:00 AM",
            start.plusSeconds(3600)
        );
        FormattedPushNotification reworded = regional(
            "No train service between Union and Mimico.\n🕗 Starts tomorrow at 12:00 AM", start
        );

        String fingerprint = PushNotificationUpdateFingerprint.forRegionalCandidate(
            "planned-closure", announced, "/?network=regional&panel=closures"
        );
        assertThat(fingerprint).startsWith(PushNotificationUpdateFingerprint.REGIONAL_CONTENT_PREFIX);
        assertThat(PushNotificationUpdateFingerprint.forRegionalCandidate(
            "planned-closure", dayBefore, "/?network=regional&panel=closures"
        )).isEqualTo(fingerprint);
        assertThat(PushNotificationUpdateFingerprint.forRegionalCandidate(
            "planned-closure", moved, "/?network=regional&panel=closures"
        )).isNotEqualTo(fingerprint);
        assertThat(PushNotificationUpdateFingerprint.forRegionalCandidate(
            "planned-closure", reworded, "/?network=regional&panel=closures"
        )).isNotEqualTo(fingerprint);
    }

    private FormattedPushNotification regional(String body, java.time.Instant sourceEventAt) {
        return new FormattedPushNotification(
            "⚠️ Lakeshore West Planned Advisory", body, "Lakeshore West Planned Advisory",
            "Union to Exhibition", null, null, sourceEventAt
        );
    }

    private FormattedPushNotification notification(String title, String body) {
        return new FormattedPushNotification(
            title,
            body,
            "Line 2 Bloor-Danforth Planned Closure",
            "Jane to Ossington",
            null,
            null,
            null
        );
    }
}
