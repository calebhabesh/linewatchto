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
        OffsetDateTime now = OffsetDateTime.now(clock);
        Set<String> seenSourceKeys = new HashSet<>();
        Set<String> seenAlertSourceIds = new HashSet<>();
        Set<String> seenOutageSourceIds = new HashSet<>();
        Set<String> seenNoticeSourceIds = new HashSet<>();
        Set<String> seenAnnouncementSourceIds = new HashSet<>();
        List<NormalizedRouteAlert> routeCandidates = new ArrayList<>();
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
        for (NormalizedRouteAlert alert : reconciledRouteCandidates) {
            boolean duplicateGtfsRt = isGtfsRt(alert)
                && liveAlerts.stream().anyMatch(
                    live -> duplicateMatcher.isGtfsRtDuplicateOfLive(alert, live)
                );
            if (!duplicateGtfsRt) {
                store.upsertRouteAlert(alert, now);
                seenAlertSourceIds.add(alert.sourceId());
                normalized++;
            }
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

        store.deactivateMissingSources(seenSourceKeys);
        store.deactivateMissingAlerts(seenAlertSourceIds, now);
        store.deactivateMissingAccessibilityOutages(seenOutageSourceIds, now);
        surfaceStore.deactivateMissingNotices(seenNoticeSourceIds, now);
        announcementStore.deactivateMissing(seenAnnouncementSourceIds, now);

        return new FeedApplicationCounts(
            feed.fetchedCount(),
            seenSourceKeys.size(),
            normalized,
            unmatched
        );
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
