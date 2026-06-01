package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;

final class TtcAlertTimes {
    private TtcAlertTimes() {}

    static OffsetDateTime nullIfSentinel(OffsetDateTime value) {
        return value != null && value.getYear() <= 1 ? null : value;
    }
}
