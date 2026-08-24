package com.calebhabesh.linewatch.ingestion;

import com.calebhabesh.linewatch.announcement.TtcAnnouncement;
import com.calebhabesh.linewatch.announcement.TtcAnnouncementNormalizer;
import com.calebhabesh.linewatch.announcement.TtcAnnouncementStore;
import com.calebhabesh.linewatch.surface.SurfaceServiceNotice;
import com.calebhabesh.linewatch.surface.SurfaceServiceNoticeNormalizer;
import com.calebhabesh.linewatch.surface.SurfaceServiceNoticeStore;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TtcAlertFeedApplicationService {
    private static final String WEBSITE_ADVISORY_SECTION = "subway-closures";
    private static final Set<String> LIVE_SOURCE_SECTIONS = Set.of(
        "routes",
        "accessibility",
        "site-wide-announcements",
        "general-announcements"
    );
    private final TtcAlertStore store;
    private final TtcAlertNormalizer normalizer;
    private final RapidTransitAlertDuplicateMatcher duplicateMatcher;
    private final SurfaceServiceNoticeNormalizer surfaceNormalizer;
    private final SurfaceServiceNoticeStore surfaceStore;
    private final TtcAnnouncementNormalizer announcementNormalizer;
    private final TtcAnnouncementStore announcementStore;
    private final Clock clock;

    public TtcAlertFeedApplicationService(
        TtcAlertStore store,
        TtcAlertNormalizer normalizer,
        RapidTransitAlertDuplicateMatcher duplicateMatcher,
        SurfaceServiceNoticeNormalizer surfaceNormalizer,
        SurfaceServiceNoticeStore surfaceStore,
        TtcAnnouncementNormalizer announcementNormalizer,
        TtcAnnouncementStore announcementStore,
        Clock clock
    ) {
        this.store = store;
        this.normalizer = normalizer;
        this.duplicateMatcher = duplicateMatcher;
        this.surfaceNormalizer = surfaceNormalizer;
        this.surfaceStore = surfaceStore;
        this.announcementNormalizer = announcementNormalizer;
        this.announcementStore = announcementStore;
        this.clock = clock;
    }

    @Transactional
    public FeedApplicationCounts apply(TtcAlertFeed feed) {
        return apply(feed, TtcSubwayClosureSnapshot.unavailable());
    }

    @Transactional
    public FeedApplicationCounts apply(
        TtcAlertFeed feed,
        TtcSubwayClosureSnapshot subwayClosures
    ) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        Set<String> seenSourceKeys = new HashSet<>();
        Set<String> seenAlertSourceIds = new HashSet<>();
        Set<String> seenOutageSourceIds = new HashSet<>();
        Set<String> seenNoticeSourceIds = new HashSet<>();
        Set<String> seenAnnouncementSourceIds = new HashSet<>();
        List<NormalizedRouteAlert> routeCandidates = new ArrayList<>();
        Set<String> seenWebsiteSourceKeys = new HashSet<>();
        Set<String> seenWebsiteAlertSourceIds = new HashSet<>();
        int normalized = 0;
        int unmatched = 0;

        for (TtcFetchedRecord fetched : feed.routes()) {
            seenSourceKeys.add(store.upsertSource("routes", fetched, now));

            // Rapid transit alerts
            NormalizationResult<NormalizedRouteAlert> result =
                normalizer.normalizeRoute(fetched);
            if (result.shouldPersist()) {
                routeCandidates.add(result.projection().orElseThrow());
            }
            if (result.countsAsUnmatched()) {
                unmatched++;
            }

            // Surface service notices
            Optional<SurfaceServiceNotice> noticeOpt = surfaceNormalizer.normalize(fetched);
            if (noticeOpt.isPresent()) {
                SurfaceServiceNotice notice = noticeOpt.get();
                surfaceStore.upsertNotice(notice, now);
                seenNoticeSourceIds.add(notice.sourceId());
            }
        }

        List<NormalizedRouteAlert> reconciledRouteCandidates =
            TtcPlannedClosureWindowReconciler.reconcile(routeCandidates, now);
        List<NormalizedRouteAlert> liveAlerts = reconciledRouteCandidates.stream()
            .filter(alert -> !isGtfsRt(alert))
            .toList();
        List<NormalizedRouteAlert> persistedFeedAlerts = new ArrayList<>();
        for (NormalizedRouteAlert alert : reconciledRouteCandidates) {
            boolean duplicateGtfsRt = isGtfsRt(alert)
                && liveAlerts.stream().anyMatch(
                    live -> duplicateMatcher.isGtfsRtDuplicateOfLive(alert, live)
                );
            if (!duplicateGtfsRt) {
                store.upsertRouteAlert(alert, now);
                seenAlertSourceIds.add(alert.sourceId());
                persistedFeedAlerts.add(alert);
                normalized++;
            }
        }

        if (subwayClosures.available()) {
            List<NormalizedRouteAlert> websiteCandidates = new ArrayList<>();
            for (TtcFetchedRecord fetched : subwayClosures.records()) {
                seenWebsiteSourceKeys.add(store.upsertSource(WEBSITE_ADVISORY_SECTION, fetched, now));
                NormalizationResult<NormalizedRouteAlert> result = normalizer.normalizeRoute(fetched);
                if (result.shouldPersist()) {
                    websiteCandidates.add(result.projection().orElseThrow());
                }
                if (result.countsAsUnmatched()) {
                    unmatched++;
                }
            }
            for (NormalizedRouteAlert websiteAlert
                : TtcPlannedClosureWindowReconciler.reconcile(websiteCandidates, now)) {
                boolean coveredByFeed = persistedFeedAlerts.stream()
                    .anyMatch(feedAlert -> sameAdvisory(feedAlert, websiteAlert, now));
                if (!coveredByFeed) {
                    store.upsertRouteAlert(websiteAlert, now);
                    seenWebsiteAlertSourceIds.add(websiteAlert.sourceId());
                    normalized++;
                }
            }
            store.deactivateMissingSources(
                seenWebsiteSourceKeys,
                Set.of(WEBSITE_ADVISORY_SECTION)
            );
            store.deactivateMissingWebsiteAdvisories(seenWebsiteAlertSourceIds, now);
        }

        for (TtcFetchedRecord fetched : feed.accessibility()) {
            seenSourceKeys.add(store.upsertSource("accessibility", fetched, now));
            NormalizationResult<NormalizedAccessibilityOutage> result =
                normalizer.normalizeAccessibility(fetched);
            if (result.shouldPersist()) {
                NormalizedAccessibilityOutage outage = result.projection().orElseThrow();
                store.upsertAccessibilityOutage(outage, now);
                seenOutageSourceIds.add(outage.sourceId());
                normalized++;
            }
            if (result.countsAsUnmatched()) {
                unmatched++;
            }
        }

        normalized += applyAnnouncements(
            feed.siteWideAnnouncements(),
            "site-wide",
            "site-wide-announcements",
            seenSourceKeys,
            seenAnnouncementSourceIds,
            now
        );
        normalized += applyAnnouncements(
            feed.generalAnnouncements(),
            "general",
            "general-announcements",
            seenSourceKeys,
            seenAnnouncementSourceIds,
            now
        );

        store.deactivateMissingSources(seenSourceKeys, LIVE_SOURCE_SECTIONS);
        store.deactivateMissingAlerts(seenAlertSourceIds, now);
        store.deactivateMissingAccessibilityOutages(seenOutageSourceIds, now);
        surfaceStore.deactivateMissingNotices(seenNoticeSourceIds, now);
        announcementStore.deactivateMissing(seenAnnouncementSourceIds, now);

        return new FeedApplicationCounts(
            feed.fetchedCount() + (subwayClosures.available() ? subwayClosures.records().size() : 0),
            seenSourceKeys.size() + seenWebsiteSourceKeys.size(),
            normalized,
            unmatched
        );
    }

    static boolean sameAdvisory(
        NormalizedRouteAlert feedAlert,
        NormalizedRouteAlert websiteAlert,
        OffsetDateTime now
    ) {
        if (feedAlert == null || websiteAlert == null
            || feedAlert.impactKind() == null || websiteAlert.impactKind() == null
            || !java.util.Objects.equals(feedAlert.lineId(), websiteAlert.lineId())) {
            return false;
        }
        if (!sameScope(feedAlert, websiteAlert)) {
            return false;
        }

        boolean activeClosureCopy = websiteAlert.impactKind() == AlertImpactKind.PLANNED_CLOSURE
            && feedAlert.impactKind() == AlertImpactKind.SUSPENSION;
        if (activeClosureCopy) {
            boolean feedIsCurrent = feedAlert.periods().stream()
                .anyMatch(feedPeriod -> contains(feedPeriod, now));
            return feedIsCurrent && websiteAlert.periods().stream()
                .anyMatch(websitePeriod -> contains(websitePeriod, now));
        }

        if (feedAlert.impactKind() != websiteAlert.impactKind()) {
            return false;
        }
        boolean overlappingPeriod = feedAlert.periods().stream().anyMatch(feedPeriod ->
            websiteAlert.periods().stream().anyMatch(websitePeriod ->
                periodsOverlap(feedPeriod, websitePeriod)
            )
        );
        if (overlappingPeriod) {
            return true;
        }
        boolean feedIsCurrent = feedAlert.periods().stream()
            .anyMatch(feedPeriod -> contains(feedPeriod, now));
        boolean websiteIsCurrent = websiteAlert.periods().stream()
            .anyMatch(websitePeriod -> contains(websitePeriod, now));
        return feedIsCurrent && websiteIsCurrent;
    }

    private static boolean periodsOverlap(
        NormalizedAlertPeriod first,
        NormalizedAlertPeriod second
    ) {
        if (first.startsAt() == null || first.endsAt() == null
            || second.startsAt() == null || second.endsAt() == null) {
            return false;
        }
        return first.startsAt().isBefore(second.endsAt())
            && second.startsAt().isBefore(first.endsAt());
    }

    private static boolean sameScope(
        NormalizedRouteAlert first,
        NormalizedRouteAlert second
    ) {
        if (first.startStationId() != null && first.endStationId() != null
            && second.startStationId() != null && second.endStationId() != null) {
            boolean sameBounds = java.util.Objects.equals(
                first.startStationId(),
                second.startStationId()
            ) && java.util.Objects.equals(first.endStationId(), second.endStationId());
            boolean reversedBounds = java.util.Objects.equals(
                first.startStationId(),
                second.endStationId()
            ) && java.util.Objects.equals(first.endStationId(), second.startStationId());
            if (sameBounds || reversedBounds) {
                return true;
            }
        }

        Set<String> firstStations = first.stationIds() == null
            ? Set.of()
            : Set.copyOf(first.stationIds());
        Set<String> secondStations = second.stationIds() == null
            ? Set.of()
            : Set.copyOf(second.stationIds());
        return !firstStations.isEmpty() && firstStations.equals(secondStations);
    }

    private static boolean contains(NormalizedAlertPeriod period, OffsetDateTime instant) {
        return (period.startsAt() == null || !instant.isBefore(period.startsAt()))
            && (period.endsAt() == null || instant.isBefore(period.endsAt()));
    }

    private int applyAnnouncements(
        List<TtcFetchedRecord> records,
        String scope,
        String sourceSection,
        Set<String> seenSourceKeys,
        Set<String> seenAnnouncementSourceIds,
        OffsetDateTime now
    ) {
        int normalized = 0;
        for (TtcFetchedRecord fetched : records) {
            seenSourceKeys.add(store.upsertSource(sourceSection, fetched, now));
            Optional<TtcAnnouncement> result = announcementNormalizer.normalize(fetched, scope);
            if (result.isPresent()) {
                TtcAnnouncement announcement = result.orElseThrow();
                announcementStore.upsert(announcement, now);
                seenAnnouncementSourceIds.add(announcement.sourceId());
                normalized++;
            }
        }
        return normalized;
    }

    private boolean isGtfsRt(NormalizedRouteAlert alert) {
        return "GTFS-RT".equalsIgnoreCase(alert.sourceAlertType());
    }
}
