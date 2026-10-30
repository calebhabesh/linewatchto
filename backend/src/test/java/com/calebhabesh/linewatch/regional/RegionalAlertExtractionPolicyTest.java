package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class RegionalAlertExtractionPolicyTest {
    private static final ObjectMapper JSON = JsonMapper.builder().findAndAddModules().build();
    private static final OffsetDateTime START = OffsetDateTime.parse("2026-10-31T04:00:00Z");
    private static final OffsetDateTime END = OffsetDateTime.parse("2026-11-02T05:00:00Z");
    private static final RegionalAlertExtractionInput UP_INPUT = new RegionalAlertExtractionInput(
        "up-1", List.of("regional-up"), "Weekend service adjustments", "GO buses replace UP Express trains.", List.of());

    @Test
    void validatesARepliesStationsAgainstTheNoticesLines() {
        var valid = RegionalAlertExtraction.validate(reply("""
            {"effect":"no-service","scope":"segment-span","spanFrom":"union","spanTo":"pearson-airport",
             "listedStations":["bloor"],"replacement":"go-bus","skippedStations":["bloor","union","weston"],
             "statedWindow":"This weekend","confidence":"high"}
            """), UP_INPUT);
        assertThat(valid.valid()).isTrue();
        assertThat(valid.extraction().span()).containsExactly("union", "pearson-airport");
        // A span ignores listed stations, and an endpoint is never also a skipped stop.
        assertThat(valid.extraction().listedStations()).isEmpty();
        assertThat(valid.extraction().skippedStations()).containsExactly("bloor", "weston");

        assertThat(RegionalAlertExtraction.validate(reply("""
            {"effect":"no-service","scope":"segment-span","spanFrom":"union","spanTo":"kipling",
             "replacement":"none","skippedStations":[],"confidence":"high"}
            """), UP_INPUT).rejection()).isEqualTo("unknown-station");
        assertThat(RegionalAlertExtraction.validate(reply("""
            {"effect":"no-service","scope":"segment-span","spanFrom":"union","spanTo":null,
             "replacement":"none","skippedStations":[],"confidence":"high"}
            """), UP_INPUT).rejection()).isEqualTo("span-missing");
        assertThat(RegionalAlertExtraction.validate(reply("""
            {"effect":"closed","scope":"corridor","replacement":"none","confidence":"high"}
            """), UP_INPUT).rejection()).isEqualTo("effect");
        assertThat(RegionalAlertExtraction.validate(reply("""
            {"effect":"delay","scope":"listed-stations","listedStations":[],"replacement":"none","confidence":"low"}
            """), UP_INPUT).rejection()).isEqualTo("listed-missing");
        assertThat(RegionalAlertExtraction.validate(reply("[]"), UP_INPUT).rejection()).isEqualTo("not-an-object");
    }

    @Test
    void validatesEverySectionOfAMultiSectionReplyAndOrdersThemAlongTheLine() {
        var valid = RegionalAlertExtraction.validate(reply("""
            {"effect":"no-service","scope":"segment-span",
             "spans":[{"from":"weston","to":"pearson-airport"},{"from":"bloor","to":"union"}],
             "listedStations":[],"replacement":"none","skippedStations":["union","mount-dennis"],
             "statedWindow":null,"confidence":"high"}
            """), UP_INPUT);
        assertThat(valid.valid()).isTrue();
        assertThat(valid.extraction().span()).containsExactly("union", "bloor", "weston", "pearson-airport");
        assertThat(valid.extraction().skippedStations()).containsExactly("mount-dennis");

        assertThat(RegionalAlertExtraction.validate(reply("""
            {"effect":"no-service","scope":"segment-span","spans":[{"from":"union","to":"bloor"},
             {"from":"weston","to":"kipling"}],"replacement":"none","confidence":"high"}
            """), UP_INPUT).rejection()).isEqualTo("unknown-station");
        assertThat(RegionalAlertExtraction.validate(reply("""
            {"effect":"no-service","scope":"segment-span","spans":[{"from":"weston","to":"weston"}],
             "replacement":"none","confidence":"high"}
            """), UP_INPUT).rejection()).isEqualTo("span-single-station");
        assertThat(RegionalAlertExtraction.validate(reply("""
            {"effect":"no-service","scope":"segment-span","spans":[],"replacement":"none","confidence":"high"}
            """), UP_INPUT).rejection()).isEqualTo("span-missing");
        assertThat(RegionalAlertExtraction.validate(reply("""
            {"effect":"no-service","scope":"segment-span","spans":[{"from":"union"}],
             "replacement":"none","confidence":"high"}
            """), UP_INPUT).rejection()).isEqualTo("span-missing");
        // Sections only matter for a segment span; an incomplete one does not reject a corridor reading.
        var corridor = RegionalAlertExtraction.validate(reply("""
            {"effect":"no-service","scope":"corridor","spans":[{"from":"union"}],
             "replacement":"go-bus","confidence":"high"}
            """), UP_INPUT);
        assertThat(corridor.valid()).isTrue();
        assertThat(corridor.extraction().span()).isEmpty();
    }

    @Test
    void appliesSeveralSectionsAndKeepsTheClassifiersWhenTheReadingCannotSayWhere() {
        List<String> sections = List.of("union", "bloor", "weston", "pearson-airport");
        RegionalAlertClassification refined = RegionalAlertExtractionPolicy.refine(
            classification("no-service", "unknown", List.of(), List.of(), null),
            new RegionalAlertExtraction("no-service", "segment-span", sections, List.of(), "none", List.of(),
                null, "high"), "m");
        assertThat(refined.scope()).isEqualTo("segment-span");
        assertThat(refined.spanStationIds()).containsExactlyElementsOf(sections);
        assertThat(refined.impacts()).singleElement()
            .satisfies(impact -> assertThat(impact.stationIds()).containsExactlyElementsOf(sections));

        RegionalAlertClassification deterministic = classification("no-service", "segment-span", sections, List.of(), null);
        RegionalAlertClassification kept = RegionalAlertExtractionPolicy.refine(deterministic,
            new RegionalAlertExtraction("no-service", "unknown", List.of(), List.of(), "go-bus", List.of(),
                null, "high"), "m");
        assertThat(kept.scope()).isEqualTo("segment-span");
        assertThat(kept.spanStationIds()).containsExactlyElementsOf(sections);
        assertThat(kept.replacementService()).isEqualTo("go-bus");

        // Section order and each section's direction do not make a difference.
        assertThat(RegionalAlertExtractionPolicy.differences(RegionalAlertExtractionPolicy.Reading.of(deterministic),
            new RegionalAlertExtraction("no-service", "segment-span",
                List.of("pearson-airport", "weston", "bloor", "union"), List.of(), "none", List.of(), null, "high")))
            .isEmpty();
    }

    @Test
    void keepsSectionsDerivedFromTheRunningSectionWhileTheReadingSuppliesTheRest() {
        List<String> sections = List.of("union", "bloor", "weston", "pearson-airport");
        RegionalAlertClassification base = classification("no-service", "segment-span", sections, List.of(), null);
        Map<String, List<String>> sources = new java.util.HashMap<>(base.fieldSources());
        sources.put(MetrolinxAlertNormalizer.RUNNING_SECTION_FIELD, List.of("go-service-alerts:M1"));
        RegionalAlertClassification fromRunning = new RegionalAlertClassification(base.canonicalEventId(), base.sources(),
            base.lineIds(), base.tripNumbers(), base.timing(), base.serviceEffect(), base.operatingChange(), base.scope(),
            base.cause(), base.replacementService(), base.maximumDelayMinutes(), base.title(), base.description(),
            base.activePeriodStart(), base.activePeriodEnd(), base.activePeriodBasis(), base.sourceActivePeriodStart(),
            base.sourceActivePeriodEnd(), base.publishedAt(), base.stationIds(), base.spanStationIds(), base.stationRoles(),
            Map.copyOf(sources), base.primaryRawPayload(), base.impacts());

        RegionalAlertClassification refined = RegionalAlertExtractionPolicy.refine(fromRunning,
            new RegionalAlertExtraction("no-service", "segment-span", List.of("union", "bloor", "weston", "mount-dennis"),
                List.of(), "go-bus", List.of(), null, "high"), "m");

        assertThat(refined.spanStationIds()).containsExactlyElementsOf(sections);
        assertThat(refined.replacementService()).isEqualTo("go-bus");
        assertThat(refined.fieldSources()).containsKey("modelReading");
    }

    @Test
    void correctsAWrongDeterministicSpanAndMarksSkippedStops() {
        RegionalAlertClassification deterministic = classification("no-service", "segment-span",
            List.of("union", "weston"), List.of(), null);

        RegionalAlertClassification refined = RegionalAlertExtractionPolicy.refine(deterministic,
            extraction("no-service", "segment-span", "union", "pearson-airport", "go-bus", "high",
                List.of("bloor", "mount-dennis", "weston")), "gemini@v1");

        assertThat(refined.scope()).isEqualTo("corridor");
        assertThat(refined.spanStationIds()).containsExactly("union", "pearson-airport");
        assertThat(refined.replacementService()).isEqualTo("go-bus");
        assertThat(refined.stationRoles()).containsEntry("weston", "replacement-excluded")
            .containsEntry("bloor", "replacement-excluded").containsEntry("mount-dennis", "replacement-excluded");
        assertThat(refined.fieldSources()).containsEntry("modelReading", List.of("gemini@v1"));
        assertThat(refined.impacts()).singleElement().satisfies(impact -> {
            assertThat(impact.scope()).isEqualTo("corridor");
            assertThat(impact.start()).isEqualTo(START);
            assertThat(impact.endExclusive()).isEqualTo(END);
        });
        // Dates, timing and text stay deterministic.
        assertThat(refined.activePeriodStart()).isEqualTo(START);
        assertThat(refined.timing()).isEqualTo(deterministic.timing());
        assertThat(refined.description()).isEqualTo(deterministic.description());

        assertThat(new MetrolinxAlertNormalizer(java.time.Clock.fixed(START.toInstant(), java.time.ZoneOffset.UTC))
            .normalize(new MetrolinxFeed(START, List.of(), Map.of()), List.of(refined)))
            .singleElement().satisfies(alert -> assertThat(alert.affectedSegmentIds())
                .contains("segment-up-union-bloor", "segment-up-weston-pearson-airport"));
    }

    @Test
    void aConfidentReadingDecidesTheEffectAndScopeOverTheDeterministicGuess() {
        // "There will be no UP Express train service" once read as a timetable adjustment.
        RegionalAlertClassification deterministic = classification("service-adjustment", "corridor",
            List.of(), List.of(), null);

        RegionalAlertClassification refined = RegionalAlertExtractionPolicy.refine(deterministic,
            extraction("no-service", "corridor", null, null, "go-bus", "high",
                List.of("bloor", "mount-dennis", "weston")), "m");

        assertThat(refined.serviceEffect()).isEqualTo("no-service");
        assertThat(refined.replacementService()).isEqualTo("go-bus");
        assertThat(refined.spanStationIds()).containsExactly("union", "pearson-airport");
        assertThat(refined.impacts()).singleElement().satisfies(impact -> {
            assertThat(impact.serviceEffect()).isEqualTo("no-service");
            assertThat(impact.start()).isEqualTo(START);
        });

        // Model-chosen listed stations replace a wrong deterministic span.
        RegionalAlertClassification listed = RegionalAlertExtractionPolicy.refine(
            classification("no-service", "segment-span", List.of("union", "weston"), List.of(), null),
            new RegionalAlertExtraction("no-service", "listed-stations", List.of(), List.of("bloor"), "none",
                List.of(), null, "high"), "m");
        assertThat(listed.scope()).isEqualTo("listed-stations");
        assertThat(listed.spanStationIds()).isEmpty();
        assertThat(listed.impacts()).singleElement()
            .satisfies(impact -> assertThat(impact.stationIds()).containsExactly("bloor"));
    }

    @Test
    void fallsBackToTheDeterministicClassificationWhenTheReadingCannotDecide() {
        RegionalAlertClassification deterministic = classification("delay", "segment-span",
            List.of("union", "weston"), List.of(), null);

        assertThat(RegionalAlertExtractionPolicy.refine(deterministic,
            extraction("no-service", "corridor", null, null, "none", "medium", List.of()), "m")).isSameAs(deterministic);
        assertThat(RegionalAlertExtractionPolicy.refine(deterministic,
            extraction("unknown", "corridor", null, null, "none", "high", List.of()), "m")).isSameAs(deterministic);
        assertThat(RegionalAlertExtractionPolicy.refine(deterministic,
            extraction("service-resumed", "corridor", null, null, "none", "high", List.of()), "m")).isSameAs(deterministic);
        assertThat(RegionalAlertExtractionPolicy.refine(deterministic, null, "m")).isSameAs(deterministic);
    }

    @Test
    void explicitResolutionNoticesKeepTheirDeterministicStatus() {
        RegionalAlertClassification resolved = classification("service-resumed", "corridor", List.of(), List.of(), null);

        assertThat(RegionalAlertExtractionPolicy.refine(resolved,
            extraction("delay", "corridor", null, null, "none", "high", List.of()), "m")).isSameAs(resolved);
    }

    @Test
    void fillsAnUnknownEffectAsAnAdvisoryWithoutInventingTiming() {
        RegionalAlertClassification deterministic = new RegionalAlertClassification("up-2",
            List.of(new RegionalAlertClassification.SourceReference("up-gtfs-alerts", "2")), List.of("regional-up"),
            List.of(), "unknown", "unknown", null, "unknown", null, null, null, "UP notice", "Text", null, null,
            "unknown", null, null, null, List.of(), List.of(), Map.of(), Map.of(), "{}", List.of());

        RegionalAlertClassification refined = RegionalAlertExtractionPolicy.refine(deterministic,
            extraction("delay", "segment-span", "bloor", "weston", "none", "high", List.of()), "m");

        assertThat(refined.serviceEffect()).isEqualTo("delay");
        assertThat(refined.scope()).isEqualTo("segment-span");
        assertThat(refined.impacts()).singleElement().satisfies(impact -> {
            assertThat(impact.id()).isEqualTo("timing-unknown");
            assertThat(impact.stationIds()).containsExactly("bloor", "weston");
            assertThat(impact.start()).isNull();
            assertThat(impact.uncertainty()).isEqualTo("Timing not verified");
        });
    }

    @Test
    void reportsDifferencesForShadowReview() {
        RegionalAlertClassification deterministic = classification("no-service", "segment-span",
            List.of("union", "weston"), List.of(), "go-bus");
        RegionalAlertExtractionPolicy.Reading reading = RegionalAlertExtractionPolicy.Reading.of(deterministic);

        assertThat(RegionalAlertExtractionPolicy.differences(reading,
            extraction("no-service", "segment-span", "weston", "union", "go-bus", "high", List.of()))).isEmpty();
        assertThat(RegionalAlertExtractionPolicy.differences(reading,
            extraction("no-service", "segment-span", "union", "pearson-airport", "go-bus", "high",
                List.of("weston")))).containsExactly(
            "span: union-weston vs union-pearson-airport", "skipped: [] vs [weston]");
        assertThat(RegionalAlertExtractionPolicy.differences(reading,
            extraction("delay", "corridor", null, null, "unknown", "high", List.of()))).containsExactly(
            "effect: no-service vs delay", "scope: segment-span vs corridor");
    }

    private static RegionalAlertClassification classification(
        String effect, String scope, List<String> span, List<String> stations, String replacement
    ) {
        List<String> impactStations = "segment-span".equals(scope) ? span : stations;
        return new RegionalAlertClassification("up-1",
            List.of(new RegionalAlertClassification.SourceReference("go-service-alerts", "M1")),
            List.of("regional-up"), List.of(), "planned", effect, null, scope, "construction", replacement, null,
            "Weekend service adjustments", "GO buses replace UP Express trains.", START, END, "text-date-range",
            START, END, START.minusDays(1), stations, span, Map.of(), Map.of("title", List.of("go-service-alerts:M1")),
            "{}", List.of(new RegionalAlertClassification.Impact("window-0", effect, scope, impactStations,
                START, END, "text-date-range", "explicit service window", null)));
    }

    private static RegionalAlertExtraction extraction(
        String effect, String scope, String from, String to, String replacement, String confidence, List<String> skipped
    ) {
        List<String> span = from == null || to == null ? List.of() : List.of(from, to);
        return new RegionalAlertExtraction(effect, scope, span, List.of(), replacement, skipped, null, confidence);
    }

    private static JsonNode reply(String json) {
        return JSON.readTree(json);
    }
}
