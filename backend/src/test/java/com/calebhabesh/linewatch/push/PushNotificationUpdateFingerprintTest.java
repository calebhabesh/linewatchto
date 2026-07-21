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
