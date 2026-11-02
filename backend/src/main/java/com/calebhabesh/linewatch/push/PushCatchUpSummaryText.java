package com.calebhabesh.linewatch.push;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Copy and tap target for the one notification that introduces a catch-up
 * batch: what is still in effect, and what the device missed that is not
 * shown (alerts that cleared meanwhile, planned-advisory announcements).
 */
final class PushCatchUpSummaryText {
    static final String ALERT_HISTORY_URL = "/?panel=alert-history";
    static final String PLANNED_ADVISORIES_URL = "/?panel=closures";
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH).withZone(TORONTO_ZONE);
    private static final DateTimeFormatter DATE_CLOCK =
        DateTimeFormatter.ofPattern("MMM d, h:mm a", Locale.ENGLISH).withZone(TORONTO_ZONE);

    private PushCatchUpSummaryText() {}

    /**
     * @param inEffect alerts sent in this batch
     * @param cleared alerts that started and cleared while the device was unreachable
     * @param planned planned-advisory announcements the device missed (not sent)
     * @param lostAt when the push service last reported this device's working
     *     endpoint gone, or null when the endpoint was replaced without a report
     * @param reconnectedAt when the replacement endpoint was enabled
     */
    static WebPushPayload.CatchUpSummary build(
        int inEffect,
        int cleared,
        int planned,
        String batch,
        Instant lostAt,
        Instant reconnectedAt
    ) {
        String title = "Reconnected · " + inEffect + (inEffect == 1 ? " Alert" : " Alerts") + " in Effect";
        StringBuilder body = new StringBuilder();
        if (lostAt == null || reconnectedAt == null || !lostAt.isBefore(reconnectedAt)) {
            body.append("This device's push connection was replaced")
                .append(reconnectedAt == null ? "" : " at " + CLOCK.format(reconnectedAt))
                .append(inEffect == 1 ? ". This alert started before then and is still in effect." : ". These "
                    + inEffect + " alerts started before then and are still in effect.");
        } else {
            body.append("Alerts could not reach this device from ").append(startLabel(lostAt, reconnectedAt))
                .append(" to ").append(CLOCK.format(reconnectedAt))
                .append(inEffect == 1 ? ". This one is still in effect." : ". These " + inEffect + " are still in effect.");
        }
        String clearedText = cleared == 1 ? "1 more started and cleared meanwhile" : cleared + " more started and cleared meanwhile";
        String plannedText = planned == 1 ? "1 planned advisory was announced" : planned + " planned advisories were announced";
        String url = "/";
        if (cleared > 0 && planned > 0) {
            body.append(' ').append(clearedText).append(", and ").append(plannedText).append(". Tap for Alert History.");
            url = ALERT_HISTORY_URL;
        } else if (cleared > 0) {
            body.append(' ').append(clearedText).append(". Tap for Alert History.");
            url = ALERT_HISTORY_URL;
        } else if (planned > 0) {
            body.append(' ').append(plannedText).append(". Tap for Planned Advisories.");
            url = PLANNED_ADVISORIES_URL;
        }
        return new WebPushPayload.CatchUpSummary(inEffect, batch, title, body.toString(), url);
    }

    private static String startLabel(Instant lostAt, Instant reconnectedAt) {
        boolean sameDay = lostAt.atZone(TORONTO_ZONE).toLocalDate().equals(reconnectedAt.atZone(TORONTO_ZONE).toLocalDate());
        return sameDay ? CLOCK.format(lostAt) : DATE_CLOCK.format(lostAt);
    }
}
