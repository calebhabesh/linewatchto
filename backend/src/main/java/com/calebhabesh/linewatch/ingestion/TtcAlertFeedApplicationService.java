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
    private final IngestionSavepoints savepoints;

    public TtcAlertFeedApplicationService(
        TtcAlertStore store,
        TtcAlertNormalizer normalizer,
        RapidTransitAlertDuplicateMatcher duplicateMatcher,
        SurfaceServiceNoticeNormalizer surfaceNormalizer,
        SurfaceServiceNoticeStore surfaceStore,
        TtcAnnouncementNormalizer announcementNormalizer,
        TtcAnnouncementStore announcementStore,
        Clock clock,
        IngestionSavepoints savepoints
    ) {
        this.store = store;
        this.normalizer = normalizer;
        this.duplicateMatcher = duplicateMatcher;
        this.surfaceNormalizer = surfaceNormalizer;
        this.surfaceStore = surfaceStore;
        this.announcementNormalizer = announcementNormalizer;
        this.announcementStore = announcementStore;
        this.clock = clock;
        this.savepoints = savepoints;
    }

    @Transactional
    public FeedApplicationCounts apply(TtcAlertFeed feed) {
        return apply(feed, TtcSubwayClosureSnapshot.unavailable());
    }

    /**
     * Applies one fetched feed in one transaction. Each provider record's normalization and writes
     * run in their own savepoint: a record that fails is set aside (quarantined) with its kind,
     * source ID and cause, its last-good rows stay as they were, and the rest of the feed still
     * applies. Section-wide failures, or more quarantined records than the limit, still fail the
     * run, so a broken schema or normalizer cannot pass for fresh data. Without this, one malformed
     * provider record (Oct 19-20 and Nov 13, 2026) rolled back every poll and took the whole TTC
     * dashboard offline.
     */
    @Transactional
    public FeedApplicationCounts apply(
        TtcAlertFeed feed,
        TtcSubwayClosureSnapshot subwayClosures
    ) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        IngestionRecordIsolation isolation = new IngestionRecordIsolation("TTC", savepoints);
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

        for (TtcAlertFeed.UnparsedRecord record : feed.unparsed()) {
            isolation.reject(record.section() + " record", record.sourceId(),
                "unreadable provider record: " + record.message());
            if (!usableRecordId(record.sourceId())) {
                continue;
            }
            String sourceId = record.sourceId().strip();
            seenSourceKeys.add(record.section() + ":" + sourceId);
            switch (record.section()) {
                case TtcAlertFeed.ROUTES -> {
                    seenAlertSourceIds.add(sourceId);
                    seenNoticeSourceIds.add(sourceId);
                }
                case TtcAlertFeed.ACCESSIBILITY -> seenOutageSourceIds.add(sourceId);
                case TtcAlertFeed.SITE_WIDE_ANNOUNCEMENTS -> seenAnnouncementSourceIds.add("site-wide:" + sourceId);
                case TtcAlertFeed.GENERAL_ANNOUNCEMENTS -> seenAnnouncementSourceIds.add("general:" + sourceId);
                default -> { }
            }
        }

        for (TtcFetchedRecord fetched : feed.routes()) {
            if (!stageSource("routes", fetched, now, seenSourceKeys, isolation)) {
                continue;
            }
            String recordId = fetched.record().id();

            // Rapid transit alerts
            NormalizationResult<NormalizedRouteAlert> result =
                isolation.compute("route record", recordId, () -> normalizer.normalizeRoute(fetched));
            if (result == null) {
                // Keep this record's last-good alert rather than reading our failure as a clearance.
                keepLastGood(seenAlertSourceIds, recordId);
            } else {
                if (result.shouldPersist()) {
                    routeCandidates.add(result.projection().orElseThrow());
                }
                if (result.countsAsUnmatched()) {
                    unmatched++;
                }
            }

            // Surface service notices
            Optional<SurfaceServiceNotice> noticeOpt =
                isolation.compute("surface record", recordId, () -> surfaceNormalizer.normalize(fetched));
            if (noticeOpt == null) {
                keepLastGood(seenNoticeSourceIds, recordId);
            } else if (noticeOpt.isPresent()) {
                SurfaceServiceNotice notice = noticeOpt.get();
                seenNoticeSourceIds.add(notice.sourceId());
                isolation.run("surface notice", notice.sourceId(), () -> surfaceStore.upsertNotice(notice, now));
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
                seenAlertSourceIds.add(alert.sourceId());
                if (isolation.run("route alert", alert.sourceId(), () -> store.upsertRouteAlert(alert, now))) {
                    persistedFeedAlerts.add(alert);
                    normalized++;
                }
            }
        }

        if (subwayClosures.available()) {
            List<NormalizedRouteAlert> websiteCandidates = new ArrayList<>();
            for (TtcFetchedRecord fetched : subwayClosures.records()) {
                if (!stageSource(WEBSITE_ADVISORY_SECTION, fetched, now, seenWebsiteSourceKeys, isolation)) {
                    continue;
                }
                String recordId = fetched.record().id();
                NormalizationResult<NormalizedRouteAlert> result = isolation.compute(
                    "website advisory record", recordId, () -> normalizer.normalizeRoute(fetched));
                if (result == null) {
                    keepLastGood(seenWebsiteAlertSourceIds, recordId);
                    continue;
                }
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
                    seenWebsiteAlertSourceIds.add(websiteAlert.sourceId());
                    if (isolation.run("route alert", websiteAlert.sourceId(),
                        () -> store.upsertRouteAlert(websiteAlert, now))) {
                        normalized++;
                    }
                }
            }
            store.deactivateMissingSources(
                seenWebsiteSourceKeys,
                Set.of(WEBSITE_ADVISORY_SECTION)
            );
            store.deactivateMissingWebsiteAdvisories(seenWebsiteAlertSourceIds, now);
        }

        for (TtcFetchedRecord fetched : feed.accessibility()) {
            if (!stageSource("accessibility", fetched, now, seenSourceKeys, isolation)) {
                continue;
            }
            String recordId = fetched.record().id();
            NormalizationResult<NormalizedAccessibilityOutage> result = isolation.compute(
                "accessibility record", recordId, () -> normalizer.normalizeAccessibility(fetched));
            if (result == null) {
                keepLastGood(seenOutageSourceIds, recordId);
                continue;
            }
            if (result.shouldPersist()) {
                NormalizedAccessibilityOutage outage = result.projection().orElseThrow();
                seenOutageSourceIds.add(outage.sourceId());
                if (isolation.run("accessibility outage", outage.sourceId(),
                    () -> store.upsertAccessibilityOutage(outage, now))) {
                    normalized++;
                }
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
            now,
            isolation
        );
        normalized += applyAnnouncements(
            feed.generalAnnouncements(),
            "general",
            "general-announcements",
            seenSourceKeys,
            seenAnnouncementSourceIds,
            now,
            isolation
        );

        int attempted = feed.fetchedCount()
            + (subwayClosures.available() ? subwayClosures.records().size() : 0);
        isolation.failIfTooMany(attempted);

        store.deactivateMissingSources(seenSourceKeys, LIVE_SOURCE_SECTIONS);
        store.deactivateMissingAlerts(seenAlertSourceIds, now);
        store.deactivateMissingAccessibilityOutages(seenOutageSourceIds, now);
        surfaceStore.deactivateMissingNotices(seenNoticeSourceIds, now);
        announcementStore.deactivateMissing(seenAnnouncementSourceIds, now);

        return new FeedApplicationCounts(
            feed.fetchedCount() + (subwayClosures.available() ? subwayClosures.records().size() : 0),
            seenSourceKeys.size() + seenWebsiteSourceKeys.size(),
            normalized,
            unmatched,
            isolation.quarantined()
        );
    }

    /**
     * Stages the raw record and reports whether it can be applied. A record without a usable ID
     * cannot be upserted or tracked between polls, so it is quarantined before any write.
     */
    private boolean stageSource(
        String section,
        TtcFetchedRecord fetched,
        OffsetDateTime now,
        Set<String> seenSourceKeys,
        IngestionRecordIsolation isolation
    ) {
        String recordId = fetched.record().id();
        if (!usableRecordId(recordId)) {
            isolation.reject(section + " record", recordId, recordId == null || recordId.isBlank()
                ? "provider record has no id"
                : "provider record id is " + recordId.strip().length() + " characters (limit " + MAX_RECORD_ID_LENGTH + ")");
            return false;
        }
        // The key is derived from the record, so a failed staging write still keeps its last-good row active.
        String sourceKey = TtcAlertStore.sourceKey(section, fetched);
        seenSourceKeys.add(sourceKey);
        isolation.run("source record", sourceKey, () -> store.upsertSource(section, fetched, now));
        return true;
    }

    // Every table keyed by a TTC record ID allows at least 100 characters once its prefix
    // ("ttc-route-", "ttc-surface-", "general:") is added; real TTC IDs are short numbers.
    static final int MAX_RECORD_ID_LENGTH = 100;

    private static boolean usableRecordId(String recordId) {
        return recordId != null && !recordId.isBlank() && recordId.strip().length() <= MAX_RECORD_ID_LENGTH;
    }

    private static void keepLastGood(Set<String> seenSourceIds, String sourceId) {
        if (sourceId != null && !sourceId.isBlank()) {
            seenSourceIds.add(sourceId.trim());
        }
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
        OffsetDateTime now,
        IngestionRecordIsolation isolation
    ) {
        int normalized = 0;
        for (TtcFetchedRecord fetched : records) {
            if (!stageSource(sourceSection, fetched, now, seenSourceKeys, isolation)) {
                continue;
            }
            String recordId = fetched.record().id();
            Optional<TtcAnnouncement> result = isolation.compute(
                "announcement record", recordId, () -> announcementNormalizer.normalize(fetched, scope));
            if (result == null) {
                if (recordId != null && !recordId.isBlank()) {
                    seenAnnouncementSourceIds.add(scope + ":" + recordId.trim());
                }
                continue;
            }
            if (result.isPresent()) {
                TtcAnnouncement announcement = result.orElseThrow();
                seenAnnouncementSourceIds.add(announcement.sourceId());
                if (isolation.run("announcement", announcement.sourceId(),
                    () -> announcementStore.upsert(announcement, now))) {
                    normalized++;
                }
            }
        }
        return normalized;
    }

    private boolean isGtfsRt(NormalizedRouteAlert alert) {
        return "GTFS-RT".equalsIgnoreCase(alert.sourceAlertType());
    }
}
