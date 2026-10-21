package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class TtcSubwayClosureParserTest {
    private final TtcSubwayClosureParser parser = new TtcSubwayClosureParser();

    @Test
    void explicitSingleTrackOperationIsLimitedServiceWithPublishedOvernightWindows() {
        TtcAlertRecord record = parser.parse("synthetic-single-track", URI.create("https://www.ttc.ca/service-advisories/subway-service/example"),
            page("Line 1 (Yonge-University)", "Vaughan to Finch West stations – Planned single-track operation, nightly starting at 11 p.m.",
                "September 28, 2026", "October 1, 2026",
                "Subway service between Vaughan and Finch West stations will operate on a single track nightly starting at 11 p.m. due to structural maintenance. Regular service will resume every morning at approximately 6 a.m.")
        ).record();
        assertThat(record.effect()).isEqualTo("LIMITED_SERVICE");
        assertThat(record.childAlerts()).hasSize(4);
        assertThat(record.childAlerts().getFirst().startTime()).isEqualTo(OffsetDateTime.parse("2026-09-28T23:00:00-04:00"));
        assertThat(record.childAlerts().getLast().endTime()).isEqualTo(OffsetDateTime.parse("2026-10-02T06:00:00-04:00"));
        assertThat(record.shuttleType()).isNull();
    }

    @Test
    void readsUnclassedEffectiveEndDateWithoutCollapsingTheAdvisoryToOneDay() {
        String html = page("Line 1", "Vaughan to Finch West stations – Limited nightly service",
            "September 28, 2026", "October 1, 2026",
            "There will be limited nightly subway service starting at 11 p.m. Regular service resumes each morning at 2 a.m.")
            .replace("class=\"field-endeffectivedate\"", "class=\"effective-end\"");
        TtcAlertRecord record = parser.parse("synthetic-date", URI.create("https://www.ttc.ca/service-advisories/subway-service/example"), html).record();
        assertThat(record.childAlerts()).hasSize(4);
        assertThat(record.activePeriod().end()).isEqualTo(OffsetDateTime.parse("2026-10-02T02:00:00-04:00"));
    }

    @Test
    void incompleteNightlyScheduleDoesNotInventMidnightOccurrences() {
        TtcAlertRecord record = parser.parse("synthetic-incomplete", URI.create("https://www.ttc.ca/service-advisories/subway-service/example"),
            page("Line 1", "Vaughan to Finch West stations – Limited nightly service", "September 28, 2026", "October 1, 2026",
                "There will be limited nightly subway service starting at 11 p.m. due to planned track work.")
        ).record();
        assertThat(record.childAlerts()).isEmpty();
        assertThat(record.activePeriod().start()).isEqualTo(OffsetDateTime.parse("2026-09-28T00:00:00-04:00"));
        assertThat(record.activePeriod().end()).isEqualTo(OffsetDateTime.parse("2026-10-02T00:00:00-04:00"));
    }

    @Test
    void publishedTitleEndDateKeepsAllNightsWhenOnlyTheStartDateFieldIsPresent() {
        String html = page("Line 1", "Vaughan to Finch West stations – Limited nightly service from Monday, September 28 to Thursday, October 1, 2026",
            "September 28, 2026", "October 1, 2026",
            "There will be limited nightly subway service starting at 11 p.m. Service resumes each morning at 2 a.m.")
            .replace("<span class=\"field-endeffectivedate\">October 1, 2026</span>", "");
        TtcAlertRecord record = parser.parse("synthetic-title-date", URI.create("https://www.ttc.ca/service-advisories/subway-service/example"), html).record();
        assertThat(record.childAlerts()).hasSize(4);
        assertThat(record.childAlerts().getLast().endTime()).isEqualTo(OffsetDateTime.parse("2026-10-02T02:00:00-04:00"));
    }

    @Test
    void limitedServiceAdvisoryPageDoesNotReintroduceNoServiceOrShuttles() {
        TtcAlertRecord record = parser.parse("synthetic-limited", URI.create("https://www.ttc.ca/service-advisories/subway-service/example"),
            page("Line 1 (Yonge-University)", "Vaughan to Finch West stations – Limited nightly service",
                "September 28, 2026", "October 1, 2026",
                "There will be limited nightly subway service starting at 11 p.m. between Vaughan and Finch West stations due to planned track work.")
        ).record();
        assertThat(record.effect()).isEqualTo("LIMITED_SERVICE");
        assertThat(record.effectDesc()).isEqualTo("Limited service");
        assertThat(record.causeDescription()).isEqualTo("Planned Track Work");
        assertThat(record.shuttleType()).isNull();
        assertThat(record.stopStart()).isEqualTo("Vaughan");
        assertThat(record.stopEnd()).isEqualTo("Finch West");
        assertThat(record.description()).contains("limited nightly subway service");
    }

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

    private static final String TTC_MAINTENANCE_BOILERPLATE =
        " While the TTC does most subway maintenance at the end of service each night, it continues to require"
            + " early nightly and weekend closures to complete state-of-good-repair work.";

    @Test
    void singleDayClosureRunsUntilThePublishedResumptionDespiteMaintenanceBoilerplate() {
        TtcAlertRecord record = parser.parse("single-day", URI.create("https://www.ttc.ca/service-advisories/subway-service/example"),
            page("Line 2 (Bloor-Danforth)", "Kipling to Keele stations – Single-day closure – Sunday, October 25, 2026",
                "October 25, 2026", "October 25, 2026",
                "Subway service on Line 2 between Kipling and Keele stations will be replaced by shuttle buses on Sunday, October 25 for planned infrastructure work."
                    + " Regular subway service will resume on Monday, October 26 at approximately 6 a.m." + TTC_MAINTENANCE_BOILERPLATE)
        ).record();

        assertThat(record.childAlerts()).singleElement().satisfies(period -> {
            assertThat(period.startTime()).isEqualTo(OffsetDateTime.parse("2026-10-25T00:00:00-04:00"));
            assertThat(period.endTime()).isEqualTo(OffsetDateTime.parse("2026-10-26T06:00:00-04:00"));
        });
    }

    @Test
    void maintenanceBoilerplateDoesNotHideAPublishedLateOpening() {
        TtcAlertRecord record = parser.parse("late-opening-boilerplate", URI.create("https://www.ttc.ca/service-advisories/subway-service/example"),
            page("Line 2 (Bloor-Danforth)", "Jane to Ossington stations – Late opening at 12 p.m. on Sunday, November 1, 2026",
                "November 1, 2026", "November 1, 2026",
                "Subway service on Line 2 between Jane and Ossington stations will be replaced by shuttle buses until 12 p.m. on Sunday, November 1 due to planned track work."
                    + " Regular subway service will resume between Jane and Ossington stations at approximately 12 p.m." + TTC_MAINTENANCE_BOILERPLATE)
        ).record();

        assertThat(record.childAlerts()).singleElement().satisfies(period -> {
            assertThat(period.startTime()).isEqualTo(OffsetDateTime.parse("2026-11-01T08:00:00-05:00"));
            assertThat(period.endTime()).isEqualTo(OffsetDateTime.parse("2026-11-01T12:00:00-05:00"));
        });
    }

    @Test
    void singleNightEarlyClosureRunsFromItsStartTimeUntilTheDatedResumption() {
        TtcAlertRecord record = parser.parse("single-night", URI.create("https://www.ttc.ca/service-advisories/subway-service/example"),
            page("Line 2 (Bloor-Danforth)", "St George to Broadview stations – Single-night early closure starting at 10 p.m. – Friday, October 30",
                "October 30, 2026", "October 30, 2026",
                "Subway service on Line 2 between St George and Broadview stations will end early at 10 p.m. on Friday, October 30 for planned maintenance work."
                    + " Regular subway service will resume on Saturday, October 31 at approximately 6 a.m." + TTC_MAINTENANCE_BOILERPLATE)
        ).record();

        assertThat(record.childAlerts()).singleElement().satisfies(period -> {
            assertThat(period.startTime()).isEqualTo(OffsetDateTime.parse("2026-10-30T22:00:00-04:00"));
            assertThat(period.endTime()).isEqualTo(OffsetDateTime.parse("2026-10-31T06:00:00-04:00"));
        });
    }

    @Test
    void fullWeekendClosureCoversBothServiceDaysUntilThePublishedResumption() {
        TtcAlertRecord record = parser.parse("weekend", URI.create("https://www.ttc.ca/service-advisories/subway-service/example"),
            page("Line 2 (Bloor-Danforth)", "Kipling to Jane stations – Full weekend closure – Saturday, October 10 and Sunday, October 11, 2026",
                "October 10, 2026", "October 11, 2026",
                "There will be no subway service between Kipling and Jane stations on Saturday, October 10 and Sunday, October 11 for planned track work."
                    + " Regular subway service will resume on Monday, October 12 at approximately 6 a.m." + TTC_MAINTENANCE_BOILERPLATE)
        ).record();

        assertThat(record.childAlerts()).singleElement().satisfies(period -> {
            assertThat(period.startTime()).isEqualTo(OffsetDateTime.parse("2026-10-10T00:00:00-04:00"));
            assertThat(period.endTime()).isEqualTo(OffsetDateTime.parse("2026-10-12T06:00:00-04:00"));
        });
    }

    @Test
    void weekendClosureKeepsItsPublishedFridayNightStart() {
        TtcAlertRecord record = parser.parse("friday-start", URI.create("https://www.ttc.ca/service-advisories/subway-service/example"),
            page("Line 1 (Yonge-University)", "Finch to Sheppard-Yonge stations – Full weekend closure – starting on Friday, September 25 at 11:59 p.m. to end of service on Sunday, September 27, 2026",
                "September 25, 2026", "September 27, 2026",
                "Subway service on Line 1 between Finch and Sheppard-Yonge stations will be replaced by shuttle buses starting Friday, September 25 at 11:59 p.m."
                    + " until the end of service on Sunday, September 27 for planned signal work. Regular subway service will resume on Monday, September 28.")
        ).record();

        assertThat(record.childAlerts()).singleElement().satisfies(period -> {
            assertThat(period.startTime()).isEqualTo(OffsetDateTime.parse("2026-09-25T23:59:00-04:00"));
            assertThat(period.endTime()).isEqualTo(OffsetDateTime.parse("2026-09-28T00:00:00-04:00"));
        });
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
