package com.calebhabesh.linewatch.regional;

import java.time.Instant;

/** Projects a retained service window at read time; ingestion time is not service time. */
final class RegionalAlertProjection {
    private RegionalAlertProjection() {}

    static RegionalNormalizedAlert at(RegionalNormalizedAlert alert, Instant now) {
        if (alert.activePeriodEnd() != null && !now.isBefore(alert.activePeriodEnd().toInstant())) return null;
        if ("advisory".equals(alert.impactKind())) return alert;
        if (alert.activePeriodStart() == null) return new RegionalNormalizedAlert(
            alert.id(), alert.sourceSystem(), alert.sourceId(), alert.lineId(), "advisory",
            alert.title(), alert.description(), alert.cause(), null, alert.activePeriodEnd(),
            alert.sourceUpdatedAt(), alert.stationIds(), java.util.List.of(), alert.activePeriodBasis(),
            alert.rawPayload());
        if (now.isBefore(alert.activePeriodStart().toInstant())) {
            if (!"planned-closure".equals(alert.impactKind())) return null;
            return alert;
        }
        if (!"planned-closure".equals(alert.impactKind())) return alert;
        return new RegionalNormalizedAlert(
            alert.id(), alert.sourceSystem(), alert.sourceId(), alert.lineId(), "suspension",
            alert.title(), alert.description(), alert.cause(), alert.activePeriodStart(),
            alert.activePeriodEnd(), alert.sourceUpdatedAt(), alert.stationIds(),
            alert.affectedSegmentIds(), alert.activePeriodBasis(), alert.rawPayload());
    }
}
