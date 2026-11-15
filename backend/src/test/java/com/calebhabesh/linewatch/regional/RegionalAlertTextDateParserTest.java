package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class RegionalAlertTextDateParserTest {
    private static final OffsetDateTime SATURDAY = OffsetDateTime.parse("2026-11-14T00:00:00-05:00");
    private static final OffsetDateTime MONDAY = OffsetDateTime.parse("2026-11-16T00:00:00-05:00");

    @Test
    void thisWeekendIsTheSaturdayAndSundayOfTheWeekItWasPublished() {
        for (String published : new String[] {
            "2026-11-09T09:00:00-05:00", "2026-11-13T03:01:59-05:00", "2026-11-14T10:00:00-05:00",
            "2026-11-15T23:00:00-05:00"
        }) {
            assertThat(RegionalAlertTextDateParser.thisWeekend(
                "This weekend, GO buses replace UP Express trains due to planned construction.",
                OffsetDateTime.parse(published)))
                .as(published)
                .singleElement().satisfies(range -> {
                    assertThat(range.start()).isEqualTo(SATURDAY);
                    assertThat(range.endExclusive()).isEqualTo(MONDAY);
                });
        }
        assertThat(RegionalAlertTextDateParser.thisWeekend("Service changes this coming weekend.",
            OffsetDateTime.parse("2026-11-12T12:00:00-05:00"))).hasSize(1);
    }

    @Test
    void thisWeekendNeedsThePhraseAndAPublicationTime() {
        assertThat(RegionalAlertTextDateParser.thisWeekend("Weekend schedule in effect.",
            OffsetDateTime.parse("2026-11-12T12:00:00-05:00"))).isEmpty();
        assertThat(RegionalAlertTextDateParser.thisWeekend("This weekend, GO buses replace trains.", null)).isEmpty();
        // Stated dates are read by ranges(); "this weekend" adds nothing there.
        assertThat(RegionalAlertTextDateParser.ranges("This weekend, Nov. 21-22, GO buses replace trains.",
            OffsetDateTime.parse("2026-11-12T12:00:00-05:00"))).singleElement()
            .satisfies(range -> assertThat(range.start()).isEqualTo(OffsetDateTime.parse("2026-11-21T00:00:00-05:00")));
    }
}
