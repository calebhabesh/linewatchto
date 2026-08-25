package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class PlannedClosurePushIdentityTest {
    @Test
    void ignoresSourceIdsAndSegmentOrderingForTheSameClosureOccurrence() {
        OffsetDateTime startsAt = OffsetDateTime.parse("2026-08-31T23:59:00-04:00");

        String website = PlannedClosurePushIdentity.stableId(
            "line-2", List.of("segment-b", "segment-a"), "St George to Broadview",
            startsAt, "ttc-route-website"
        );
        String live = PlannedClosurePushIdentity.stableId(
            "line-2", List.of("segment-a", "segment-b"), "St George to Broadview",
            startsAt, "ttc-route-live"
        );

        assertThat(live).isEqualTo(website).startsWith("planned-closure-");
    }

    @Test
    void keepsIdentityWhenGtfsRefinesAServiceOpeningByMinutes() {
        String fallback = PlannedClosurePushIdentity.stableId(
            "line-2", List.of("st-george-chester"), "St George to Chester",
            OffsetDateTime.parse("2026-08-23T08:00:00-04:00"), "ttc-route-website"
        );
        String scheduleRefined = PlannedClosurePushIdentity.stableId(
            "line-2", List.of("st-george-chester"), "St George to Chester",
            OffsetDateTime.parse("2026-08-23T08:07:00-04:00"), "ttc-route-website"
        );
        String separateOccurrence = PlannedClosurePushIdentity.stableId(
            "line-2", List.of("st-george-chester"), "St George to Chester",
            OffsetDateTime.parse("2026-08-23T11:00:00-04:00"), "ttc-route-website"
        );

        assertThat(scheduleRefined).isEqualTo(fallback);
        assertThat(separateOccurrence).isNotEqualTo(fallback);
    }

    @Test
    void operationalChangesCreateANewUpdateFingerprint() {
        String stableId = "planned-closure-stable";
        String original = PlannedClosurePushIdentity.updateFingerprint(
            stableId, "planned-closure", "St George to Broadview", "Bidirectional",
            true, "Closure - Planned Track Work", "11:59 PM – 6:00 AM", "Aug 31 – Sep 3"
        );
        String sourceHandoff = PlannedClosurePushIdentity.updateFingerprint(
            stableId, "planned-closure", "St George to Broadview", "Bidirectional",
            true, "Track work", "11:59 PM – 6:00 AM", "Aug 31 – Sep 3"
        );
        String hoursChanged = PlannedClosurePushIdentity.updateFingerprint(
            stableId, "planned-closure", "St George to Broadview", "Bidirectional",
            true, "Track work", "10:00 PM – 6:00 AM", "Aug 31 – Sep 3"
        );

        assertThat(sourceHandoff).isEqualTo(original);
        assertThat(hoursChanged).isNotEqualTo(original);
    }
}
