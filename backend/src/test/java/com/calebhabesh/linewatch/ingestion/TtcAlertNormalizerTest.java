package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.surface.GtfsRtServiceAlertTextParser;
import com.calebhabesh.linewatch.station.StationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.web.client.RestClient;

class TtcAlertNormalizerTest {
    private final StationRepository stationRepository = mock(StationRepository.class);
    private TtcAlertFeed feed;
    private TtcAlertNormalizer normalizer;

    @BeforeEach
    void setUp() throws Exception {
        when(stationRepository.existsById(anyString())).thenReturn(true);
        StationAliasResolver resolver = new StationAliasResolver(stationRepository);
        normalizer = new TtcAlertNormalizer(resolver, new AlertDirectionParser());
        String body = new String(
            getClass().getResourceAsStream("/fixtures/ttc-synthetic-alerts.json").readAllBytes(),
            StandardCharsets.UTF_8
        );
        feed = new TtcAlertClient(
            RestClient.create(),
            new ObjectMapper().findAndRegisterModules(),
            new AlertIngestionProperties(),
            new GtfsRtServiceAlertTextParser()
        ).parse(body);
    }

    @Test
    void normalizesRecurringPlannedClosureWithChildPeriod() {
        TtcAlertRecord record = feed.routes().getFirst().record();
        record = copyRszMetadata(record, record.effectDesc(), "600 metres", null, null, null, null);
        NormalizationResult<NormalizedRouteAlert> result =
            normalizer.normalizeRoute(fetched(record));

        assertThat(result.status()).isEqualTo(NormalizationStatus.MATCHED);
        assertThat(result.projection()).get()
            .extracting(
                NormalizedRouteAlert::id,
                NormalizedRouteAlert::lineId,
                NormalizedRouteAlert::type,
                NormalizedRouteAlert::severity,
                NormalizedRouteAlert::impactKind
            )
            .containsExactly(
                "ttc-route-synthetic-planned-line-1",
                "line-1",
                "planned-closure",
                "planned",
                AlertImpactKind.PLANNED_CLOSURE
            );
        assertThat(result.projection().orElseThrow().periods())
            .containsExactly(new NormalizedAlertPeriod(
                "synthetic-planned-line-1-period",
                OffsetDateTime.parse("2026-06-02T03:59:00Z"),
                OffsetDateTime.parse("2026-06-02T07:30:00Z"),
                0
            ));
    }

    @Test
    void normalizesPlannedTypedMedicalEmergencyNoServiceAsActiveSuspension() {
        TtcAlertRecord record = fetchedRecord("2", "Subway", "NO_SERVICE").record();
        record = new TtcAlertRecord(
            "69218",
            "Planned",
            OffsetDateTime.parse("2026-06-02T21:13:08.967Z"),
            new TtcAlertActivePeriod(
                OffsetDateTime.parse("2026-06-02T09:11:00Z"),
                null
            ),
            List.of("Current"),
            record.route(),
            record.routeType(),
            "Broadview",
            "Woodbine",
            List.of("Broadview", "Chester", "Pape", "Donlands", "Greenwood", "Coxwell", "Woodbine"),
            "No service between Broadview and Woodbine stations while we respond to a medical emergency.",
            "",
            "Line 2 Bloor-Danforth: No service between Broadview and Woodbine stations while we respond to a medical emergency.",
            "NO_SERVICE",
            "No Service",
            "Both ways",
            "MEDICAL_EMERGENCY",
            "Medical emergency",
            null,
            null,
            null,
            null,
            null,
            null,
            "Ordered",
            "Broadview",
            "Kipling",
            null,
            null,
            List.of()
        );

        NormalizedRouteAlert alert = normalizer.normalizeRoute(fetched(record))
            .projection()
            .orElseThrow();

        assertThat(alert.type()).isEqualTo("active-alert");
        assertThat(alert.severity()).isEqualTo("suspension");
        assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.SUSPENSION);
    }

    @Test
    void normalizesReducedSpeedZoneAsDelayAndDropsSentinelEnd() {
        NormalizedRouteAlert alert =
            normalizer.normalizeRoute(feed.routes().get(1)).projection().orElseThrow();

        assertThat(alert.type()).isEqualTo("active-alert");
        assertThat(alert.severity()).isEqualTo("delay");
        assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.REDUCED_SPEED_ZONE);
        assertThat(alert.direction()).isEqualTo(AlertDirection.SOUTHBOUND);
        assertThat(alert.activePeriodEnd()).isNull();
        assertThat(alert.periods())
            .containsExactly(new NormalizedAlertPeriod(
                "parent",
                OffsetDateTime.parse("2026-05-26T10:00:00Z"),
                null,
                0
            ));
    }

    @Test
    void ignoresSurfaceRoutesWithoutCountingThemAsUnmatched() {
        NormalizationResult<NormalizedRouteAlert> result =
            normalizer.normalizeRoute(fetchedRecord("52", "Bus", "SIGNIFICANT_DELAYS"));

        assertThat(result.status()).isEqualTo(NormalizationStatus.IGNORED);
        assertThat(result.shouldPersist()).isFalse();
        assertThat(result.countsAsUnmatched()).isFalse();
    }

    @Test
    void ignoresRoutesWithoutRapidTransitType() {
        NormalizationResult<NormalizedRouteAlert> result =
            normalizer.normalizeRoute(fetchedRecord("1", null, "SIGNIFICANT_DELAYS"));

        assertThat(result.status()).isEqualTo(NormalizationStatus.IGNORED);
    }

    @Test
    void reportsUnsupportedRapidRoutesAsUnmatched() {
        NormalizationResult<NormalizedRouteAlert> result =
            normalizer.normalizeRoute(fetchedRecord("3", "Subway", "SIGNIFICANT_DELAYS"));

        assertThat(result.status()).isEqualTo(NormalizationStatus.UNMATCHED);
        assertThat(result.shouldPersist()).isFalse();
        assertThat(result.countsAsUnmatched()).isTrue();
    }

    @Test
    void reportsBlankRapidRouteSourceIdsAsUnmatched() {
        TtcAlertRecord record = fetchedRecord("1", "Subway", "SIGNIFICANT_DELAYS").record();
        NormalizationResult<NormalizedRouteAlert> result =
            normalizer.normalizeRoute(fetched(copy(record, " ", record.stopIDList(), record.title())));

        assertThat(result.status()).isEqualTo(NormalizationStatus.UNMATCHED);
    }

    @Test
    void normalizesCurrentNoServiceAsSuspension() {
        TtcAlertRecord record = fetchedRecord("2", "Subway", "NO_SERVICE").record();
        record = copyRszMetadata(record, record.effectDesc(), null, null, null, "15 km/h", null);
        NormalizedRouteAlert alert =
            normalizer.normalizeRoute(fetched(record))
                .projection()
                .orElseThrow();

        assertThat(alert.lineId()).isEqualTo("line-2");
        assertThat(alert.type()).isEqualTo("active-alert");
        assertThat(alert.severity()).isEqualTo("suspension");
        assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.SUSPENSION);
    }

    @Test
    void normalizesSignificantDelayWithoutRszMetadataAsOrdinaryDelay() {
        NormalizedRouteAlert alert =
            normalizer.normalizeRoute(fetchedRecord("1", "Subway", "SIGNIFICANT_DELAYS"))
                .projection()
                .orElseThrow();

        assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.DELAY);
    }

    @Test
    void normalizesRouteSourceTimestampsAsTorontoWallClockInstants() {
        OffsetDateTime sourceTime = OffsetDateTime.parse("2026-06-02T23:41:26.170Z");
        TtcAlertRecord base = fetchedRecord("2", "Subway", "SIGNIFICANT_DELAYS").record();
        TtcAlertRecord record = new TtcAlertRecord(
            "69235",
            "Planned",
            sourceTime,
            new TtcAlertActivePeriod(sourceTime, OffsetDateTime.parse("0001-01-01T00:00:00Z")),
            List.of("Current"),
            base.route(),
            base.routeType(),
            "Keele",
            "Keele",
            List.of("Keele"),
            "Delays westbound at Keele station while we respond to an emergency alarm.",
            "",
            "Line 2 Bloor-Danforth: Delays westbound at Keele station while we respond to an emergency alarm.",
            "SIGNIFICANT_DELAYS",
            "Delays",
            "Westbound",
            "MEDICAL_EMERGENCY",
            "Emergency alarm",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            List.of()
        );

        NormalizedRouteAlert alert = normalizer.normalizeRoute(fetched(record))
            .projection()
            .orElseThrow();

        OffsetDateTime expectedInstant = OffsetDateTime.parse("2026-06-03T03:41:26.170Z");
        assertThat(alert.activePeriodStart()).isEqualTo(expectedInstant);
        assertThat(alert.sourceUpdatedAt()).isEqualTo(expectedInstant);
        assertThat(alert.periods()).containsExactly(new NormalizedAlertPeriod(
            "parent",
            expectedInstant,
            null,
            0
        ));
    }

    @Test
    void normalizesExplicitReducedSpeedZoneDescription() {
        TtcAlertRecord record = fetchedRecord("1", "Subway", "UNKNOWN").record();
        record = copyRszMetadata(record, "Reduced Speed Zone", null, null, null, null, null);

        NormalizedRouteAlert alert = normalizer.normalizeRoute(fetched(record))
            .projection()
            .orElseThrow();

        assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.REDUCED_SPEED_ZONE);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("rszMetadata")
    void normalizesRszSpecificMetadataWithoutReducedSpeedZoneDescription(
        String metadataName,
        String rszLength,
        String distance,
        String trackPercent,
        String reducedSpeed,
        String averageSpeed
    ) {
        TtcAlertRecord record = fetchedRecord("1", "Subway", "SIGNIFICANT_DELAYS").record();
        record = copyRszMetadata(
            record,
            "Service change",
            rszLength,
            distance,
            trackPercent,
            reducedSpeed,
            averageSpeed
        );

        NormalizedRouteAlert alert = normalizer.normalizeRoute(fetched(record))
            .projection()
            .orElseThrow();

        assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.REDUCED_SPEED_ZONE);
    }

    @Test
    void reportsUnrelatedSupportedRapidTransitRecordAsUnmatched() {
        NormalizationResult<NormalizedRouteAlert> result =
            normalizer.normalizeRoute(fetchedRecord("1", "Subway", "UNKNOWN"));

        assertThat(result.status()).isEqualTo(NormalizationStatus.UNMATCHED);
    }

    @Test
    void reportsUnrelatedSupportedRapidTransitRecordWithRszMetadataAsUnmatched() {
        TtcAlertRecord record = fetchedRecord("1", "Subway", "UNKNOWN").record();
        record = copyRszMetadata(record, "Service change", "600 metres", null, null, null, null);

        NormalizationResult<NormalizedRouteAlert> result =
            normalizer.normalizeRoute(fetched(record));

        assertThat(result.status()).isEqualTo(NormalizationStatus.UNMATCHED);
    }

    @Test
    void normalizesLrtLineWithoutConfusingItWithSurfaceRouteNumber() {
        NormalizedRouteAlert alert =
            normalizer.normalizeRoute(fetchedRecord("5", "LRT", "SIGNIFICANT_DELAYS"))
                .projection()
                .orElseThrow();

        assertThat(alert.lineId()).isEqualTo("line-5");
    }

    @Test
    void preservesResolvedStopListOrderWithoutDuplicates() {
        TtcAlertRecord record = fetchedRecord("1", "Subway", "SIGNIFICANT_DELAYS").record();
        record = copy(record, record.id(), List.of("Davisville", "Eglinton", "Davisville"), record.title());

        NormalizedRouteAlert alert = normalizer.normalizeRoute(fetched(record))
            .projection()
            .orElseThrow();

        assertThat(alert.startStationId()).isEqualTo("eglinton");
        assertThat(alert.endStationId()).isEqualTo("davisville");
        assertThat(alert.stationIds()).containsExactly("davisville", "eglinton");
    }

    @Test
    void usesResolvedRouteBoundsWhenTtcOmitsStopList() {
        TtcAlertRecord record = fetchedRecord("1", "Subway", "SIGNIFICANT_DELAYS").record();
        record = copy(record, record.id(), List.of(), record.title());

        NormalizedRouteAlert alert = normalizer.normalizeRoute(fetched(record))
            .projection()
            .orElseThrow();

        assertThat(alert.stationIds()).containsExactly("eglinton", "davisville");
    }

    @Test
    void assignsStableFallbackIdWhenChildPeriodOmitsSourceId() {
        TtcAlertRecord record = feed.routes().getFirst().record();
        record = copyChildAlerts(record, List.of(new TtcAlertChildPeriod(
            null,
            OffsetDateTime.parse("2026-06-01T23:59:00Z"),
            OffsetDateTime.parse("2026-06-02T03:30:00Z")
        )));

        NormalizedRouteAlert alert = normalizer.normalizeRoute(fetched(record))
            .projection()
            .orElseThrow();

        assertThat(alert.periods()).containsExactly(new NormalizedAlertPeriod(
            "child-0",
            OffsetDateTime.parse("2026-06-02T03:59:00Z"),
            OffsetDateTime.parse("2026-06-02T07:30:00Z"),
            0
        ));
    }

    @Test
    void normalizesElevatorOutageFromHeaderPrefix() {
        NormalizedAccessibilityOutage outage =
            normalizer.normalizeAccessibility(feed.accessibility().getFirst())
                .projection()
                .orElseThrow();

        assertThat(outage.id()).isEqualTo("ttc-accessibility-synthetic-elevator-warden");
        assertThat(outage.assetType()).isEqualTo("elevator");
        assertThat(outage.stationIds()).containsExactly("warden");
        assertThat(outage.cause()).isEqualTo("Technical issue");
        assertThat(outage.activePeriodEnd()).isNull();
    }

    @Test
    void marksAccessibilityWithoutStationPrefixAsUnmatched() {
        NormalizationResult<NormalizedAccessibilityOutage> result =
            normalizer.normalizeAccessibility(fetchedAccessibility("Elevator unavailable"));

        assertThat(result.status()).isEqualTo(NormalizationStatus.UNMATCHED);
    }

    @Test
    void ignoresUnsupportedAccessibilityAssets() {
        TtcAlertRecord record = fetchedAccessibility("Warden: Ramp unavailable").record();
        record = copyRouteType(record, "Ramp");

        NormalizationResult<NormalizedAccessibilityOutage> result =
            normalizer.normalizeAccessibility(fetched(record));

        assertThat(result.status()).isEqualTo(NormalizationStatus.IGNORED);
        assertThat(result.countsAsUnmatched()).isFalse();
    }

    @Test
    void ignoresAccessibilityWithoutAssetType() {
        TtcAlertRecord record = fetchedAccessibility("Warden: Elevator unavailable").record();
        record = copyRouteType(record, null);

        NormalizationResult<NormalizedAccessibilityOutage> result =
            normalizer.normalizeAccessibility(fetched(record));

        assertThat(result.status()).isEqualTo(NormalizationStatus.IGNORED);
    }

    @Test
    void persistsResolvableRouteMetadataWhileReportingUnknownStation() {
        when(stationRepository.existsById("imaginary-station")).thenReturn(false);
        TtcFetchedRecord fetched = fetchedRecord("1", "Subway", "SIGNIFICANT_DELAYS");
        TtcAlertRecord record = fetched.record();
        fetched = fetched(new TtcAlertRecord(
            record.id(), record.alertType(), record.lastUpdated(), record.activePeriod(),
            record.activePeriodGroup(), record.route(), record.routeType(),
            "Eglinton", "Imaginary Station", List.of("Eglinton", "Imaginary Station"),
            record.title(), record.description(), record.headerText(), record.effect(),
            record.effectDesc(), record.direction(), record.cause(), record.causeDescription(),
            record.targetRemoval(), record.rszLength(), record.distance(), record.trackPercent(),
            record.reducedSpeed(), record.averageSpeed(), record.shuttleType(), record.shuttleStart(),
            record.shuttleEnd(),
            record.elevatorCode(), record.escalatorCode(), record.childAlerts()
        ));

        NormalizationResult<NormalizedRouteAlert> result = normalizer.normalizeRoute(fetched);

        assertThat(result.status()).isEqualTo(NormalizationStatus.MATCHED_WITH_UNRESOLVED);
        assertThat(result.shouldPersist()).isTrue();
        assertThat(result.countsAsUnmatched()).isTrue();
        assertThat(result.projection().orElseThrow().stationIds()).containsExactly("eglinton");
    }

    @Test
    void hashesRiderVisibleValuesAndOrderedStations() {
        TtcAlertRecord record = fetchedRecord("1", "Subway", "SIGNIFICANT_DELAYS").record();
        NormalizedRouteAlert original = normalizer.normalizeRoute(fetched(record))
            .projection()
            .orElseThrow();
        NormalizedRouteAlert changedTitle = normalizer.normalizeRoute(fetched(
            copy(record, record.id(), record.stopIDList(), "Changed rider-visible title")
        )).projection().orElseThrow();
        NormalizedRouteAlert changedStationOrder = normalizer.normalizeRoute(fetched(
            copy(record, record.id(), List.of("Davisville", "Eglinton"), record.title())
        )).projection().orElseThrow();

        assertThat(original.fingerprint()).isNotEqualTo(changedTitle.fingerprint());
        assertThat(original.fingerprint()).isNotEqualTo(changedStationOrder.fingerprint());
        assertThat(AlertFingerprint.sha256("abc"))
            .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    @Test
    void hashesReducedSpeedZoneMetadata() {
        TtcAlertRecord record = fetchedRecord("1", "Subway", "SIGNIFICANT_DELAYS").record();
        record = copyRszMetadata(
            record,
            "Reduced Speed Zone",
            "600 metres",
            null,
            null,
            null,
            null
        );
        NormalizedRouteAlert original = normalizer.normalizeRoute(fetched(record))
            .projection()
            .orElseThrow();
        NormalizedRouteAlert changedRszLength = normalizer.normalizeRoute(fetched(
            copyRszMetadata(record, record.effectDesc(), "700 metres", null, null, null, null)
        )).projection().orElseThrow();

        assertThat(original.fingerprint()).isNotEqualTo(changedRszLength.fingerprint());
    }

    @Test
    void fillsRequiredTextFieldsWhenTtcOmitsOptionalDescriptions() {
        TtcAlertRecord route = copyTextFields(
            fetchedRecord("1", "Subway", "SIGNIFICANT_DELAYS").record(),
            null,
            null
        );
        TtcAlertRecord accessibility = copyTextFields(
            fetchedAccessibility("Warden: Elevator unavailable").record(),
            null,
            null
        );

        NormalizedRouteAlert alert = normalizer.normalizeRoute(fetched(route))
            .projection()
            .orElseThrow();
        NormalizedAccessibilityOutage outage = normalizer.normalizeAccessibility(
            fetched(accessibility)
        ).projection().orElseThrow();

        assertThat(alert.title()).isEqualTo(route.headerText());
        assertThat(alert.description()).isEmpty();
        assertThat(outage.title()).isEqualTo(accessibility.headerText());
        assertThat(outage.description()).isEmpty();
    }

    @Test
    void normalizationResultFactoriesExposePersistenceAndUnmatchedSemantics() {
        assertThat(NormalizationResult.matched("value").shouldPersist()).isTrue();
        assertThat(NormalizationResult.matched("value").countsAsUnmatched()).isFalse();
        assertThat(NormalizationResult.matchedWithUnresolved("value").shouldPersist()).isTrue();
        assertThat(NormalizationResult.matchedWithUnresolved("value").countsAsUnmatched()).isTrue();
        assertThat(NormalizationResult.ignored().shouldPersist()).isFalse();
        assertThat(NormalizationResult.ignored().countsAsUnmatched()).isFalse();
        assertThat(NormalizationResult.unmatched().shouldPersist()).isFalse();
        assertThat(NormalizationResult.unmatched().countsAsUnmatched()).isTrue();
    }

    private TtcFetchedRecord fetchedRecord(String route, String routeType, String effect) {
        return fetched(new TtcAlertRecord(
            "source-" + route,
            "Live",
            OffsetDateTime.parse("2026-06-01T07:00:00Z"),
            new TtcAlertActivePeriod(
                OffsetDateTime.parse("2026-06-01T07:00:00Z"),
                null
            ),
            List.of("Current"),
            route,
            routeType,
            "Eglinton",
            "Davisville",
            List.of("Eglinton", "Davisville"),
            "Test route alert",
            "",
            "Line " + route + ": Test route alert",
            effect,
            effect,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            List.of()
        ));
    }

    private TtcFetchedRecord fetchedAccessibility(String headerText) {
        return fetched(new TtcAlertRecord(
            "source-accessibility",
            "Live",
            OffsetDateTime.parse("2026-06-01T07:00:00Z"),
            new TtcAlertActivePeriod(
                OffsetDateTime.parse("2026-06-01T07:00:00Z"),
                null
            ),
            List.of("Current"),
            null,
            "Elevator",
            null,
            null,
            List.of(),
            "Elevator unavailable",
            "",
            headerText,
            "ACCESSIBILITY_ISSUE",
            "Out of service",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "TEST",
            null,
            List.of()
        ));
    }

    private TtcFetchedRecord fetched(TtcAlertRecord record) {
        return new TtcFetchedRecord(record, "{\"id\":\"" + record.id() + "\"}");
    }

    private static Stream<Arguments> rszMetadata() {
        return Stream.of(
            Arguments.of("rsz length", "600 metres", null, null, null, null),
            Arguments.of("distance", null, "900 metres", null, null, null),
            Arguments.of("track percent", null, null, "67%", null, null),
            Arguments.of("reduced speed", null, null, null, "15 km/h", null),
            Arguments.of("average speed", null, null, null, null, "35 km/h")
        );
    }

    private TtcAlertRecord copy(
        TtcAlertRecord record,
        String id,
        List<String> stopIDList,
        String title
    ) {
        return new TtcAlertRecord(
            id, record.alertType(), record.lastUpdated(), record.activePeriod(),
            record.activePeriodGroup(), record.route(), record.routeType(),
            record.stopStart(), record.stopEnd(), stopIDList,
            title, record.description(), record.headerText(), record.effect(),
            record.effectDesc(), record.direction(), record.cause(), record.causeDescription(),
            record.targetRemoval(), record.rszLength(), record.distance(), record.trackPercent(),
            record.reducedSpeed(), record.averageSpeed(), record.shuttleType(), record.shuttleStart(),
            record.shuttleEnd(),
            record.elevatorCode(), record.escalatorCode(), record.childAlerts()
        );
    }

    private TtcAlertRecord copyRouteType(TtcAlertRecord record, String routeType) {
        return new TtcAlertRecord(
            record.id(), record.alertType(), record.lastUpdated(), record.activePeriod(),
            record.activePeriodGroup(), record.route(), routeType,
            record.stopStart(), record.stopEnd(), record.stopIDList(),
            record.title(), record.description(), record.headerText(), record.effect(),
            record.effectDesc(), record.direction(), record.cause(), record.causeDescription(),
            record.targetRemoval(), record.rszLength(), record.distance(), record.trackPercent(),
            record.reducedSpeed(), record.averageSpeed(), record.shuttleType(), record.shuttleStart(),
            record.shuttleEnd(),
            record.elevatorCode(), record.escalatorCode(), record.childAlerts()
        );
    }

    private TtcAlertRecord copyRszMetadata(
        TtcAlertRecord record,
        String effectDesc,
        String rszLength,
        String distance,
        String trackPercent,
        String reducedSpeed,
        String averageSpeed
    ) {
        return new TtcAlertRecord(
            record.id(), record.alertType(), record.lastUpdated(), record.activePeriod(),
            record.activePeriodGroup(), record.route(), record.routeType(),
            record.stopStart(), record.stopEnd(), record.stopIDList(),
            record.title(), record.description(), record.headerText(), record.effect(),
            effectDesc, record.direction(), record.cause(), record.causeDescription(),
            record.targetRemoval(), rszLength, distance, trackPercent,
            reducedSpeed, averageSpeed, record.shuttleType(), record.shuttleStart(),
            record.shuttleEnd(),
            record.elevatorCode(), record.escalatorCode(), record.childAlerts()
        );
    }

    private TtcAlertRecord copyChildAlerts(
        TtcAlertRecord record,
        List<TtcAlertChildPeriod> childAlerts
    ) {
        return new TtcAlertRecord(
            record.id(), record.alertType(), record.lastUpdated(), record.activePeriod(),
            record.activePeriodGroup(), record.route(), record.routeType(),
            record.stopStart(), record.stopEnd(), record.stopIDList(),
            record.title(), record.description(), record.headerText(), record.effect(),
            record.effectDesc(), record.direction(), record.cause(), record.causeDescription(),
            record.targetRemoval(), record.rszLength(), record.distance(), record.trackPercent(),
            record.reducedSpeed(), record.averageSpeed(), record.shuttleType(), record.shuttleStart(),
            record.shuttleEnd(),
            record.elevatorCode(), record.escalatorCode(), childAlerts
        );
    }

    private TtcAlertRecord copyTextFields(TtcAlertRecord record, String title, String description) {
        return new TtcAlertRecord(
            record.id(), record.alertType(), record.lastUpdated(), record.activePeriod(),
            record.activePeriodGroup(), record.route(), record.routeType(),
            record.stopStart(), record.stopEnd(), record.stopIDList(),
            title, description, record.headerText(), record.effect(),
            record.effectDesc(), record.direction(), record.cause(), record.causeDescription(),
            record.targetRemoval(), record.rszLength(), record.distance(), record.trackPercent(),
            record.reducedSpeed(), record.averageSpeed(), record.shuttleType(), record.shuttleStart(),
            record.shuttleEnd(),
            record.elevatorCode(), record.escalatorCode(), record.childAlerts()
        );
    }
}
