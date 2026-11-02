package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class PushCatchUpSummaryTextTest {
    @Test
    void namesTheOutageInTorontoTimeWithTheDateWhenItCrossesMidnight() {
        WebPushPayload.CatchUpSummary summary = PushCatchUpSummaryText.build(
            6, 0, 0, "batch", Instant.parse("2026-11-02T02:51:06Z"), Instant.parse("2026-11-02T06:18:16Z")
        );
        assertThat(summary.title()).isEqualTo("Reconnected · 6 Alerts in Effect");
        assertThat(summary.body())
            .isEqualTo("Alerts could not reach this device from Nov 1, 9:51 PM to 1:18 AM. These 6 are still in effect.");
        assertThat(summary.url()).isEqualTo("/");
    }

    @Test
    void namesWhatTheBatchLeftOutAndOpensAlertHistory() {
        // The 2026-11-02 reconnect: 2 alerts in effect, 1 cleared meanwhile, 5 advisories announced.
        WebPushPayload.CatchUpSummary summary = PushCatchUpSummaryText.build(
            2, 1, 5, "batch", Instant.parse("2026-11-02T02:51:06Z"), Instant.parse("2026-11-02T06:18:16Z")
        );
        assertThat(summary.body()).isEqualTo(
            "Alerts could not reach this device from Nov 1, 9:51 PM to 1:18 AM. These 2 are still in effect."
                + " 1 more started and cleared meanwhile, and 5 planned advisories were announced. Tap for Alert History."
        );
        assertThat(summary.url()).isEqualTo("/?panel=alert-history");

        WebPushPayload.CatchUpSummary plural = PushCatchUpSummaryText.build(
            2, 3, 0, "batch", Instant.parse("2026-11-02T02:51:06Z"), Instant.parse("2026-11-02T06:18:16Z")
        );
        assertThat(plural.body()).endsWith(" 3 more started and cleared meanwhile. Tap for Alert History.");
    }

    @Test
    void withoutAPushServiceReportSaysOnlyThatTheConnectionWasReplaced() {
        WebPushPayload.CatchUpSummary summary = PushCatchUpSummaryText.build(
            3, 0, 0, "batch", null, Instant.parse("2026-11-02T06:18:16Z")
        );
        assertThat(summary.body())
            .isEqualTo("This device's push connection was replaced at 1:18 AM. These 3 alerts started before then and are still in effect.");
    }
}
