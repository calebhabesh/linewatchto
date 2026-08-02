package com.calebhabesh.linewatch.announcement;

import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;

@Service
public class TtcAnnouncementService {
    public static final String LIVE_ALERTS_SOURCE = "TTC Live Alerts announcements";
    public static final String COMBINED_SOURCE = "TTC Live Alerts and TTC.ca Updates";

    private final TtcAnnouncementReadRepository repository;
    private final IngestionFreshness ingestionFreshness;
    private final TtcUpdatesService updatesService;
    private final Clock clock;

    public TtcAnnouncementService(
        TtcAnnouncementReadRepository repository,
        IngestionFreshness ingestionFreshness,
        TtcUpdatesService updatesService,
        Clock clock
    ) {
        this.repository = repository;
        this.ingestionFreshness = ingestionFreshness;
        this.updatesService = updatesService;
        this.clock = clock;
    }

    public TtcAnnouncementResponses.Response getAnnouncements(String query, Integer limit) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        boolean liveAlertsFresh = ingestionFreshness.isDashboardFresh();
        TtcUpdatesService.Snapshot updates = updatesService.current();

        String normalizedQuery = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        int finalLimit = limit == null ? 100 : Math.max(0, Math.min(limit, 250));
        List<TtcAnnouncementResponses.Detail> liveAnnouncements = liveAlertsFresh
            ? repository.findActive().stream().map(this::toDetail).toList()
            : List.of();
        List<TtcAnnouncementResponses.Detail> announcements = java.util.stream.Stream
            .concat(liveAnnouncements.stream(), updates.announcements().stream())
            .filter(announcement -> normalizedQuery.isBlank() || matches(announcement, normalizedQuery))
            .limit(finalLimit)
            .toList();
        boolean fresh = liveAlertsFresh || updates.available();
        String source = liveAlertsFresh && updates.available()
            ? COMBINED_SOURCE
            : updates.available() ? TtcUpdatesService.SOURCE : LIVE_ALERTS_SOURCE;
        return new TtcAnnouncementResponses.Response(now, fresh, source, announcements);
    }

    private boolean matches(TtcAnnouncementResponses.Detail announcement, String query) {
        return contains(announcement.title(), query)
            || contains(announcement.description(), query)
            || contains(announcement.scope(), query)
            || contains(announcement.source(), query);
    }

    private boolean contains(String value, String query) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(query);
    }

    private TtcAnnouncementResponses.Detail toDetail(TtcAnnouncement announcement) {
        return new TtcAnnouncementResponses.Detail(
            announcement.id(),
            announcement.scope(),
            announcement.title(),
            announcement.description(),
            announcement.url(),
            announcement.activePeriodStart(),
            announcement.activePeriodEnd(),
            announcement.sourceUpdatedAt(),
            LIVE_ALERTS_SOURCE
        );
    }
}
