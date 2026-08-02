package com.calebhabesh.linewatch.announcement;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.ingestion.TtcAlertActivePeriod;
import com.calebhabesh.linewatch.ingestion.TtcAlertRecord;
import com.calebhabesh.linewatch.ingestion.TtcFetchedRecord;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class TtcAnnouncementNormalizerTest {
    private final TtcAnnouncementNormalizer normalizer = new TtcAnnouncementNormalizer();

    @Test
    void normalizesWebsiteBannerAsInformationalSiteWideAnnouncement() {
        TtcFetchedRecord fetched = fetched(
            "banner-1",
            "WEBSITE_BANNER",
            "The station entrance is temporarily closed.",
            "https://www.ttc.ca/service-advisories"
        );

        TtcAnnouncement announcement = normalizer.normalize(fetched, "site-wide").orElseThrow();

        assertThat(announcement.id()).isEqualTo("ttc-announcement-site-wide-banner-1");
        assertThat(announcement.sourceId()).isEqualTo("site-wide:banner-1");
        assertThat(announcement.title()).isEqualTo("System announcement");
        assertThat(announcement.description()).isEqualTo("The station entrance is temporarily closed.");
        assertThat(announcement.activePeriodStart()).isEqualTo("2026-06-01T14:00:00Z");
    }

    @Test
    void rejectsRecordsWithoutRiderVisibleCopy() {
        TtcFetchedRecord fetched = fetched("empty", "WEBSITE_BANNER", null, null);

        assertThat(normalizer.normalize(fetched, "general")).isEmpty();
    }

    private TtcFetchedRecord fetched(String id, String title, String description, String url) {
        TtcAlertRecord record = new TtcAlertRecord(
            id,
            "SiteWide",
            OffsetDateTime.parse("2026-06-01T10:05:00-04:00"),
            new TtcAlertActivePeriod(OffsetDateTime.parse("2026-06-01T10:00:00-04:00"), null),
            List.of("Current"),
            null,
            null,
            null,
            null,
            List.of(),
            title,
            description,
            null,
            url,
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
            null,
            null,
            List.of()
        );
        return new TtcFetchedRecord(record, "{\"id\":\"" + id + "\"}");
    }
}
