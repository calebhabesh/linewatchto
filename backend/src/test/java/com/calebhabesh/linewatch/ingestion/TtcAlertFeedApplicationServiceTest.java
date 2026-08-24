package com.calebhabesh.linewatch.ingestion;

import com.calebhabesh.linewatch.announcement.TtcAnnouncementNormalizer;
import com.calebhabesh.linewatch.announcement.TtcAnnouncementStore;
import com.calebhabesh.linewatch.announcement.TtcAnnouncement;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
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
    private final TtcAnnouncementNormalizer announcementNormalizer = mock(TtcAnnouncementNormalizer.class);
    private final TtcAnnouncementStore announcementStore = mock(TtcAnnouncementStore.class);
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
            announcementNormalizer,
            announcementStore,
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

        verify(store).deactivateMissingSources(
            Set.of("routes:route-source", "accessibility:outage-source"),
            Set.of(
                "routes",
                "accessibility",
                "site-wide-announcements",
                "general-announcements"
            )
        );
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
    void stagesAndPersistsInformationalAnnouncementsSeparately() {
        TtcFetchedRecord announcementRecord = fetchedRoute("banner-1");
        TtcAnnouncement announcement = new TtcAnnouncement(
            "ttc-announcement-site-wide-banner-1",
            "site-wide:banner-1",
            "site-wide",
            "System announcement",
            "Station entrance closed.",
            null,
            NOW,
            null,
            NOW,
            announcementRecord.rawPayload()
        );
        TtcAlertFeed announcementFeed = new TtcAlertFeed(
            feed.lastUpdated(),
            List.of(),
            List.of(),
            List.of(announcementRecord),
            List.of()
        );
        when(store.upsertSource("site-wide-announcements", announcementRecord, NOW))
            .thenReturn("site-wide-announcements:banner-1");
        when(announcementNormalizer.normalize(announcementRecord, "site-wide"))
            .thenReturn(Optional.of(announcement));

        FeedApplicationCounts counts = service.apply(announcementFeed);

        verify(announcementStore).upsert(announcement, NOW);
        verify(announcementStore).deactivateMissing(Set.of("site-wide:banner-1"), NOW);
        verify(store).deactivateMissingSources(
            Set.of("site-wide-announcements:banner-1"),
            Set.of(
                "routes",
                "accessibility",
                "site-wide-announcements",
                "general-announcements"
            )
        );
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

    @Test
    void persistsAndSourceScopesAnAvailableWebsiteClosureSupplement() {
        TtcFetchedRecord websiteFetched = fetchedRoute("ttc-ca-closure-one");
        NormalizedRouteAlert websiteClosure = plannedClosure(
            "ttc-ca-closure-one",
            TtcSubwayClosureParser.SOURCE_ALERT_TYPE
        );
        TtcAlertFeed emptyFeed = new TtcAlertFeed(feed.lastUpdated(), List.of(), List.of());
        when(store.upsertSource("subway-closures", websiteFetched, NOW))
            .thenReturn("subway-closures:ttc-ca-closure-one");
        when(normalizer.normalizeRoute(websiteFetched))
            .thenReturn(NormalizationResult.matched(websiteClosure));

        FeedApplicationCounts counts = service.apply(
            emptyFeed,
            new TtcSubwayClosureSnapshot(true, List.of(websiteFetched))
        );

        verify(store).upsertRouteAlert(websiteClosure, NOW);
        verify(store).deactivateMissingSources(
            Set.of("subway-closures:ttc-ca-closure-one"),
            Set.of("subway-closures")
        );
        verify(store).deactivateMissingWebsiteAdvisories(
            Set.of("ttc-ca-closure-one"),
            NOW
        );
        assertThat(counts).isEqualTo(new FeedApplicationCounts(1, 1, 1, 0));
    }

    @Test
    void unavailableWebsiteSupplementLeavesLastGoodWebsiteRowsUntouched() {
        TtcAlertFeed emptyFeed = new TtcAlertFeed(feed.lastUpdated(), List.of(), List.of());

        service.apply(emptyFeed, TtcSubwayClosureSnapshot.unavailable());

        verify(store, never()).deactivateMissingWebsiteAdvisories(any(), eq(NOW));
    }

    @Test
    void matchesWebsiteAndLiveClosuresOnlyWhenLineBoundsAndWindowsOverlap() {
        NormalizedRouteAlert live = plannedClosure("live", "Planned");
        NormalizedRouteAlert website = plannedClosure(
            "website",
            TtcSubwayClosureParser.SOURCE_ALERT_TYPE
        );

        assertThat(TtcAlertFeedApplicationService.sameAdvisory(
            live,
            website,
            OffsetDateTime.parse("2026-08-31T23:59:30-04:00")
        )).isTrue();
    }

    @Test
    void matchesCurrentLiveSuspensionToTheWebsiteClosureWindowButNotBeforeItStarts() {
        NormalizedRouteAlert live = suspension("live");
        NormalizedRouteAlert website = plannedClosure(
            "website",
            TtcSubwayClosureParser.SOURCE_ALERT_TYPE
        );

        assertThat(TtcAlertFeedApplicationService.sameAdvisory(
            live,
            website,
            OffsetDateTime.parse("2026-08-31T23:59:30-04:00")
        )).isTrue();
        assertThat(TtcAlertFeedApplicationService.sameAdvisory(
            live,
            website,
            OffsetDateTime.parse("2026-08-31T21:00:00-04:00")
        )).isFalse();
    }

    @Test
    void matchesNonClosureAdvisoriesByImpactScopeAndCurrentWindow() {
        NormalizedRouteAlert feedDelay = delay("feed-delay", "Live");
        NormalizedRouteAlert websiteDelay = delay(
            "website-delay",
            TtcSubwayClosureParser.SOURCE_ALERT_TYPE
        );

        assertThat(TtcAlertFeedApplicationService.sameAdvisory(
            feedDelay,
            websiteDelay,
            OffsetDateTime.parse("2026-08-31T23:59:30-04:00")
        )).isTrue();
    }

    @Test
    void prefersMatchingLiveClosureAndDeactivatesTheWebsiteProjection() {
        TtcFetchedRecord liveFetched = fetchedRoute("live-closure");
        TtcFetchedRecord websiteFetched = fetchedRoute("website-closure");
        NormalizedRouteAlert liveClosure = plannedClosure("live-closure", "Planned");
        NormalizedRouteAlert websiteClosure = plannedClosure(
            "website-closure",
            TtcSubwayClosureParser.SOURCE_ALERT_TYPE
        );
        TtcAlertFeed liveFeed = new TtcAlertFeed(
            feed.lastUpdated(),
            List.of(liveFetched),
            List.of()
        );
        when(store.upsertSource("routes", liveFetched, NOW))
            .thenReturn("routes:live-closure");
        when(store.upsertSource("subway-closures", websiteFetched, NOW))
            .thenReturn("subway-closures:website-closure");
        when(normalizer.normalizeRoute(liveFetched))
            .thenReturn(NormalizationResult.matched(liveClosure));
        when(normalizer.normalizeRoute(websiteFetched))
            .thenReturn(NormalizationResult.matched(websiteClosure));

        FeedApplicationCounts counts = service.apply(
            liveFeed,
            new TtcSubwayClosureSnapshot(true, List.of(websiteFetched))
        );

        verify(store).upsertRouteAlert(liveClosure, NOW);
        verify(store, never()).upsertRouteAlert(websiteClosure, NOW);
        verify(store).deactivateMissingWebsiteAdvisories(Set.of(), NOW);
        assertThat(counts).isEqualTo(new FeedApplicationCounts(2, 2, 1, 0));
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

    private NormalizedRouteAlert plannedClosure(String sourceId, String sourceType) {
        OffsetDateTime startsAt = OffsetDateTime.parse("2026-08-31T23:59:00-04:00");
        OffsetDateTime endsAt = OffsetDateTime.parse("2026-09-01T06:00:00-04:00");
        return new NormalizedRouteAlert(
            "ttc-route-" + sourceId,
            sourceId,
            "line-2",
            "planned-closure",
            "planned",
            "Line 2 closure",
            "Planned track work",
            sourceType,
            "NO_SERVICE",
            "Subway closure",
            AlertDirection.BIDIRECTIONAL,
            "MAINTENANCE",
            "Closure - Planned Track Work",
            null,
            AlertImpactKind.PLANNED_CLOSURE,
            null,
            null,
            null,
            null,
            null,
            "st-george",
            "broadview",
            startsAt,
            endsAt,
            null,
            "Will Operate",
            "St George",
            "Broadview",
            "{}",
            List.of("st-george", "broadview"),
            List.of(new NormalizedAlertPeriod("window", startsAt, endsAt, 0)),
            sourceId + "-fingerprint"
        );
    }

    private NormalizedRouteAlert suspension(String sourceId) {
        NormalizedRouteAlert closure = plannedClosure(sourceId, "Live");
        return new NormalizedRouteAlert(
            closure.id(),
            closure.sourceId(),
            closure.lineId(),
            "active-alert",
            "suspension",
            closure.title(),
            closure.description(),
            closure.sourceAlertType(),
            closure.effect(),
            closure.effectDescription(),
            closure.direction(),
            closure.cause(),
            closure.causeDescription(),
            closure.targetRemoval(),
            AlertImpactKind.SUSPENSION,
            closure.rszLength(),
            closure.stationDistance(),
            closure.trackPercent(),
            closure.reducedSpeed(),
            closure.averageSpeed(),
            closure.startStationId(),
            closure.endStationId(),
            closure.activePeriodStart(),
            closure.activePeriodEnd(),
            closure.sourceUpdatedAt(),
            closure.shuttleType(),
            closure.shuttleStart(),
            closure.shuttleEnd(),
            closure.rawPayload(),
            closure.stationIds(),
            closure.periods(),
            closure.fingerprint()
        );
    }

    private NormalizedRouteAlert delay(String sourceId, String sourceType) {
        NormalizedRouteAlert closure = plannedClosure(sourceId, sourceType);
        return new NormalizedRouteAlert(
            closure.id(),
            closure.sourceId(),
            closure.lineId(),
            "active-alert",
            "delay",
            "Line 2 delays",
            "Delays between St George and Broadview stations.",
            closure.sourceAlertType(),
            "SIGNIFICANT_DELAYS",
            "Delays",
            closure.direction(),
            null,
            null,
            closure.targetRemoval(),
            AlertImpactKind.DELAY,
            closure.rszLength(),
            closure.stationDistance(),
            closure.trackPercent(),
            closure.reducedSpeed(),
            closure.averageSpeed(),
            closure.startStationId(),
            closure.endStationId(),
            closure.activePeriodStart(),
            closure.activePeriodEnd(),
            closure.sourceUpdatedAt(),
            null,
            null,
            null,
            closure.rawPayload(),
            closure.stationIds(),
            closure.periods(),
            closure.fingerprint()
        );
    }
}
