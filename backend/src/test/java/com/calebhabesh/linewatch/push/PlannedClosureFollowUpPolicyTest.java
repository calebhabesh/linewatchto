package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class PlannedClosureFollowUpPolicyTest {
    private final Instant now = Instant.parse("2026-06-05T15:00:00Z"); // 11:00 AM Toronto

    @Test
    void mapsLegacyBooleanCombinationsWithoutLosingExistingChoices() {
        assertThat(PlannedClosureFollowUpPolicy.fromLegacy(true, true))
            .isEqualTo(PlannedClosureFollowUpPolicy.SMART);
        assertThat(PlannedClosureFollowUpPolicy.fromLegacy(true, false))
            .isEqualTo(PlannedClosureFollowUpPolicy.WITHIN_24_HOURS);
        assertThat(PlannedClosureFollowUpPolicy.fromLegacy(false, true))
            .isEqualTo(PlannedClosureFollowUpPolicy.DAY_OF);
        assertThat(PlannedClosureFollowUpPolicy.fromLegacy(false, false))
            .isEqualTo(PlannedClosureFollowUpPolicy.ANNOUNCEMENTS_ONLY);
    }

    @Test
    void smartUsesDayOfForLaterClosuresAndAdvanceReminderForEarlyMorningClosures() {
        assertThat(PlannedClosureFollowUpPolicy.SMART.reminderBucket(
            now,
            Instant.parse("2026-06-06T03:00:00Z") // 11:00 PM Toronto
        )).isEqualTo("closure-morning");
        assertThat(PlannedClosureFollowUpPolicy.SMART.reminderBucket(
            now,
            Instant.parse("2026-06-06T09:00:00Z") // 5:00 AM Toronto next day
        )).isEqualTo("closure-24h");
    }

    @Test
    void explicitAndAnnouncementOnlyPoliciesSelectOneUnderstandableBucket() {
        Instant start = Instant.parse("2026-06-06T03:00:00Z");

        assertThat(PlannedClosureFollowUpPolicy.WITHIN_24_HOURS.reminderBucket(now, start))
            .isEqualTo("closure-24h");
        assertThat(PlannedClosureFollowUpPolicy.DAY_OF.reminderBucket(now, start))
            .isEqualTo("closure-morning");
        assertThat(PlannedClosureFollowUpPolicy.ANNOUNCEMENTS_ONLY.reminderBucket(now, start))
            .isEqualTo("on-change");
    }
}
