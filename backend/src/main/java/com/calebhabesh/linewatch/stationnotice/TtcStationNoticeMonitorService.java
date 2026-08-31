package com.calebhabesh.linewatch.stationnotice;

import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorStore.KnownStation;
import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorStore.NoticeCandidate;
import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorStore.PageObservation;
import com.calebhabesh.linewatch.stationnotice.TtcStationNoticeMonitorStore.RunCompletion;
import com.calebhabesh.linewatch.stationnotice.TtcStationPageNoticeParser.DetectedNotice;
import com.calebhabesh.linewatch.stationnotice.TtcStationSitemapParser.SitemapDocument;
import com.calebhabesh.linewatch.stationnotice.TtcStationSitemapParser.StationPage;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class TtcStationNoticeMonitorService {
    private static final Logger log = LoggerFactory.getLogger(TtcStationNoticeMonitorService.class);

    private final TtcStationNoticeClient client;
    private final TtcStationSitemapParser sitemapParser;
    private final TtcStationPageNoticeParser pageParser;
    private final TtcStationNoticeMonitorStore store;
    private final TtcStationNoticeMonitorProperties properties;
    private final Clock clock;

    public TtcStationNoticeMonitorService(
        TtcStationNoticeClient client,
        TtcStationSitemapParser sitemapParser,
        TtcStationPageNoticeParser pageParser,
        TtcStationNoticeMonitorStore store,
        TtcStationNoticeMonitorProperties properties,
        Clock clock
    ) {
        this.client = client;
        this.sitemapParser = sitemapParser;
        this.pageParser = pageParser;
        this.store = store;
        this.properties = properties;
        this.clock = clock;
    }

    public void monitorNow() {
        OffsetDateTime startedAt = OffsetDateTime.now(clock);
        long runId = store.startRun(startedAt);
        Counters counters = new Counters();
        String lastError = null;
        try {
            List<StationPage> discovered = discoverStationPages();
            counters.discovered = discovered.size();
            List<MappedPage> mappedPages = mapToKnownStations(discovered);
            counters.mapped = mappedPages.size();

            boolean fetchedAny = false;
            for (MappedPage mapped : mappedPages) {
                Optional<PageObservation> previous = store.findObservation(mapped.station().id());
                if (unchangedBySitemap(previous, mapped.page())) {
                    counters.unchanged++;
                    continue;
                }
                if (fetchedAny) pauseBetweenRequests();
                fetchedAny = true;
                try {
                    inspectPage(mapped, previous, startedAt, counters);
                } catch (RuntimeException exception) {
                    counters.failures++;
                    lastError = concise(exception);
                    log.warn("Unable to inspect TTC station page for {}: {}", mapped.station().id(), lastError);
                }
            }

            String status = counters.failures == 0 ? "succeeded" : "partial";
            store.finishRun(runId, counters.finish(status, OffsetDateTime.now(clock), lastError));
        } catch (RuntimeException exception) {
            lastError = concise(exception);
            store.finishRun(runId, counters.finish("failed", OffsetDateTime.now(clock), lastError));
            throw exception;
        }
    }

    private List<StationPage> discoverStationPages() {
        URI rootUri = properties.getSitemapUrl();
        requireSafeSource(rootUri, false);
        SitemapDocument root = sitemapParser.parse(client.fetch(rootUri), rootUri);
        Map<String, StationPage> pages = new LinkedHashMap<>();
        root.stationPages().forEach(page -> pages.put(page.uri().toString(), page));

        List<URI> children = root.childSitemaps().stream()
            .filter(uri -> safeSource(uri, false))
            .limit(Math.max(0, properties.getMaxSitemaps()))
            .toList();
        for (URI child : children) {
            SitemapDocument document = sitemapParser.parse(client.fetch(child), child);
            document.stationPages().stream()
                .filter(page -> safeSource(page.uri(), true))
                .forEach(page -> pages.put(page.uri().toString(), page));
        }
        if (pages.size() > properties.getMaxStationPages()) {
            throw new IllegalStateException(
                "TTC sitemap returned " + pages.size() + " station pages, exceeding the configured limit"
            );
        }
        return pages.values().stream()
            .filter(page -> safeSource(page.uri(), true))
            .sorted(Comparator.comparing(page -> page.uri().toString()))
            .toList();
    }

    private List<MappedPage> mapToKnownStations(List<StationPage> pages) {
        Map<String, KnownStation> stationsByKey = new LinkedHashMap<>();
        for (KnownStation station : store.findKnownStations()) {
            stationsByKey.put(canonicalKey(station.name()), station);
        }
        List<MappedPage> mapped = new ArrayList<>();
        for (StationPage page : pages) {
            KnownStation station = stationsByKey.get(canonicalKey(pageSlug(page.uri())));
            if (station != null) mapped.add(new MappedPage(station, page));
        }
        return mapped;
    }

    private void inspectPage(
        MappedPage mapped,
        Optional<PageObservation> previous,
        OffsetDateTime checkedAt,
        Counters counters
    ) {
        requireSafeSource(mapped.page().uri(), true);
        String html = client.fetch(mapped.page().uri());
        counters.fetched++;
        Optional<DetectedNotice> detected = pageParser.parse(html, mapped.page().uri());
        String noticeFingerprint = detected.map(this::noticeFingerprint).orElse(null);
        String previousFingerprint = previous.map(PageObservation::noticeFingerprint).orElse(null);
        boolean noticeChanged = !java.util.Objects.equals(previousFingerprint, noticeFingerprint);
        DetectedNotice current = detected.orElse(null);
        boolean matchesReviewedBaseline = previous.isEmpty()
            && current != null
            && store.hasReviewedNoticeForSource(mapped.station().id(), current.detailUrl());

        if (noticeChanged && (previous.isPresent() || detected.isPresent()) && !matchesReviewedBaseline) {
            String changeType = previousFingerprint == null ? "added" : noticeFingerprint == null ? "removed" : "changed";
            String candidateKey = sha256(String.join("|",
                mapped.station().id(),
                changeType,
                nullToEmpty(previousFingerprint),
                nullToEmpty(noticeFingerprint)
            ));
            store.stageCandidate(new NoticeCandidate(
                candidateKey,
                mapped.station().id(),
                changeType,
                mapped.page().uri().toString(),
                mapped.page().lastModified(),
                previousFingerprint,
                noticeFingerprint,
                current == null ? null : current.text(),
                current == null ? null : current.detailUrl(),
                checkedAt,
                checkedAt
            ));
            counters.noticeChanges++;
            counters.candidates++;
        }

        store.saveObservation(new PageObservation(
            mapped.station().id(),
            mapped.page().uri().toString(),
            mapped.page().lastModified(),
            sha256(html),
            noticeFingerprint,
            current == null ? null : current.text(),
            current == null ? null : current.detailUrl(),
            previous.map(PageObservation::firstObservedAt).orElse(checkedAt),
            checkedAt
        ));
    }

    private boolean unchangedBySitemap(Optional<PageObservation> previous, StationPage page) {
        Duration fullRefreshInterval = properties.getFullRefreshInterval();
        boolean recentlyChecked = previous.isPresent()
            && fullRefreshInterval != null
            && fullRefreshInterval.isPositive()
            && previous.get().lastCheckedAt() != null
            && previous.get().lastCheckedAt().isAfter(OffsetDateTime.now(clock).minus(fullRefreshInterval));
        return previous.isPresent()
            && recentlyChecked
            && page.lastModified() != null
            && page.lastModified().equals(previous.get().sourceLastModified())
            && page.uri().toString().equals(previous.get().pageUrl());
    }

    private void pauseBetweenRequests() {
        Duration delay = properties.getRequestDelay();
        if (delay == null || delay.isZero() || delay.isNegative()) return;
        try {
            Thread.sleep(delay.toMillis());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("TTC station notice monitor was interrupted", exception);
        }
    }

    private void requireSafeSource(URI uri, boolean stationPage) {
        if (!safeSource(uri, stationPage)) {
            throw new IllegalArgumentException("Unsafe TTC station notice source URI");
        }
    }

    private boolean safeSource(URI uri, boolean stationPage) {
        URI configured = properties.getSitemapUrl();
        if (uri == null || configured == null || !"https".equalsIgnoreCase(uri.getScheme())) return false;
        if (uri.getUserInfo() != null || uri.getPort() != -1) return false;
        if (!configured.getHost().equalsIgnoreCase(uri.getHost())) return false;
        if (uri.getPath() == null) return false;
        return stationPage
            ? uri.getPath().toLowerCase(Locale.ROOT).startsWith("/subway-stations/")
            : uri.getPath().toLowerCase(Locale.ROOT).startsWith("/sitemap");
    }

    private String pageSlug(URI uri) {
        String path = uri.getPath();
        String slug = path.substring(path.lastIndexOf('/') + 1);
        return slug.toLowerCase(Locale.ROOT).replaceFirst("-station$", "");
    }

    private String canonicalKey(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private String noticeFingerprint(DetectedNotice notice) {
        return sha256(notice.title() + "\n" + notice.text() + "\n" + notice.detailUrl());
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String nullToEmpty(String value) { return value == null ? "" : value; }

    private String concise(RuntimeException exception) {
        String message = exception.getMessage();
        if (message == null || message.isBlank()) return exception.getClass().getSimpleName();
        return message.length() > 1000 ? message.substring(0, 1000) : message;
    }

    private record MappedPage(KnownStation station, StationPage page) {}

    private static final class Counters {
        int discovered;
        int mapped;
        int fetched;
        int unchanged;
        int noticeChanges;
        int candidates;
        int failures;

        RunCompletion finish(String status, OffsetDateTime completedAt, String errorMessage) {
            return new RunCompletion(
                status, completedAt, discovered, mapped, fetched, unchanged,
                noticeChanges, candidates, failures, errorMessage
            );
        }
    }
}
