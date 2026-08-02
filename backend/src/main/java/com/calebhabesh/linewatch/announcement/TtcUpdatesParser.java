package com.calebhabesh.linewatch.announcement;

import java.net.URI;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.stereotype.Component;

@Component
public class TtcUpdatesParser {
    public List<TtcAnnouncementResponses.Detail> parse(
        String html,
        URI sourceUri,
        int maxEntries
    ) {
        Document document = Jsoup.parse(html == null ? "" : html, sourceUri.toString());
        String expectedHost = sourceUri.getHost();
        String collectionPath = trimTrailingSlash(sourceUri.getPath()).toLowerCase(Locale.ROOT);
        Map<String, TtcAnnouncementResponses.Detail> byUrl = new LinkedHashMap<>();

        for (Element link : document.select("a[href]")) {
            String title = clean(link.text());
            String absoluteUrl = clean(link.absUrl("href"));
            if (title == null || absoluteUrl == null) {
                continue;
            }

            URI linkUri;
            try {
                linkUri = URI.create(absoluteUrl);
            } catch (IllegalArgumentException exception) {
                continue;
            }
            String linkPath = trimTrailingSlash(linkUri.getPath()).toLowerCase(Locale.ROOT);
            if (!expectedHost.equalsIgnoreCase(linkUri.getHost())
                || !linkPath.startsWith(collectionPath + "/")) {
                continue;
            }

            String normalizedUrl = URI.create(linkUri.getScheme() + "://" + linkUri.getAuthority() + linkUri.getPath()).toString();
            byUrl.putIfAbsent(normalizedUrl, new TtcAnnouncementResponses.Detail(
                idFor(linkUri.getPath(), normalizedUrl),
                "update",
                title,
                "",
                normalizedUrl,
                null,
                null,
                null,
                TtcUpdatesService.SOURCE
            ));
            if (byUrl.size() >= Math.max(1, maxEntries)) {
                break;
            }
        }

        if (byUrl.isEmpty()) {
            throw new TtcUpdatesParseException("TTC Updates page did not contain update links");
        }
        return List.copyOf(new ArrayList<>(byUrl.values()));
    }

    private String idFor(String path, String url) {
        String[] segments = path.split("/");
        String finalSegment = segments.length == 0 ? "update" : segments[segments.length - 1];
        String slug = finalSegment.toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("(^-|-$)", "");
        if (slug.isBlank()) {
            slug = "update";
        }
        return "ttc-update-" + slug + "-" + Integer.toUnsignedString(url.hashCode(), 36);
    }

    private String trimTrailingSlash(String value) {
        if (value == null || value.isBlank() || "/".equals(value)) {
            return value == null ? "" : value;
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private String clean(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.replace('\u00a0', ' ').replaceAll("\\s+", " ").trim();
    }

    public static class TtcUpdatesParseException extends RuntimeException {
        public TtcUpdatesParseException(String message) {
            super(message);
        }
    }
}
