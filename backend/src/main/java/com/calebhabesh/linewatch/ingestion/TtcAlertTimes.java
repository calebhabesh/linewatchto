package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;

final class TtcAlertTimes {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private TtcAlertTimes() {}

    static OffsetDateTime nullIfSentinel(OffsetDateTime value) {
        return value != null && value.getYear() <= 1 ? null : value;
    }

    static OffsetDateTime sourceWallTimeToInstant(OffsetDateTime value) {
        OffsetDateTime normalized = nullIfSentinel(value);
        if (normalized == null) {
            return null;
        }
        return normalized.toLocalDateTime()
            .atZone(TORONTO_ZONE)
            .toOffsetDateTime()
            .withOffsetSameInstant(ZoneOffset.UTC);
    }
}
