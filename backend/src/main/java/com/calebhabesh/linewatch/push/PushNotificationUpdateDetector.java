package com.calebhabesh.linewatch.push;

import java.time.Instant;
import java.util.Locale;
import java.util.Objects;

final class PushNotificationUpdateDetector {
    private PushNotificationUpdateDetector() {}

    static boolean hasMeaningfulUpdate(
        String existingFingerprint,
        Instant existingSourceUpdatedAt,
        String existingEventType,
        String existingEventLocation,
        String existingDisplayDirection,
        PushNotificationCandidate candidate
    ) {
        if (existingSourceUpdatedAt != null) {
            return (
                candidate.sourceUpdatedAt() != null
                    && !Objects.equals(existingSourceUpdatedAt, candidate.sourceUpdatedAt())
            )
                || structuredIdentityChanged(
                    existingEventType,
                    existingEventLocation,
                    existingDisplayDirection,
                    candidate
                );
        }

        if (candidate.sourceUpdatedAt() == null) {
            return structuredIdentityChanged(
                existingEventType,
                existingEventLocation,
                existingDisplayDirection,
                candidate
            );
        }

        if (existingFingerprint == null || existingFingerprint.isBlank()) {
            return structuredIdentityChanged(
                existingEventType,
                existingEventLocation,
                existingDisplayDirection,
                candidate
            );
        }
        if (existingFingerprint.equals(candidate.updateFingerprint())) {
            return false;
        }
        if (existingFingerprint.equals(PushNotificationUpdateFingerprint.legacyForCandidate(
            candidate.sourceUpdatedAt(),
            candidate.eventType(),
            candidate.notification(),
            candidate.url()
        ))) {
            return false;
        }

        return true;
    }

    private static boolean structuredIdentityChanged(
        String existingEventType,
        String existingEventLocation,
        String existingDisplayDirection,
        PushNotificationCandidate candidate
    ) {
        return !normalize(existingEventType).equals(normalize(candidate.eventType()))
            || !normalize(existingEventLocation).equals(normalize(candidate.eventLocation()))
            || !normalize(existingDisplayDirection).equals(normalize(candidate.displayDirection()));
    }

    private static String normalize(String value) {
        return value == null
            ? ""
            : value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }
}
