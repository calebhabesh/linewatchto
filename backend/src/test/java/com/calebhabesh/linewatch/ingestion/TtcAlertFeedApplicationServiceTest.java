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
        service = new TtcAlertFeedApplicationService(store, normalizer, surfaceNormalizer, surfaceStore, CLOCK);
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
}
