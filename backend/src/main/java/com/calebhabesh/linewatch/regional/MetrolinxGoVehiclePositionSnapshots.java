package com.calebhabesh.linewatch.regional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * One shared, briefly cached read of the GO GTFS-RT VehiclePosition feed (plan 13, S9). GO
 * estimated train markers and live GO bus positions both read it, so one upstream read serves
 * both; each judges its own vehicles and freshness. Nothing reads it on a schedule: with nobody
 * asking for trains or buses, nothing is fetched.
 *
 * A failed fetch keeps serving the last good read while its feed timestamp is recent, as
 * {@link MetrolinxTripUpdateSnapshots} does.
 */
@Component
public class MetrolinxGoVehiclePositionSnapshots {
    static final String GO_PATH = "api/V1/Gtfs/Feed/VehiclePosition";
    public static final String GO_SOURCE = "Metrolinx GO GTFS-RT VehiclePosition";
    /** The train markers' cache period: one read per window serves trains and buses. */
    static final Duration CACHE_TTL = Duration.ofSeconds(10);
    /** The oldest feed snapshot still served after failed fetches. */
    static final Duration LAST_GOOD_MAX_AGE = Duration.ofMinutes(2);

    private record Entry(JsonNode feed, OffsetDateTime checkedAt) {}

    private final MetrolinxFeedFetcher fetcher;
    private final Clock clock;
    private final AtomicReference<Entry> current = new AtomicReference<>();
    private final Object lock = new Object();

    public MetrolinxGoVehiclePositionSnapshots(MetrolinxFeedFetcher fetcher, Clock clock) {
        this.fetcher = fetcher;
        this.clock = clock;
    }

    /** The latest GO VehiclePosition read (trains and buses), or a failure with no recent last-good read. */
    public JsonNode go() {
        Entry entry = current.get();
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (entry != null && entry.checkedAt().plus(CACHE_TTL).isAfter(now)) return entry.feed();
        synchronized (lock) {
            entry = current.get();
            now = OffsetDateTime.now(clock);
            if (entry != null && entry.checkedAt().plus(CACHE_TTL).isAfter(now)) return entry.feed();
            try {
                JsonNode feed = fetcher.fetch(GO_PATH, GO_SOURCE);
                current.set(new Entry(feed, now));
                return feed;
            } catch (MetrolinxClientException failure) {
                OffsetDateTime lastSource = entry == null ? null : feedTimestamp(entry.feed());
                if (lastSource != null && Duration.between(lastSource, now).compareTo(LAST_GOOD_MAX_AGE) <= 0) {
                    // Wait a full cache period before trying again.
                    current.set(new Entry(entry.feed(), now));
                    return entry.feed();
                }
                throw failure;
            }
        }
    }

    static OffsetDateTime feedTimestamp(JsonNode root) {
        JsonNode value = root == null ? null : root.path("header").get("timestamp");
        return value == null || !value.canConvertToLong() ? null
            : OffsetDateTime.ofInstant(Instant.ofEpochSecond(value.asLong()), ZoneOffset.UTC);
    }
}
