package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class TtcSubwayClosureParserTest {
    private final TtcSubwayClosureParser parser = new TtcSubwayClosureParser();

    @Test
    void parsesCurrentTtcNightlyClosurePageIntoFourOvernightWindows() {
        TtcAlertRecord record = parser.parse(
            "60e186da-b21a-4c75-ab60-78d60b99f3f7",
            URI.create("https://www.ttc.ca/service-advisories/subway-service/example"),
            page(
                "Line 2 (Bloor-Danforth)",
                "St George to Broadview stations – Nightly early closures starting at 11:59 p.m. – Monday, August 31 to Thursday, September 3",
                "August 31, 2026",
                "September 3, 2026",
                "Subway service on Line 2 between St George and Broadview stations will end early at 11:59 p.m. on Monday, August 31 to Thursday, September 3 for planned track work. Shuttle buses will be operating. Regular subway service will resume each morning at approximately 6 a.m."
            )
        ).record();

        assertThat(record.id()).isEqualTo(
            "ttc-ca-closure-60e186da-b21a-4c75-ab60-78d60b99f3f7"
        );
        assertThat(record.alertType()).isEqualTo(TtcSubwayClosureParser.SOURCE_ALERT_TYPE);
        assertThat(record.route()).isEqualTo("2");
        assertThat(record.stopStart()).isEqualTo("St George");
        assertThat(record.stopEnd()).isEqualTo("Broadview");
        assertThat(record.shuttleType()).isEqualTo("Will Operate");
        assertThat(record.childAlerts()).hasSize(4);
        assertThat(record.childAlerts().getFirst().startTime())
            .isEqualTo(OffsetDateTime.parse("2026-08-31T23:59:00-04:00"));
        assertThat(record.childAlerts().getFirst().endTime())
            .isEqualTo(OffsetDateTime.parse("2026-09-01T06:00:00-04:00"));
        assertThat(record.childAlerts().getLast().startTime())
            .isEqualTo(OffsetDateTime.parse("2026-09-03T23:59:00-04:00"));
        assertThat(record.childAlerts().getLast().endTime())
            .isEqualTo(OffsetDateTime.parse("2026-09-04T06:00:00-04:00"));
    }

    @Test
    void ignoresEditorialUpdatePrefixWhenParsingRouteBounds() {
        TtcAlertRecord record = parser.parse(
            "updated-closure",
            URI.create("https://www.ttc.ca/service-advisories/subway-service/updated-closure"),
            page(
                "Line 2 (Bloor-Danforth)",
                "UPDATED - St George to Broadview stations – Nightly early closures starting at 11:59 p.m. – Monday, August 31 to Thursday, September 3",
                "August 31, 2026",
                "September 3, 2026",
                "Subway service on Line 2 between St George and Broadview stations will end early at 11:59 p.m. for planned track work. Regular subway service will resume each morning at approximately 6 a.m."
            )
        ).record();

        assertThat(record.stopStart()).isEqualTo("St George");
        assertThat(record.stopEnd()).isEqualTo("Broadview");
        assertThat(record.title()).contains("UPDATED - St George to Broadview");
    }

    @Test
    void parsesLateOpeningAsAServiceDayMorningClosure() {
        TtcAlertRecord record = parser.parse(
            "late-opening",
            URI.create("https://www.ttc.ca/service-advisories/subway-service/late-opening"),
            page(
                "Line 2 (Bloor-Danforth)",
                "St George to Chester stations – Late opening at 11 a.m. – Sunday, August 23, 2026",
                "August 23, 2026",
                "August 23, 2026",
                "Subway service on Line 2 between St George and Chester stations will start at 11 a.m. due to planned infrastructure maintenance. Shuttle buses will be operating."
            )
        ).record();

        assertThat(record.childAlerts()).singleElement().satisfies(period -> {
            assertThat(period.startTime())
                .isEqualTo(OffsetDateTime.parse("2026-08-23T08:00:00-04:00"));
            assertThat(period.endTime())
                .isEqualTo(OffsetDateTime.parse("2026-08-23T11:00:00-04:00"));
        });
    }

    @Test
    void usesPublishedRapidTransitHoursWhenGtfsRefinementIsNotYetAvailable() {
        TtcAlertRecord lineFive = parser.parse(
            "line-five-late-opening",
            URI.create("https://www.ttc.ca/service-advisories/subway-service/line-five-late-opening"),
            page(
                "Line 5 (Eglinton)",
                "Mount Dennis to Kennedy stations – Late opening at 10 a.m. – Sunday, August 23, 2026",
                "August 23, 2026",
                "August 23, 2026",
                "LRT service on Line 5 between Mount Dennis and Kennedy stations will start at 10 a.m. due to planned maintenance."
            )
        ).record();
        TtcAlertRecord weekdaySubway = parser.parse(
            "weekday-late-opening",
            URI.create("https://www.ttc.ca/service-advisories/subway-service/weekday-late-opening"),
            page(
                "Line 2 (Bloor-Danforth)",
                "St George to Chester stations – Late opening at 9 a.m. – Monday, August 24, 2026",
                "August 24, 2026",
                "August 24, 2026",
                "Subway service on Line 2 between St George and Chester stations will start at 9 a.m. due to planned maintenance."
            )
        ).record();

        assertThat(lineFive.childAlerts().getFirst().startTime())
            .isEqualTo(OffsetDateTime.parse("2026-08-23T08:00:00-04:00"));
        assertThat(weekdaySubway.childAlerts().getFirst().startTime())
            .isEqualTo(OffsetDateTime.parse("2026-08-24T06:00:00-04:00"));
    }

    @Test
    void recognizesServiceStartsByWordingAsAPlannedLateOpening() {
        TtcAlertRecord record = parser.parse(
            "starts-by",
            URI.create("https://www.ttc.ca/service-advisories/subway-service/starts-by"),
            page(
                "Line 2 (Bloor-Danforth)",
                "St George to Chester stations – Service starts by 11 a.m. – Sunday, August 23, 2026",
                "August 23, 2026",
                "August 23, 2026",
                "Subway service between St George and Chester stations will start by 11 a.m. due to planned work."
            )
        ).record();

        assertThat(record.effect()).isEqualTo("NO_SERVICE");
        assertThat(record.cause()).isEqualTo("MAINTENANCE");
        assertThat(record.childAlerts()).singleElement().satisfies(period -> {
            assertThat(period.startTime())
                .isEqualTo(OffsetDateTime.parse("2026-08-23T08:00:00-04:00"));
            assertThat(period.endTime())
                .isEqualTo(OffsetDateTime.parse("2026-08-23T11:00:00-04:00"));
        });
    }

    @Test
    void createsOneLateOpeningWindowForEveryEffectiveDate() {
        TtcAlertRecord record = parser.parse(
            "multi-date-late-opening",
            URI.create("https://www.ttc.ca/service-advisories/subway-service/multi-date"),
            page(
                "Line 2 (Bloor-Danforth)",
                "St George to Chester stations – Late openings at 11 a.m. – Sunday, August 23 to Tuesday, August 25, 2026",
                "August 23, 2026",
                "August 25, 2026",
                "Subway service between St George and Chester stations will start at 11 a.m. each day due to planned work."
            )
        ).record();

        assertThat(record.childAlerts()).hasSize(3);
        assertThat(record.childAlerts())
            .extracting(TtcAlertChildPeriod::startTime)
            .containsExactly(
                OffsetDateTime.parse("2026-08-23T08:00:00-04:00"),
                OffsetDateTime.parse("2026-08-24T06:00:00-04:00"),
                OffsetDateTime.parse("2026-08-25T06:00:00-04:00")
            );
        assertThat(record.childAlerts())
            .extracting(TtcAlertChildPeriod::endTime)
            .containsExactly(
                OffsetDateTime.parse("2026-08-23T11:00:00-04:00"),
                OffsetDateTime.parse("2026-08-24T11:00:00-04:00"),
                OffsetDateTime.parse("2026-08-25T11:00:00-04:00")
            );
    }

    @Test
    void keepsOnlyFirstThreeMeaningfulParagraphsForDisplayButParsesTheFullBody() {
        TtcAlertRecord record = parser.parse(
            "concise-description",
            URI.create("https://www.ttc.ca/service-advisories/subway-service/concise"),
            pageWithParagraphs(
                "Subway service on Line 2 between St George and Broadview stations will end early at 11:59 p.m. for planned track work.",
                "Shuttle buses will be operating. TTC staff will be available to assist customers.",
                "Bay and Sherbourne stations will be closed.",
                "Regular subway service will resume each morning at approximately 6 a.m.",
                "The TTC completes this work as part of its state-of-good-repair program."
            )
        ).record();

        assertThat(record.description())
            .contains("Shuttle buses will be operating")
            .contains("Bay and Sherbourne stations will be closed")
            .doesNotContain("Regular subway service will resume")
            .doesNotContain("state-of-good-repair program");
        assertThat(record.childAlerts()).singleElement().satisfies(period -> {
            assertThat(period.startTime())
                .isEqualTo(OffsetDateTime.parse("2026-08-31T23:59:00-04:00"));
            assertThat(period.endTime())
                .isEqualTo(OffsetDateTime.parse("2026-09-01T06:00:00-04:00"));
        });
    }

    @Test
    void parsesAnUnexpectedCurrentDelayWithoutForcingItIntoPlannedClosures() {
        TtcAlertRecord record = parser.parse(
            "current-delay",
            URI.create("https://www.ttc.ca/service-advisories/subway-service/delay"),
            """
                <html><body>
                  <h1>
                    <span class="field-routename">Line 2 (Bloor-Danforth)</span>
                    <span class="field-satitle">Delays between St George and Broadview stations</span>
                  </h1>
                  <div class="component content"><div class="u-type--body">
                    <p>Trains are experiencing delays between St George and Broadview stations.</p>
                    <p>Allow extra travel time.</p>
                  </div></div>
                </body></html>
                """
        ).record();

        assertThat(record.alertType()).isEqualTo(TtcSubwayClosureParser.SOURCE_ALERT_TYPE);
        assertThat(record.effect()).isEqualTo("SIGNIFICANT_DELAYS");
        assertThat(record.effectDesc()).isEqualTo("Delays");
        assertThat(record.cause()).isNull();
        assertThat(record.stopStart()).isEqualTo("St George");
        assertThat(record.stopEnd()).isEqualTo("Broadview");
        assertThat(record.childAlerts()).isEmpty();
    }

    private String page(
        String route,
        String title,
        String starts,
        String ends,
        String description
    ) {
        return """
            <html><body>
              <h1><span class="field-routename">%s</span><span class="field-satitle">%s</span></h1>
              <div class="sa-effective-date">
                <span class="field-starteffectivedate">%s</span>
                <span class="field-endeffectivedate">%s</span>
              </div>
              <div class="component content"><div class="u-type--body"><p>%s</p></div></div>
            </body></html>
            """.formatted(route, title, starts, ends, description);
    }

    private String pageWithParagraphs(String... paragraphs) {
        String body = java.util.Arrays.stream(paragraphs)
            .map(paragraph -> "<p>" + paragraph + "</p><p>&nbsp;</p>")
            .collect(java.util.stream.Collectors.joining());
        return """
            <html><body>
              <h1>
                <span class="field-routename">Line 2 (Bloor-Danforth)</span>
                <span class="field-satitle">St George to Broadview stations – Nightly early closures starting at 11:59 p.m.</span>
              </h1>
              <div class="sa-effective-date">
                <span class="field-starteffectivedate">August 31, 2026</span>
                <span class="field-endeffectivedate">August 31, 2026</span>
              </div>
              <div class="component content"><div class="u-type--body">%s</div></div>
            </body></html>
            """.formatted(body);
    }
}
