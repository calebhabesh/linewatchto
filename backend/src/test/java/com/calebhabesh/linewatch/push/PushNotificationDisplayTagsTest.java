package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class PushNotificationDisplayTagsTest {
    private static final String BASE_KEY = "saved-commute-impact|commute_1|outbound|delay|delay-line-1";

    @Test
    void buildsStateSpecificDisplayTagsFromTheStableLifecycleKey() {
        assertThat(PushNotificationDisplayTags.active(BASE_KEY))
            .isEqualTo(BASE_KEY + "|active");
        assertThat(PushNotificationDisplayTags.cleared(BASE_KEY))
            .isEqualTo(BASE_KEY + "|cleared");
        assertThat(PushNotificationDisplayTags.forState(BASE_KEY, "ACTIVE"))
            .isEqualTo(BASE_KEY + "|active");
        assertThat(PushNotificationDisplayTags.forState(BASE_KEY, "CLEARED"))
            .isEqualTo(BASE_KEY + "|cleared");
    }

    @Test
    void expandsClearedLifecycleKeyToBothVisibleRowsPlusLegacyTag() {
        assertThat(PushNotificationDisplayTags.retainedTagsForClearedLifecycleKey(BASE_KEY))
            .containsExactly(BASE_KEY + "|active", BASE_KEY + "|cleared", BASE_KEY);
    }

    @Test
    void keepsDisplayTagListsDistinctAndBlankSafe() {
        assertThat(PushNotificationDisplayTags.active(null)).isEmpty();
        assertThat(PushNotificationDisplayTags.cleared(" ")).isEmpty();
        assertThat(PushNotificationDisplayTags.distinctNonBlank(List.of(
            BASE_KEY + "|active",
            "",
            BASE_KEY + "|active",
            BASE_KEY + "|cleared",
            " "
        ))).containsExactly(BASE_KEY + "|active", BASE_KEY + "|cleared");
    }
}
