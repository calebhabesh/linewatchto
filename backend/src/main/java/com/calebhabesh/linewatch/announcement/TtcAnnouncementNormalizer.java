package com.calebhabesh.linewatch.announcement;

import com.calebhabesh.linewatch.ingestion.TtcAlertRecord;
import com.calebhabesh.linewatch.ingestion.TtcFetchedRecord;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Locale;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class TtcAnnouncementNormalizer {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    public Optional<TtcAnnouncement> normalize(TtcFetchedRecord fetched, String scope) {
        if (fetched == null || fetched.record() == null || !validScope(scope)) {
            return Optional.empty();
        }

        TtcAlertRecord record = fetched.record();
        String recordId = clean(record.id());
        if (recordId == null) {
            return Optional.empty();
        }

        String sourceTitle = clean(record.title());
        String customHeader = clean(record.customHeaderText());
        String header = clean(record.headerText());
        String description = clean(record.description());
        boolean placeholderTitle = sourceTitle == null
            || "website_banner".equals(sourceTitle.toLowerCase(Locale.ROOT));
        String title = placeholderTitle ? "System announcement" : sourceTitle;
        String body = firstNonBlank(customHeader, description, header, placeholderTitle ? null : sourceTitle);
        if (body == null) {
            return Optional.empty();
        }
        if (body.equals(title)) {
            body = "";
        }

        OffsetDateTime start = record.activePeriod() == null
            ? null
            : sourceTimeToInstant(record.activePeriod().start());
        OffsetDateTime end = record.activePeriod() == null
            ? null
            : sourceTimeToInstant(record.activePeriod().end());

        String sourceId = scope + ":" + recordId;
        return Optional.of(new TtcAnnouncement(
            "ttc-announcement-" + safeId(sourceId),
            sourceId,
            scope,
            title,
            body,
            clean(record.url()),
            start,
            end,
            sourceTimeToInstant(record.lastUpdated()),
            fetched.rawPayload()
        ));
    }

    private boolean validScope(String scope) {
        return "site-wide".equals(scope) || "general".equals(scope);
    }

    private OffsetDateTime sourceTimeToInstant(OffsetDateTime value) {
        if (value == null || value.getYear() <= 1) {
            return null;
        }
        return value.toLocalDateTime()
            .atZone(TORONTO_ZONE)
            .toOffsetDateTime()
            .withOffsetSameInstant(java.time.ZoneOffset.UTC);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            String cleaned = clean(value);
            if (cleaned != null) {
                return cleaned;
            }
        }
        return null;
    }

    private String clean(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private String safeId(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_-]+", "-");
    }
}
