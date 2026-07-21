package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class PushNotificationUpdateDetectorTest {
    @Test
    void ignoresOpaqueFingerprintChangesWhenPersistedSourceRevisionIsUnchanged() {
        Instant sourceUpdatedAt = Instant.parse("2026-07-21T19:30:00Z");
        PushNotificationCandidate candidate = candidate("future-fingerprint", sourceUpdatedAt);

        assertThat(PushNotificationUpdateDetector.hasMeaningfulUpdate(
            "previous-fingerprint",
            sourceUpdatedAt,
            candidate.eventType(),
            candidate.eventLocation(),
            candidate.displayDirection(),
            candidate
        )).isFalse();
    }

    @Test
    void ignoresOpaqueFingerprintChangesWhenSourceRevisionIsUnavailable() {
        PushNotificationCandidate candidate = candidate("future-fingerprint", null);

        assertThat(PushNotificationUpdateDetector.hasMeaningfulUpdate(
            "previous-fingerprint",
            null,
            candidate.eventType(),
            candidate.eventLocation(),
            candidate.displayDirection(),
            candidate
        )).isFalse();
    }

    @Test
    void detectsNewerSourceRevision() {
        PushNotificationCandidate candidate = candidate(
            "current-fingerprint",
            Instant.parse("2026-07-21T19:35:00Z")
        );

        assertThat(PushNotificationUpdateDetector.hasMeaningfulUpdate(
            "previous-fingerprint",
            Instant.parse("2026-07-21T19:30:00Z"),
            candidate.eventType(),
            candidate.eventLocation(),
            candidate.displayDirection(),
            candidate
        )).isTrue();
    }

    @Test
    void detectsStructuredIncidentChangeWithoutSourceRevision() {
        PushNotificationCandidate candidate = candidate("current-fingerprint", null);

        assertThat(PushNotificationUpdateDetector.hasMeaningfulUpdate(
            "previous-fingerprint",
            null,
            "delay",
            candidate.eventLocation(),
            candidate.displayDirection(),
            candidate
        )).isTrue();
    }

    private PushNotificationCandidate candidate(String fingerprint, Instant sourceUpdatedAt) {
        FormattedPushNotification notification = new PushNotificationFormatter().formatActive(
            new PushNotificationFacts(
                "line-2",
                "2",
                "reduced-speed-zone",
                "on-change",
                "High Park to Runnymede",
                "Westbound",
                false,
                null,
                null,
                Instant.parse("2026-07-13T14:54:00Z")
            )
        );
        return new PushNotificationCandidate(
            "user_1",
            null,
            null,
            "line-2",
            "2",
            "line-current",
            "reduced-speed-zone",
            "on-change",
            "line-current|line-2|rsz-1",
            "line-current|line-2|reduced-speed-zone|rsz-1",
            "dedupe-key",
            notification,
            "/?panel=reduced-speed-zones",
            fingerprint,
            true,
            sourceUpdatedAt
        );
    }
}
