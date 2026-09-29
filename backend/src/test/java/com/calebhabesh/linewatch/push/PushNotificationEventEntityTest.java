package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class PushNotificationEventEntityTest {
    private final PushNotificationFormatter formatter = new PushNotificationFormatter();
    private final Instant start = Instant.parse("2026-09-29T03:00:00Z");
    private final Instant end = Instant.parse("2026-09-29T06:00:00Z");

    @Test
    void plannedCommuteAndLineCompletionUseWindowEndedCopyWithCompatibleIdentities() {
        for (boolean commute : new boolean[] {false, true}) {
            PushNotificationCandidate candidate = candidate(commute);
            PushNotificationEventEntity active = PushNotificationEventEntity.create("active", candidate, start);
            PushNotificationEventEntity ended = PushNotificationEventEntity.cleared("ended", active, end, formatter);
            assertWindowEnded(ended);
            assertThat(ended.getNotificationKey()).isEqualTo(active.getNotificationKey());
            assertThat(ended.getDedupeKey()).isEqualTo(active.getDedupeKey() + "|cleared");
            assertThat(ended.getCommuteId()).isEqualTo(active.getCommuteId());
        }
    }

    @Test
    void plannedLineObservationCompletionAlsoAvoidsClaimingRestoration() {
        PushLineEventObservationEntity observation = PushLineEventObservationEntity.create("observation", candidate(false), start);
        PushNotificationEventEntity ended = PushNotificationEventEntity.clearedFromObservation("ended", observation, end, formatter);
        assertWindowEnded(ended);
        assertThat(ended.getNotificationKey()).isEqualTo(observation.getNotificationKey());
    }

    private void assertWindowEnded(PushNotificationEventEntity ended) {
        assertThat(ended.getTitle()).contains("Window Ended").doesNotContain("Cleared", "Restored");
        assertThat(ended.getBody()).contains("Scheduled limited-service window ended").doesNotContain("restored", "resumed", "cleared");
        assertThat(ended.getNotificationState()).isEqualTo("CLEARED");
        assertThat(ended.getEventType()).isEqualTo("service-restored");
        assertThat(ended.getSourceEventAt()).isEqualTo(end);
    }

    private PushNotificationCandidate candidate(boolean commute) {
        FormattedPushNotification notification = new FormattedPushNotification("Active", "Source fixture",
            "Line 1 Yonge-University Planned limited service", "Vaughan to Finch West", "Both ways", commute ? "Work commute" : null, start);
        return new PushNotificationCandidate("account", commute ? "commute" : null, commute ? "outbound" : null,
            "line-1", "1", commute ? "saved-commute-current" : "line-current", "planned-closure", "on-change",
            "source", "notification", "dedupe", notification, "/?panel=delays&impactKind=delay&impactId=fixture");
    }
}
