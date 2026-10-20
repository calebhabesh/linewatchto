package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class PushNotificationTargetUrlsTest {
    @Test
    void clearedTargetsKeepTheActiveImpactSoTapsCanResolveIt() {
        assertThat(PushNotificationTargetUrls.cleared(
            "/?panel=alerts&impactKind=suspension&impactId=alert-1&targetLine=line-1"
        )).isEqualTo("/?panel=alerts&impactKind=suspension&impactId=alert-1&targetLine=line-1&state=cleared");
        assertThat(PushNotificationTargetUrls.cleared("/?panel=delays&state=cleared"))
            .isEqualTo("/?panel=delays&state=cleared");
    }

    @Test
    void clearedTargetsWithoutAnActiveDestinationStayOnTheMap() {
        assertThat(PushNotificationTargetUrls.cleared(null)).isEqualTo("/");
        assertThat(PushNotificationTargetUrls.cleared("/")).isEqualTo("/");
    }

    @Test
    void encodesTargetValues() {
        assertThat(PushNotificationTargetUrls.withParam("/?panel=trip-changes", "tripChangeId", "trip a&b"))
            .isEqualTo("/?panel=trip-changes&tripChangeId=trip+a%26b");
        assertThat(PushNotificationTargetUrls.withTargetLine("/?panel=alerts", null)).isEqualTo("/?panel=alerts");
    }

    @Test
    void regionalUpdateFingerprintsIgnoreTargetOnlyParams() {
        FormattedPushNotification notification = new FormattedPushNotification(
            "⚠️ Stouffville Train Cancelled", "Trip cancelled.", "Stouffville", "Stouffville", null, null,
            Instant.parse("2026-07-29T12:00:00Z")
        );

        assertThat(PushNotificationUpdateFingerprint.forRegionalCandidate(
            "trip-cancellation", notification, "/?network=regional&panel=trip-changes"
        )).isEqualTo(PushNotificationUpdateFingerprint.forRegionalCandidate(
            "trip-cancellation",
            notification,
            "/?network=regional&panel=trip-changes&tripChangeId=trip-1&targetLine=regional-st"
        ));
    }
}
