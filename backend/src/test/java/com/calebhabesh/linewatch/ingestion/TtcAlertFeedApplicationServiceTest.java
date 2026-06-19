package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TtcAlertFeedApplicationServiceTest {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-06-01T12:00:00Z"),
        ZoneOffset.UTC
    );
    private static final OffsetDateTime NOW = OffsetDateTime.now(CLOCK);

    private final TtcAlertStore store = mock(TtcAlertStore.class);
    private final TtcAlertNormalizer normalizer = mock(TtcAlertNormalizer.class);
    private final RapidTransitAlertDuplicateMatcher duplicateMatcher =
        mock(RapidTransitAlertDuplicateMatcher.class);
    private final com.calebhabesh.linewatch.surface.SurfaceServiceNoticeNormalizer surfaceNormalizer =
        mock(com.calebhabesh.linewatch.surface.SurfaceServiceNoticeNormalizer.class);
    private final com.calebhabesh.linewatch.surface.SurfaceServiceNoticeStore surfaceStore =
        mock(com.calebhabesh.linewatch.surface.SurfaceServiceNoticeStore.class);
    private final TtcFetchedRecord route = new TtcFetchedRecord(
        TestAlertRecords.route("route-source"),
        "{\"id\":\"route-source\"}"
    );
    private final TtcFetchedRecord outage = new TtcFetchedRecord(
        TestAlertRecords.accessibility("outage-source"),
        "{\"id\":\"outage-source\"}"
    );
    private final NormalizedRouteAlert normalizedAlert = TestAlertRecords.normalizedRoute(
        "route-source"
    );
    private final NormalizedAccessibilityOutage normalizedOutage =
        TestAlertRecords.normalizedAccessibility("outage-source");
    private final TtcAlertFeed feed = new TtcAlertFeed(
        OffsetDateTime.parse("2026-06-01T11:55:00Z"),
        List.of(route),
        List.of(outage)
    );
    private final TtcAlertFeed routeOnlyFeed = new TtcAlertFeed(
        OffsetDateTime.parse("2026-06-01T11:55:00Z"),
        List.of(route),
        List.of()
    );

    private TtcAlertFeedApplicationService service;

    @BeforeEach
    void setUp() {
        service = new TtcAlertFeedApplicationService(
            store,
            normalizer,
            duplicateMatcher,
            surfaceNormalizer,
            surfaceStore,
            CLOCK
        );
        when(store.upsertSource("routes", route, NOW)).thenReturn("routes:route-source");
        when(store.upsertSource("accessibility", outage, NOW))
            .thenReturn("accessibility:outage-source");
    }

    @Test
    void stagesEveryRecordButCountsIgnoredSurfaceRouteOnlyAsStaged() {
        when(normalizer.normalizeRoute(route)).thenReturn(NormalizationResult.ignored());
        when(normalizer.normalizeAccessibility(outage))
            .thenReturn(NormalizationResult.matched(normalizedOutage));

        FeedApplicationCounts counts = service.apply(feed);

        verify(store).upsertSource("routes", route, NOW);
        verify(store).upsertSource("accessibility", outage, NOW);
        verify(store).upsertAccessibilityOutage(normalizedOutage, NOW);
        assertThat(counts).isEqualTo(new FeedApplicationCounts(2, 2, 1, 0));
    }

    @Test
    void persistsMatchedRouteAlert() {
        when(normalizer.normalizeRoute(route))
            .thenReturn(NormalizationResult.matched(normalizedAlert));

        FeedApplicationCounts counts = service.apply(routeOnlyFeed);

        verify(store).upsertRouteAlert(normalizedAlert, NOW);
        assertThat(counts).isEqualTo(new FeedApplicationCounts(1, 1, 1, 0));
    }

    @Test
    void countsSupportedButUnresolvedProjectionAsUnmatched() {
        when(normalizer.normalizeRoute(route)).thenReturn(NormalizationResult.unmatched());

        FeedApplicationCounts counts = service.apply(routeOnlyFeed);

        verify(store, never()).upsertRouteAlert(normalizedAlert, NOW);
        assertThat(counts).isEqualTo(new FeedApplicationCounts(1, 1, 0, 1));
    }

    @Test
    void deactivatesOnlyAfterApplyingSuccessfullyParsedFeed() {
        when(normalizer.normalizeRoute(route)).thenReturn(NormalizationResult.ignored());
        when(normalizer.normalizeAccessibility(outage))
            .thenReturn(NormalizationResult.matched(normalizedOutage));

        service.apply(feed);

        verify(store).deactivateMissingSources(Set.of(
            "routes:route-source",
            "accessibility:outage-source"
        ));
        verify(store).deactivateMissingAlerts(Set.of(), NOW);
        verify(store).deactivateMissingAccessibilityOutages(Set.of("outage-source"), NOW);
    }

    @Test
    void stagesBothSourcesButPrefersMatchingLiveAlertProjection() {
        TtcFetchedRecord liveFetched = fetchedRoute("live-source");
        TtcFetchedRecord gtfsFetched = fetchedRoute("gtfsrt-source");
        NormalizedRouteAlert liveProjection =
            normalizedRoute("live-source", "Live");
        NormalizedRouteAlert gtfsProjection =
            normalizedRoute("gtfsrt-source", "GTFS-RT");
        TtcAlertFeed combinedFeed = new TtcAlertFeed(
            feed.lastUpdated(),
            List.of(liveFetched, gtfsFetched),
            List.of()
        );
        when(store.upsertSource("routes", liveFetched, NOW))
            .thenReturn("routes:live-source");
        when(store.upsertSource("routes", gtfsFetched, NOW))
            .thenReturn("routes:gtfsrt-source");
        when(normalizer.normalizeRoute(liveFetched))
            .thenReturn(NormalizationResult.matched(liveProjection));
        when(normalizer.normalizeRoute(gtfsFetched))
            .thenReturn(NormalizationResult.matched(gtfsProjection));
        when(duplicateMatcher.isGtfsRtDuplicateOfLive(gtfsProjection, liveProjection))
            .thenReturn(true);

        FeedApplicationCounts counts = service.apply(combinedFeed);

        verify(store).upsertSource("routes", liveFetched, NOW);
        verify(store).upsertSource("routes", gtfsFetched, NOW);
        verify(store).upsertRouteAlert(liveProjection, NOW);
        verify(store, never()).upsertRouteAlert(gtfsProjection, NOW);
        verify(store).deactivateMissingAlerts(Set.of("live-source"), NOW);
        assertThat(counts).isEqualTo(new FeedApplicationCounts(2, 2, 1, 0));
    }

    @Test
    void persistsGtfsRtProjectionWhenItIsTheOnlySource() {
        TtcFetchedRecord gtfsFetched = fetchedRoute("gtfsrt-source");
        NormalizedRouteAlert gtfsProjection =
            normalizedRoute("gtfsrt-source", "GTFS-RT");
        TtcAlertFeed gtfsOnlyFeed = new TtcAlertFeed(
            feed.lastUpdated(),
            List.of(gtfsFetched),
            List.of()
        );
        when(store.upsertSource("routes", gtfsFetched, NOW))
            .thenReturn("routes:gtfsrt-source");
        when(normalizer.normalizeRoute(gtfsFetched))
            .thenReturn(NormalizationResult.matched(gtfsProjection));

        FeedApplicationCounts counts = service.apply(gtfsOnlyFeed);

        verify(store).upsertRouteAlert(gtfsProjection, NOW);
        verify(store).deactivateMissingAlerts(Set.of("gtfsrt-source"), NOW);
        assertThat(counts).isEqualTo(new FeedApplicationCounts(1, 1, 1, 0));
    }

    @Test
    void persistsBothProjectionsWhenMatcherDoesNotConfirmDuplicate() {
        TtcFetchedRecord liveFetched = fetchedRoute("live-source");
        TtcFetchedRecord gtfsFetched = fetchedRoute("gtfsrt-source");
        NormalizedRouteAlert liveProjection =
            normalizedRoute("live-source", "Live");
        NormalizedRouteAlert gtfsProjection =
            normalizedRoute("gtfsrt-source", "GTFS-RT");
        TtcAlertFeed combinedFeed = new TtcAlertFeed(
            feed.lastUpdated(),
            List.of(liveFetched, gtfsFetched),
            List.of()
        );
        when(store.upsertSource("routes", liveFetched, NOW))
            .thenReturn("routes:live-source");
        when(store.upsertSource("routes", gtfsFetched, NOW))
            .thenReturn("routes:gtfsrt-source");
        when(normalizer.normalizeRoute(liveFetched))
            .thenReturn(NormalizationResult.matched(liveProjection));
        when(normalizer.normalizeRoute(gtfsFetched))
            .thenReturn(NormalizationResult.matched(gtfsProjection));

        FeedApplicationCounts counts = service.apply(combinedFeed);

        verify(store).upsertRouteAlert(liveProjection, NOW);
        verify(store).upsertRouteAlert(gtfsProjection, NOW);
        verify(store).deactivateMissingAlerts(
            Set.of("live-source", "gtfsrt-source"),
            NOW
        );
        assertThat(counts).isEqualTo(new FeedApplicationCounts(2, 2, 2, 0));
    }

    @Test
    void countsSuppressedUnresolvedGtfsProjectionAsUnmatched() {
        TtcFetchedRecord liveFetched = fetchedRoute("live-source");
        TtcFetchedRecord gtfsFetched = fetchedRoute("gtfsrt-source");
        NormalizedRouteAlert liveProjection =
            normalizedRoute("live-source", "Live");
        NormalizedRouteAlert gtfsProjection =
            normalizedRoute("gtfsrt-source", "GTFS-RT");
        TtcAlertFeed combinedFeed = new TtcAlertFeed(
            feed.lastUpdated(),
            List.of(liveFetched, gtfsFetched),
            List.of()
        );
        when(store.upsertSource("routes", liveFetched, NOW))
            .thenReturn("routes:live-source");
        when(store.upsertSource("routes", gtfsFetched, NOW))
            .thenReturn("routes:gtfsrt-source");
        when(normalizer.normalizeRoute(liveFetched))
            .thenReturn(NormalizationResult.matched(liveProjection));
        when(normalizer.normalizeRoute(gtfsFetched))
            .thenReturn(NormalizationResult.matchedWithUnresolved(gtfsProjection));
        when(duplicateMatcher.isGtfsRtDuplicateOfLive(gtfsProjection, liveProjection))
            .thenReturn(true);

        FeedApplicationCounts counts = service.apply(combinedFeed);

        verify(store).upsertRouteAlert(liveProjection, NOW);
        verify(store, never()).upsertRouteAlert(gtfsProjection, NOW);
        assertThat(counts).isEqualTo(new FeedApplicationCounts(2, 2, 1, 1));
    }

    private TtcFetchedRecord fetchedRoute(String sourceId) {
        return new TtcFetchedRecord(
            TestAlertRecords.route(sourceId),
            "{\"id\":\"" + sourceId + "\"}"
        );
    }

    private NormalizedRouteAlert normalizedRoute(String sourceId, String sourceType) {
        NormalizedRouteAlert base = TestAlertRecords.normalizedRoute(sourceId);
        return new NormalizedRouteAlert(
            base.id(),
            base.sourceId(),
            base.lineId(),
            base.type(),
            base.severity(),
            base.title(),
            base.description(),
            sourceType,
            base.effect(),
            base.effectDescription(),
            base.direction(),
            base.cause(),
            base.causeDescription(),
            base.targetRemoval(),
            base.impactKind(),
            base.rszLength(),
            base.stationDistance(),
            base.trackPercent(),
            base.reducedSpeed(),
            base.averageSpeed(),
            base.startStationId(),
            base.endStationId(),
            base.activePeriodStart(),
            base.activePeriodEnd(),
            base.sourceUpdatedAt(),
            base.shuttleType(),
            base.shuttleStart(),
            base.shuttleEnd(),
            base.rawPayload(),
            base.stationIds(),
            base.periods(),
            base.fingerprint()
        );
    }
}
