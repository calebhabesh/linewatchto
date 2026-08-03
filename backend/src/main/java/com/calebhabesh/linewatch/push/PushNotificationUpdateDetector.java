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
        boolean structuredIdentityChanged = structuredIdentityChanged(
            existingEventType,
            existingEventLocation,
            existingDisplayDirection,
            candidate
        );
        if (regional(candidate.lineId())) {
            if (structuredIdentityChanged) {
                return true;
            }
            String candidateFingerprint = candidate.updateFingerprint();
            if (candidateFingerprint == null
                || !candidateFingerprint.startsWith(PushNotificationUpdateFingerprint.REGIONAL_CONTENT_PREFIX)) {
                return false;
            }
            if (existingFingerprint == null
                || !existingFingerprint.startsWith(PushNotificationUpdateFingerprint.REGIONAL_CONTENT_PREFIX)) {
                // Establish the content-based baseline without re-notifying active regional
                // incidents created under the former feed-timestamp fingerprint.
                return false;
            }
            return !Objects.equals(existingFingerprint, candidateFingerprint);
        }
        if ("line-current".equals(normalize(candidate.category()))
            && "reduced-speed-zone".equals(normalize(candidate.eventType()))) {
            return structuredIdentityChanged;
        }

        if (existingSourceUpdatedAt != null) {
            return (
                candidate.sourceUpdatedAt() != null
                    && !Objects.equals(existingSourceUpdatedAt, candidate.sourceUpdatedAt())
            )
                || structuredIdentityChanged;
        }

        if (candidate.sourceUpdatedAt() == null) {
            return structuredIdentityChanged;
        }

        if (existingFingerprint == null || existingFingerprint.isBlank()) {
            return structuredIdentityChanged;
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

    private static boolean regional(String lineId) {
        return normalize(lineId).startsWith("regional-");
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
